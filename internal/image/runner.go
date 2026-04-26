package image

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/432539/gpt2api/internal/config"
	"github.com/432539/gpt2api/internal/imagestore"
	"github.com/432539/gpt2api/internal/scheduler"
	"github.com/432539/gpt2api/internal/settings"
	"github.com/432539/gpt2api/internal/upstream/chatgpt"
	"github.com/432539/gpt2api/pkg/logger"
)

type runnerAttemptFunc func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error)

// QuotaDecrementor 允许 Runner 在生图成功后立即扣减账号剩余额度,
// 无需等待下一次后台探测即可在前端看到正确数字。
type QuotaDecrementor interface {
	DecrQuota(ctx context.Context, accountID uint64, n int) error
}

type runnerDAO interface {
	MarkRunning(ctx context.Context, taskID string, accountID uint64) error
	SetAccount(ctx context.Context, taskID string, accountID uint64) error
	MarkSuccess(ctx context.Context, taskID, convID string, fileIDs, resultURLs, thumbURLs []string, storageMode string, creditCost int64) error
	MarkFailed(ctx context.Context, taskID, errorCode string) error
}

type runnerImageStore interface {
	SaveTaskImages(ctx context.Context, taskID string, images []imagestore.SourceImage) ([]imagestore.SavedImage, error)
}

type runnerSettings interface {
	ImageStorageMode() string
	CloudConfig() string
}

type runnerCloudUploader interface {
	Upload(ctx context.Context, src imagestore.SourceImage, channel string, serverCompress bool) (string, error)
}

type runnerSanyueCloudUploader struct {
	uploader *imagestore.SanyueImgHubUploader
}

func (u runnerSanyueCloudUploader) Upload(ctx context.Context, src imagestore.SourceImage, channel string, serverCompress bool) (string, error) {
	return u.uploader.UploadToChannelWithOptions(ctx, src, channel, serverCompress)
}

type runnerDownloadFunc func(ctx context.Context, signedURL string) ([]byte, string, error)

// Runner 单次/多次生图的执行器。封装完整的 chatgpt.com 协议链路:
//
//	ChatRequirements → PrepareFConversation → StreamFConversation (SSE) →
//	ParseImageSSE → (需要时) PollConversationForImages → ImageDownloadURL
//
// IMG2 已正式上线,不再做"灰度命中判定 / preview_only 换账号重试"这些节流操作,
// 拿到任意 file-service / sediment 引用即算成功,以速度和效率优先。
type Runner struct {
	sched         *scheduler.Scheduler
	dao           runnerDAO
	cfg           config.ImageConfig
	files         runnerImageStore
	quotaDecr     QuotaDecrementor
	settings      runnerSettings
	cloudUploader runnerCloudUploader
	downloadFn    runnerDownloadFunc
	runOnceFn     runnerAttemptFunc // 仅测试使用
}

// NewRunner 构造 Runner。
func NewRunner(sched *scheduler.Scheduler, dao *DAO, cfg config.ImageConfig, files ...runnerImageStore) *Runner {
	r := &Runner{sched: sched, dao: dao, cfg: cfg}
	if len(files) > 0 {
		r.files = files[0]
	}
	return r
}

func (r *Runner) SetSettings(s runnerSettings) {
	r.settings = s
}

// SetQuotaDecrementor 注入额度扣减器。
func (r *Runner) SetQuotaDecrementor(qd QuotaDecrementor) {
	r.quotaDecr = qd
}

// ReferenceImage 是图生图/编辑的一张参考图输入。
// 只需要提供原始字节 + 可选的文件名,Runner 会在运行时调用 chatgpt Client 上传。
type ReferenceImage struct {
	Data     []byte
	FileName string // 可选,未填时按长度 + 嗅探扩展名生成
}

// RunOptions 是单次生图的输入。
type RunOptions struct {
	TaskID            string
	UserID            uint64
	KeyID             uint64
	ModelID           uint64
	UpstreamModel     string // 默认 "auto"(由上游根据 system_hints 挑选图像模型)
	Prompt            string
	N                 int              // 期望返回的图片张数;够数 Poll 就立即返回(速度优先)
	MaxAttempts       int              // 跨账号重试次数,仅用于无账号/限流等硬错误,默认 1
	PerAttemptTimeout time.Duration    // 单次尝试总超时,默认 6min(覆盖 SSE + PollMaxWait + 缓冲)
	PollMaxWait       time.Duration    // SSE 没直出时,轮询 conversation 的最长等待,默认 300s
	References        []ReferenceImage // 图生图/编辑:参考图
}

// RunResult 是单次生图的输出。
type RunResult struct {
	Status         string // success / failed
	ConversationID string
	AccountID      uint64
	FileIDs        []string // chatgpt.com 侧的原始 ref("sed:" 前缀表示 sediment)
	SignedURLs     []string // 直接可访问的签名 URL(15 分钟有效)
	ThumbURLs      []string
	ContentTypes   []string
	StorageMode    string
	ErrorCode      string
	ErrorMessage   string
	Attempts       int // 跨账号尝试次数(runOnce 次数)
	DurationMs     int64
	archiveImages  []imagestore.SourceImage
	quotaUsed      map[uint64]int
}

// Run 执行生图。会同步阻塞直到完成/失败;调用方自行做超时控制(传 ctx)。
func (r *Runner) Run(ctx context.Context, opt RunOptions) *RunResult {
	start := time.Now()
	opt = r.normalizeOptions(opt)

	result := &RunResult{Status: StatusFailed, ErrorCode: ErrUnknown, StorageMode: r.storageMode()}

	// 仅当有 DAO 和 taskID 时才落库
	if r.dao != nil && opt.TaskID != "" {
		_ = r.dao.MarkRunning(ctx, opt.TaskID, 0)
	}

	runOnce := r.runOnce
	if r.runOnceFn != nil {
		runOnce = r.runOnceFn
	}

	if opt.N > 1 {
		r.runParallel(ctx, opt, runOnce, result)
		if result.Status == StatusSuccess {
			if err := r.archiveResultImages(ctx, opt.TaskID, result); err != nil {
				result.Status = StatusFailed
				result.ErrorCode = ErrArchive
				result.ErrorMessage = err.Error()
			}
		}
	} else {
		if r.runWithRetry(ctx, opt, runOnce, result) {
			if err := r.archiveResultImages(ctx, opt.TaskID, result); err != nil {
				result.Status = StatusFailed
				result.ErrorCode = ErrArchive
				result.ErrorMessage = err.Error()
			} else {
				result.quotaUsed = map[uint64]int{
					result.AccountID: quotaImageCount(result.FileIDs, result.SignedURLs, opt.N),
				}
				result.Status = StatusSuccess
				result.ErrorCode = ""
				result.ErrorMessage = ""
			}
		}
	}

	result.DurationMs = time.Since(start).Milliseconds()

	// 落库
	if r.dao != nil && opt.TaskID != "" {
		if result.Status == StatusSuccess {
			if err := r.dao.MarkSuccess(ctx, opt.TaskID, result.ConversationID,
				result.FileIDs, result.SignedURLs, result.ThumbURLs, result.StorageMode, 0 /* credit_cost 由网关负责写 */); err == nil && r.quotaDecr != nil {
				quotaUsed := result.quotaUsed
				if len(quotaUsed) == 0 && result.AccountID > 0 {
					quotaUsed = map[uint64]int{
						result.AccountID: quotaImageCount(result.FileIDs, result.SignedURLs, opt.N),
					}
				}
				for accountID, n := range quotaUsed {
					if accountID == 0 || n <= 0 {
						continue
					}
					_ = r.quotaDecr.DecrQuota(context.Background(), accountID, n)
				}
			}
		} else {
			_ = r.dao.MarkFailed(ctx, opt.TaskID, result.ErrorCode)
		}
	}
	return result
}

// runParallel 并发启动 opt.N 个独立请求,每个各出 1 张图,最终合并到 result。
// 只要有 >=1 张成功就算整体成功;全部失败才返回失败。
// 各 goroutine 不写 DAO(TaskID 置空),写库由外层 Run 统一完成。
func (r *Runner) runParallel(ctx context.Context, opt RunOptions, runOnce runnerAttemptFunc, result *RunResult) {
	type subResult struct {
		ok           bool
		attempts     int
		fileIDs      []string
		signedURLs   []string
		contentTypes []string
		archiveImgs  []imagestore.SourceImage
		convID       string
		accountID    uint64
		errCode      string
		errMsg       string
	}

	n := opt.N
	ch := make(chan subResult, n)

	subOpt := opt
	subOpt.N = 1
	subOpt.TaskID = ""

	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sub := &RunResult{Status: StatusFailed, ErrorCode: ErrUnknown, StorageMode: r.storageMode()}
			ok := r.runWithRetry(ctx, subOpt, runOnce, sub)
			if ok {
				trimRunResultImages(sub, subOpt.N)
			}
			ch <- subResult{
				ok:           ok,
				attempts:     sub.Attempts,
				fileIDs:      append([]string(nil), sub.FileIDs...),
				signedURLs:   append([]string(nil), sub.SignedURLs...),
				contentTypes: append([]string(nil), sub.ContentTypes...),
				archiveImgs:  append([]imagestore.SourceImage(nil), sub.archiveImages...),
				convID:       sub.ConversationID,
				accountID:    sub.AccountID,
				errCode:      sub.ErrorCode,
				errMsg:       sub.ErrorMessage,
			}
		}()
	}

	go func() {
		wg.Wait()
		close(ch)
	}()

	var (
		successCount int
		lastErrCode  string
		lastErrMsg   string
	)
	result.quotaUsed = map[uint64]int{}
	for sr := range ch {
		result.Attempts += sr.attempts
		if sr.ok {
			successCount++
			base := len(result.FileIDs)
			result.FileIDs = append(result.FileIDs, sr.fileIDs...)
			result.SignedURLs = append(result.SignedURLs, sr.signedURLs...)
			result.ContentTypes = append(result.ContentTypes, sr.contentTypes...)
			for _, img := range sr.archiveImgs {
				cloned := img
				cloned.Index = base + img.Index
				result.archiveImages = append(result.archiveImages, cloned)
			}
			if result.ConversationID == "" {
				result.ConversationID = sr.convID
			}
			if result.AccountID == 0 {
				result.AccountID = sr.accountID
			}
			if sr.accountID > 0 {
				result.quotaUsed[sr.accountID] += quotaImageCount(sr.fileIDs, sr.signedURLs, subOpt.N)
			}
			continue
		}
		lastErrCode = sr.errCode
		lastErrMsg = sr.errMsg
	}
	if len(result.archiveImages) > 1 {
		sort.Slice(result.archiveImages, func(i, j int) bool {
			return result.archiveImages[i].Index < result.archiveImages[j].Index
		})
	}
	if successCount > 0 {
		result.Status = StatusSuccess
		result.ErrorCode = ""
		result.ErrorMessage = ""
		logger.L().Info("image runner parallel done",
			zap.String("task_id", opt.TaskID),
			zap.Int("requested", n),
			zap.Int("succeeded", successCount),
			zap.Int("got_images", len(result.FileIDs)),
		)
		return
	}

	result.ErrorCode = lastErrCode
	result.ErrorMessage = lastErrMsg
	logger.L().Warn("image runner parallel all failed",
		zap.String("task_id", opt.TaskID),
		zap.Int("requested", n),
		zap.String("last_err", lastErrCode),
	)
}

func (r *Runner) runWithRetry(ctx context.Context, opt RunOptions, runOnce runnerAttemptFunc, result *RunResult) bool {
	for attempt := 1; attempt <= maxAttemptWindow(opt.MaxAttempts); attempt++ {
		result.Attempts = attempt
		if err := ctx.Err(); err != nil {
			result.ErrorCode = ErrUnknown
			result.ErrorMessage = err.Error()
			return false
		}

		attemptResult := &RunResult{Status: StatusFailed, ErrorCode: ErrUnknown, StorageMode: result.StorageMode}
		attemptCtx, cancel := context.WithTimeout(ctx, opt.PerAttemptTimeout)
		ok, status, err := runOnce(attemptCtx, opt, attemptResult)
		cancel()

		copyRunResultState(result, attemptResult)
		if ok {
			return true
		}

		if err != nil {
			result.ErrorMessage = err.Error()
		} else {
			result.ErrorMessage = ""
		}
		if status == "" {
			status = attemptResult.ErrorCode
		}
		if status == "" {
			status = ErrUnknown
		}
		result.ErrorCode = status

		if !isRetryableImageFailure(status) {
			return false
		}
		if attempt >= retryLimit(opt.MaxAttempts, status) {
			return false
		}

		logger.L().Info("image runner retry with another account",
			zap.String("task_id", opt.TaskID),
			zap.String("reason", status),
			zap.Int("attempt", attempt))
	}
	return false
}

func copyRunResultState(dst, src *RunResult) {
	if dst == nil || src == nil {
		return
	}
	dst.ConversationID = src.ConversationID
	dst.AccountID = src.AccountID
	dst.FileIDs = append([]string(nil), src.FileIDs...)
	dst.SignedURLs = append([]string(nil), src.SignedURLs...)
	dst.ThumbURLs = append([]string(nil), src.ThumbURLs...)
	dst.ContentTypes = append([]string(nil), src.ContentTypes...)
	dst.archiveImages = append([]imagestore.SourceImage(nil), src.archiveImages...)
	dst.quotaUsed = nil
}

func (r *Runner) archiveResultImages(ctx context.Context, taskID string, result *RunResult) error {
	result.StorageMode = r.storageMode()
	if result.StorageMode == StorageModeCloud {
		images, err := r.archiveSourceImages(ctx, result)
		if err != nil {
			return err
		}
		return r.uploadCloudImages(ctx, taskID, images, result)
	}
	if r.files == nil || taskID == "" {
		return nil
	}
	images, err := r.archiveSourceImages(ctx, result)
	if err != nil {
		return err
	}
	if len(images) == 0 {
		return errors.New("no archive images")
	}
	_, err = r.files.SaveTaskImages(ctx, taskID, images)
	return err
}

func (r *Runner) archiveSourceImages(ctx context.Context, result *RunResult) ([]imagestore.SourceImage, error) {
	if len(result.archiveImages) > 0 {
		return result.archiveImages, nil
	}
	return r.downloadArchiveImages(ctx, result)
}

// ArchiveExternalImages 归档外置渠道已经生成的图片。
//
// urls 会先按 Runner 的下载规则拉取原图字节；inlineImages 用于上游只返回
// base64 字节的场景。归档成功后返回的 RunResult 会带有最终对外展示用的
// StorageMode、SignedURLs 与 ThumbURLs。
func (r *Runner) ArchiveExternalImages(ctx context.Context, taskID string, urls []string, inlineImages []imagestore.SourceImage) (*RunResult, error) {
	result := &RunResult{
		Status:      StatusSuccess,
		StorageMode: r.storageMode(),
	}
	images := make([]imagestore.SourceImage, 0, len(urls)+len(inlineImages))
	if len(urls) > 0 {
		urlResult := &RunResult{SignedURLs: append([]string(nil), urls...)}
		downloaded, err := r.downloadArchiveImages(ctx, urlResult)
		if err != nil {
			result.Status = StatusFailed
			result.ErrorCode = ErrArchive
			result.ErrorMessage = err.Error()
			return result, err
		}
		images = append(images, downloaded...)
	}
	base := len(images)
	for idx, src := range inlineImages {
		cloned := src
		cloned.Index = base + idx
		images = append(images, cloned)
	}
	if len(images) == 0 {
		err := errors.New("no archive images")
		result.Status = StatusFailed
		result.ErrorCode = ErrArchive
		result.ErrorMessage = err.Error()
		return result, err
	}
	result.archiveImages = images
	result.SignedURLs = make([]string, len(images))
	for idx := range result.SignedURLs {
		if idx < len(urls) {
			result.SignedURLs[idx] = urls[idx]
			continue
		}
		result.SignedURLs[idx] = fmt.Sprintf("inline://image/%d", idx)
	}
	if err := r.archiveResultImages(ctx, taskID, result); err != nil {
		result.Status = StatusFailed
		result.ErrorCode = ErrArchive
		result.ErrorMessage = err.Error()
		return result, err
	}
	result.Status = StatusSuccess
	result.ErrorCode = ""
	result.ErrorMessage = ""
	return result, nil
}

func (r *Runner) uploadCloudImages(ctx context.Context, taskID string, images []imagestore.SourceImage, result *RunResult) error {
	uploader, err := r.resolveCloudUploader()
	if err != nil {
		return err
	}
	if len(images) == 0 {
		return errors.New("no archive images")
	}
	urls := make([]string, 0, len(images))
	thumbURLs := make([]string, 0, len(images))
	channels := r.cloudUploadChannels()
	for _, src := range images {
		original := src
		original.FileName = fmt.Sprintf("%s_%d", taskID, src.Index)
		uploadedURL, err := r.uploadCloudImage(ctx, uploader, original, channels, false)
		if err != nil {
			return err
		}
		thumb := src
		thumb.FileName = fmt.Sprintf("tmp_%s_%d", taskID, src.Index)
		thumbURL, err := r.uploadCloudImage(ctx, uploader, thumb, channels, true)
		if err != nil {
			return err
		}
		urls = append(urls, uploadedURL)
		thumbURLs = append(thumbURLs, thumbURL)
	}
	result.SignedURLs = urls
	result.ThumbURLs = thumbURLs
	return nil
}

func (r *Runner) uploadCloudImage(ctx context.Context, uploader runnerCloudUploader, src imagestore.SourceImage, channels []string, serverCompress bool) (string, error) {
	var lastErr error
	for _, channel := range channels {
		uploadedURL, err := uploader.Upload(ctx, src, channel, serverCompress)
		if err == nil {
			return uploadedURL, nil
		}
		lastErr = err
		logger.L().Warn("image runner cloud upload failed",
			zap.Int("idx", src.Index),
			zap.String("channel", channel),
			zap.Error(err))
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", errors.New("cloud upload failed")
}

func (r *Runner) downloadArchiveImages(ctx context.Context, result *RunResult) ([]imagestore.SourceImage, error) {
	if len(result.SignedURLs) == 0 {
		return nil, errors.New("no signed urls")
	}
	download := r.downloadFn
	if download == nil {
		download = defaultRunnerDownload
	}
	images := make([]imagestore.SourceImage, 0, len(result.SignedURLs))
	for idx, signedURL := range result.SignedURLs {
		data, contentType, err := download(ctx, signedURL)
		if err != nil {
			return nil, err
		}
		if contentType == "" && idx < len(result.ContentTypes) {
			contentType = result.ContentTypes[idx]
		}
		images = append(images, imagestore.SourceImage{
			Index:       idx,
			Data:        data,
			ContentType: contentType,
		})
	}
	return images, nil
}

func (r *Runner) storageMode() string {
	if r.settings == nil {
		return StorageModeLocal
	}
	return NormalizeStorageMode(r.settings.ImageStorageMode())
}

func (r *Runner) resolveCloudUploader() (runnerCloudUploader, error) {
	if r.cloudUploader != nil {
		return r.cloudUploader, nil
	}
	if r.settings == nil {
		return nil, errors.New("cloud storage settings not configured")
	}
	cfg, err := settings.ParseSanyueImgHubConfig(r.settings.CloudConfig())
	if err != nil {
		return nil, err
	}
	if err := settings.ValidateStorageSnapshot(map[string]string{
		settings.StorageImageMode:   StorageModeCloud,
		settings.StorageCloudConfig: r.settings.CloudConfig(),
	}); err != nil {
		return nil, err
	}
	return runnerSanyueCloudUploader{uploader: imagestore.NewSanyueImgHubUploader(imagestore.SanyueImgHubUploaderOptions{
		UploadURL:      cfg.UploadURL,
		AuthCode:       cfg.AuthCode,
		ServerCompress: cfg.ServerCompress,
		ReturnFormat:   cfg.ReturnFormat,
		UploadChannel:  cfg.UploadChannel,
	})}, nil
}

func (r *Runner) cloudUploadChannels() []string {
	preferred := settings.SanyueUploadChannelTelegram
	if r.settings != nil {
		cfg, err := settings.ParseSanyueImgHubConfig(r.settings.CloudConfig())
		if err == nil && settings.IsSupportedSanyueUploadChannel(cfg.UploadChannel) {
			preferred = settings.NormalizeSanyueUploadChannel(cfg.UploadChannel)
		}
	}
	if preferred == settings.SanyueUploadChannelHuggingFace {
		return []string{settings.SanyueUploadChannelHuggingFace}
	}
	return []string{
		settings.SanyueUploadChannelTelegram,
		settings.SanyueUploadChannelHuggingFace,
	}
}

func maxAttemptWindow(maxAttempts int) int {
	if maxAttempts <= 0 {
		maxAttempts = 1
	}
	if maxAttempts < 2 {
		return 2
	}
	return maxAttempts
}

// retryLimit 返回某类错误实际允许的尝试上限。upstream_error 固定补试一次。
func retryLimit(maxAttempts int, code string) int {
	if maxAttempts <= 0 {
		maxAttempts = 1
	}
	if code == ErrUpstream {
		return 2
	}
	return maxAttempts
}

func isRetryableImageFailure(code string) bool {
	switch code {
	case ErrRateLimited, ErrNoAccount, ErrAuthRequired, ErrNetworkTransient, ErrUpstream:
		return true
	default:
		return false
	}
}

func (r *Runner) normalizeOptions(opt RunOptions) RunOptions {
	if opt.MaxAttempts <= 0 {
		opt.MaxAttempts = 1
	}
	if opt.PerAttemptTimeout <= 0 {
		opt.PerAttemptTimeout = 6 * time.Minute
	}
	if opt.PollMaxWait <= 0 {
		waitCfg := r.imageWaitConfig()
		opt.PollMaxWait = time.Duration(waitCfg.PollMaxWaitSec) * time.Second
	}
	if opt.UpstreamModel == "" {
		// 对齐浏览器抓包 + 参考实现:图像走 f/conversation 时 model 字段和
		// 普通 chat 一致用 "auto",通过 system_hints=["picture_v2"] 让上游知道
		// 这是图像任务。硬写 "gpt-5-3" 在免费/新账号上会直接 404。
		opt.UpstreamModel = "auto"
	}
	if opt.N <= 0 {
		opt.N = 1
	}
	return opt
}

func (r *Runner) imageWaitConfig() config.ImageConfig {
	cfg := r.cfg
	if cfg.SameConversationMaxTurns <= 0 {
		cfg.SameConversationMaxTurns = 3
	}
	if cfg.PollMaxWaitSec <= 0 {
		cfg.PollMaxWaitSec = 120
	}
	if cfg.PollIntervalSec <= 0 {
		cfg.PollIntervalSec = 3
	}
	if cfg.PollStableRounds <= 0 {
		cfg.PollStableRounds = 2
	}
	if cfg.PreviewWaitSec <= 0 {
		cfg.PreviewWaitSec = 15
	}
	return cfg
}

// runOnce 一次完整的尝试。返回 (ok, errorCode, err)。
// result 会被就地更新(ConversationID / FileIDs / SignedURLs / AccountID 等)。
func (r *Runner) runOnce(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
	// 1) 调度账号
	lease, err := r.sched.Dispatch(ctx, "image")
	if err != nil {
		if errors.Is(err, scheduler.ErrNoAvailable) {
			return false, ErrNoAccount, err
		}
		return false, ErrUnknown, err
	}
	defer func() {
		_ = lease.Release(context.Background())
	}()
	result.AccountID = lease.Account.ID
	// 立刻把 account_id 写回 image_tasks,供后续图片代理端点按 task_id 解出 AT。
	// MarkRunning 在 status=running 时 WHERE 不命中,所以用专门的 SetAccount。
	if r.dao != nil && opt.TaskID != "" {
		_ = r.dao.SetAccount(ctx, opt.TaskID, lease.Account.ID)
	}

	// 2) 构造上游 client
	cli, err := chatgpt.New(chatgpt.Options{
		AuthToken: lease.AuthToken,
		DeviceID:  lease.DeviceID,
		SessionID: lease.SessionID,
		ProxyURL:  lease.ProxyURL,
		Cookies:   "", // 目前不从 oai_account_cookies 加载,后续 M3+ 再做
	})
	if err != nil {
		return false, ErrUnknown, fmt.Errorf("chatgpt client: %w", err)
	}

	// 3) ChatRequirements + POW(新两步 sentinel 流程,solver 未配置时内部自动
	// 回退到单步接口)
	cr, err := cli.ChatRequirementsV2(ctx)
	if err != nil {
		return false, r.classifyUpstream(err), err
	}
	var proofToken string
	if cr.Proofofwork.Required {
		proofCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
		ch := make(chan string, 1)
		go func() { ch <- cr.SolveProof(chatgpt.DefaultUserAgent) }()
		select {
		case <-proofCtx.Done():
			cancel()
			r.sched.MarkWarned(context.Background(), lease.Account.ID)
			return false, ErrPOWTimeout, proofCtx.Err()
		case proofToken = <-ch:
			cancel()
		}
		if proofToken == "" {
			r.sched.MarkWarned(context.Background(), lease.Account.ID)
			return false, ErrPOWFailed, errors.New("pow solver returned empty")
		}
	}
	// Turnstile 是"建议性"信号:即使服务端声明 required,只要 chat_token + proof_token
	// 齐全,绝大多数账号的 f/conversation 仍然会正常下发图片结果。与 chat 流程(gateway/chat.go)
	// 保持一致——只打 warn,不阻断;真正拿不到 IMG2 终稿时由后续 poll 逻辑判定为失败。
	if cr.Turnstile.Required {
		logger.L().Warn("image turnstile required, continue anyway",
			zap.Uint64("account_id", lease.Account.ID))
	}

	// 4) 不再调用 /backend-api/conversation/init:
	// 浏览器实测路径是 prepare → chat-requirements → f/conversation 三步,init 是
	// 过时/冗余调用,在免费账号上还会返回 404 让整条链路 fail。system_hints=picture_v2
	// 会通过 f/conversation 的 payload 字段传达。

	// 4.5) 图生图:上传参考图。任何一张失败都直接整体 fail(上游后续会对不上 attachment)。
	var refs []*chatgpt.UploadedFile
	if len(opt.References) > 0 {
		for idx, r0 := range opt.References {
			upCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
			up, err := cli.UploadFile(upCtx, r0.Data, r0.FileName)
			cancel()
			if err != nil {
				logger.L().Warn("image runner upload reference failed",
					zap.Int("idx", idx), zap.Error(err))
				if ue, ok := err.(*chatgpt.UpstreamError); ok && ue.IsRateLimited() {
					r.sched.MarkRateLimited(context.Background(), lease.Account.ID)
					return false, ErrRateLimited, err
				}
				return false, ErrUpstream, fmt.Errorf("upload reference %d: %w", idx, err)
			}
			refs = append(refs, up)
		}
		logger.L().Info("image runner references uploaded",
			zap.String("task_id", opt.TaskID), zap.Int("count", len(refs)))
	}

	// 注意:新会话不要本地生成 conversation_id,上游会 404。
	// 真正的 conv_id 由 SSE 的 resume_conversation_token / sseResult.ConversationID 返回。
	var convID string
	parentID := uuid.NewString()
	messageID := uuid.NewString()

	// 统一把 model 强制为 "auto":对齐参考实现(只通过 system_hints=["picture_v2"]
	// 区分图像任务),避免 chatgpt-freeaccount / chatgpt-paid 之间的 model slug 差异。
	upstreamModel := "auto"
	if opt.UpstreamModel != "" && opt.UpstreamModel != "auto" && !cr.IsFreeAccount() {
		// 付费账号如果明确传了 upstream slug 且不是 auto,可以尊重用户传入
		// (但我们现有模型库没有 image 专用 slug,保留扩展点)
		upstreamModel = opt.UpstreamModel
	} else if cr.IsFreeAccount() && opt.UpstreamModel != "" && opt.UpstreamModel != "auto" {
		logger.L().Warn("image: free account requesting premium model, downgrade to auto",
			zap.Uint64("account_id", lease.Account.ID),
			zap.String("requested_model", opt.UpstreamModel))
	}

	// 5) 单轮 picture_v2:SSE 里直接给图就走 SSE 结果,没给就短轮询补一下。
	// IMG2 已正式上线,不再区分"终稿 / 预览",拿到就用,追求速度。
	convOpt := chatgpt.ImageConvOpts{
		Prompt:        opt.Prompt,
		UpstreamModel: upstreamModel,
		ConvID:        convID,
		ParentMsgID:   parentID,
		MessageID:     messageID,
		ChatToken:     cr.Token,
		ProofToken:    proofToken,
		References:    refs,
	}

	// Prepare(conduit_token;拿不到也能降级继续)
	if ct, err := cli.PrepareFConversation(ctx, convOpt); err == nil {
		convOpt.ConduitToken = ct
	} else if ue, ok := err.(*chatgpt.UpstreamError); ok && ue.IsRateLimited() {
		r.sched.MarkRateLimited(context.Background(), lease.Account.ID)
		return false, ErrRateLimited, err
	}

	// f/conversation SSE
	stream, err := cli.StreamFConversation(ctx, convOpt)
	if err != nil {
		code := r.classifyUpstream(err)
		if code == ErrRateLimited {
			r.sched.MarkRateLimited(context.Background(), lease.Account.ID)
		}
		return false, code, err
	}
	sseResult := chatgpt.ParseImageSSE(stream)
	if sseResult.ConversationID != "" {
		convID = sseResult.ConversationID
		result.ConversationID = convID
	}

	logger.L().Info("image runner SSE parsed",
		zap.String("task_id", opt.TaskID),
		zap.Uint64("account_id", lease.Account.ID),
		zap.String("conv_id", convID),
		zap.String("finish_type", sseResult.FinishType),
		zap.String("image_gen_task_id", sseResult.ImageGenTaskID),
		zap.Int("sse_fids", len(sseResult.FileIDs)),
		zap.Strings("sse_fids_list", sseResult.FileIDs),
		zap.Int("sse_sids", len(sseResult.SedimentIDs)),
		zap.Strings("sse_sids_list", sseResult.SedimentIDs),
	)

	// 聚合 SSE 阶段的所有引用:file-service 优先,sediment 补位
	var fileRefs []string
	fileRefs = append(fileRefs, sseResult.FileIDs...)
	for _, s := range sseResult.SedimentIDs {
		fileRefs = append(fileRefs, "sed:"+s)
	}

	// SSE 已经把期望数量的图带回来了 → 直接下载,跳过 Poll,省时间
	if len(fileRefs) >= opt.N {
		logger.L().Info("image runner enough refs from SSE, skip polling",
			zap.String("task_id", opt.TaskID),
			zap.Uint64("account_id", lease.Account.ID),
			zap.String("conv_id", convID),
			zap.Int("refs", len(fileRefs)),
			zap.Strings("refs_list", fileRefs),
		)
	} else {
		// SSE 没给够(常见于 IMG2 只走 tool 消息场景)→ 短轮询补齐。
		// 单轮新会话,不需要 baseline:conversation 里出现的每条 image_gen tool 消息
		// 都是本次请求的产物。
		pollOpt := chatgpt.PollOpts{
			ExpectedN: opt.N,
			MaxWait:   opt.PollMaxWait,
		}
		status, fids, sids := cli.PollConversationForImages(ctx, convID, pollOpt)
		logger.L().Info("image runner poll done",
			zap.String("task_id", opt.TaskID),
			zap.Uint64("account_id", lease.Account.ID),
			zap.String("conv_id", convID),
			zap.String("poll_status", string(status)),
			zap.Int("poll_fids", len(fids)),
			zap.Strings("poll_fids_list", fids),
			zap.Int("poll_sids", len(sids)),
			zap.Strings("poll_sids_list", sids),
		)
		switch status {
		case chatgpt.PollStatusSuccess:
			// 去重合并:SSE 捕获的 sediment 可能在 mapping 里再被 Poll 扫一次
			seen := make(map[string]struct{}, len(fileRefs))
			for _, r := range fileRefs {
				seen[r] = struct{}{}
			}
			for _, f := range fids {
				if _, ok := seen[f]; ok {
					continue
				}
				seen[f] = struct{}{}
				fileRefs = append(fileRefs, f)
			}
			for _, s := range sids {
				key := "sed:" + s
				if _, ok := seen[key]; ok {
					continue
				}
				seen[key] = struct{}{}
				fileRefs = append(fileRefs, key)
			}
		case chatgpt.PollStatusTimeout:
			return false, ErrPollTimeout, errors.New("poll timeout without any image")
		default:
			return false, ErrUpstream, errors.New("poll error")
		}
	}

	if len(fileRefs) == 0 {
		return false, ErrUpstream, errors.New("no image ref produced")
	}

	// 6) 对每个 ref 取签名 URL
	var signedURLs []string
	var contentTypes []string
	var successfulRefs []string
	for _, ref := range fileRefs {
		url, err := cli.ImageDownloadURL(ctx, convID, ref)
		if err != nil {
			logger.L().Warn("image runner download url failed",
				zap.String("ref", ref), zap.Error(err))
			continue
		}
		signedURLs = append(signedURLs, url)
		successfulRefs = append(successfulRefs, ref)
		contentTypes = append(contentTypes, "image/png")
	}
	if len(signedURLs) == 0 {
		return false, ErrDownload, errors.New("all download urls failed")
	}

	if r.files != nil {
		archiveImages := make([]imagestore.SourceImage, 0, len(signedURLs))
		for idx, signedURL := range signedURLs {
			body, contentType, err := cli.FetchImage(ctx, signedURL, 16*1024*1024)
			if err != nil {
				return false, ErrArchive, err
			}
			if contentType == "" && idx < len(contentTypes) {
				contentType = contentTypes[idx]
			}
			contentTypes[idx] = contentType
			archiveImages = append(archiveImages, imagestore.SourceImage{
				Index:       idx,
				Data:        body,
				ContentType: contentType,
			})
		}
		result.archiveImages = archiveImages
	}

	logger.L().Info("image runner result summary",
		zap.String("task_id", opt.TaskID),
		zap.Uint64("account_id", lease.Account.ID),
		zap.String("conv_id", convID),
		zap.Int("refs", len(fileRefs)),
		zap.Strings("refs_list", fileRefs),
		zap.Int("signed_count", len(signedURLs)),
	)

	result.FileIDs = successfulRefs
	result.SignedURLs = signedURLs
	result.ContentTypes = contentTypes
	return true, "", nil
}

// classifyUpstream 把上游错误转成内部 error code。
func (r *Runner) classifyUpstream(err error) string {
	if err == nil {
		return ""
	}
	var ue *chatgpt.UpstreamError
	if errors.As(err, &ue) {
		if ue.IsRateLimited() {
			return ErrRateLimited
		}
		if ue.IsUnauthorized() {
			return ErrAuthRequired
		}
		return ErrUpstream
	}
	if strings.Contains(err.Error(), "deadline exceeded") {
		return ErrPollTimeout
	}
	msg := err.Error()
	msgLower := strings.ToLower(msg)
	if strings.Contains(msg, "EOF") ||
		strings.Contains(msgLower, "connection reset") ||
		strings.Contains(msgLower, "connection refused") ||
		strings.Contains(msgLower, "broken pipe") {
		return ErrNetworkTransient
	}
	return ErrUpstream
}

func trimRunResultImages(result *RunResult, maxImages int) {
	if result == nil || maxImages <= 0 {
		return
	}
	if len(result.FileIDs) > maxImages {
		result.FileIDs = append([]string(nil), result.FileIDs[:maxImages]...)
	}
	if len(result.SignedURLs) > maxImages {
		result.SignedURLs = append([]string(nil), result.SignedURLs[:maxImages]...)
	}
	if len(result.ContentTypes) > maxImages {
		result.ContentTypes = append([]string(nil), result.ContentTypes[:maxImages]...)
	}
	if len(result.archiveImages) > maxImages {
		result.archiveImages = append([]imagestore.SourceImage(nil), result.archiveImages[:maxImages]...)
	}
}

func quotaImageCount(fileIDs, signedURLs []string, fallback int) int {
	if n := len(fileIDs); n > 0 {
		return n
	}
	if n := len(signedURLs); n > 0 {
		return n
	}
	if fallback > 0 {
		return fallback
	}
	return 1
}

// GenerateTaskID 生成对外 task_id。
func GenerateTaskID() string {
	return "img_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:24]
}

func defaultRunnerDownload(ctx context.Context, signedURL string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, signedURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", chatgpt.DefaultUserAgent)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		return nil, "", fmt.Errorf("download image failed: status=%d", res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 16*1024*1024+1))
	if err != nil {
		return nil, "", err
	}
	if len(body) > 16*1024*1024 {
		return nil, "", errors.New("image exceeds max bytes")
	}
	return body, res.Header.Get("Content-Type"), nil
}
