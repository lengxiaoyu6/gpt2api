package image

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"testing"

	"github.com/432539/gpt2api/internal/imagestore"
)

type runnerArchiveDAO struct {
	markSuccessCalls int
	markFailedCalls  int
	lastFailedCode   string
	lastSuccessTask  string
	lastStorageMode  string
	lastResultURLs   []string
	lastThumbURLs    []string
}

func (d *runnerArchiveDAO) MarkRunning(context.Context, string, uint64) error { return nil }
func (d *runnerArchiveDAO) SetAccount(context.Context, string, uint64) error  { return nil }
func (d *runnerArchiveDAO) MarkSuccess(ctx context.Context, taskID, convID string, fileIDs, resultURLs, thumbURLs []string, storageMode string, creditCost int64) error {
	d.markSuccessCalls++
	d.lastSuccessTask = taskID
	d.lastStorageMode = storageMode
	d.lastResultURLs = append([]string(nil), resultURLs...)
	d.lastThumbURLs = append([]string(nil), thumbURLs...)
	return nil
}
func (d *runnerArchiveDAO) MarkFailed(ctx context.Context, taskID, errorCode string) error {
	d.markFailedCalls++
	d.lastFailedCode = errorCode
	return nil
}

type runnerStorageSettingsStub struct {
	mode        string
	cloudConfig string
}

func (s runnerStorageSettingsStub) ImageStorageMode() string { return s.mode }
func (s runnerStorageSettingsStub) CloudConfig() string      { return s.cloudConfig }

type runnerCloudUploaderStub struct {
	results      []runnerCloudUploadResult
	callData     [][]byte
	callChannels []string
	callCompress []bool
	callNames    []string
}

type runnerCloudUploadResult struct {
	channel string
	url     string
	err     error
}

func (s *runnerCloudUploaderStub) Upload(ctx context.Context, src imagestore.SourceImage, channel string, serverCompress bool) (string, error) {
	s.callData = append(s.callData, append([]byte(nil), src.Data...))
	s.callChannels = append(s.callChannels, channel)
	s.callCompress = append(s.callCompress, serverCompress)
	s.callNames = append(s.callNames, src.FileName)
	idx := len(s.callChannels) - 1
	if idx >= len(s.results) {
		return "", errors.New("missing upload result")
	}
	result := s.results[idx]
	if result.channel != "" && result.channel != channel {
		return "", fmt.Errorf("unexpected channel: got %s want %s", channel, result.channel)
	}
	if result.err != nil {
		return "", result.err
	}
	return result.url, nil
}

func TestRunnerRunArchivesLocalImagesBeforeMarkSuccess(t *testing.T) {
	dao := &runnerArchiveDAO{}
	store := imagestore.NewLocal(imagestore.LocalOptions{RootDir: t.TempDir()})
	downloads := 0
	r := &Runner{
		dao:      dao,
		files:    store,
		settings: runnerStorageSettingsStub{mode: StorageModeLocal},
		downloadFn: func(ctx context.Context, signedURL string) ([]byte, string, error) {
			downloads++
			return mustRunnerPNG(t), "image/png", nil
		},
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			result.ConversationID = "conv_archive_ok"
			result.FileIDs = []string{"file-1", "file-2"}
			result.SignedURLs = []string{"https://example.com/1.png", "https://example.com/2.png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_archive_ok", N: 2})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if res.ErrorCode != "" {
		t.Fatalf("error code = %s", res.ErrorCode)
	}
	if res.StorageMode != StorageModeLocal {
		t.Fatalf("storage mode = %s", res.StorageMode)
	}
	if downloads != 2 {
		t.Fatalf("downloads = %d", downloads)
	}
	if dao.markSuccessCalls != 1 {
		t.Fatalf("mark success calls = %d", dao.markSuccessCalls)
	}
	if dao.lastStorageMode != StorageModeLocal {
		t.Fatalf("dao storage mode = %s", dao.lastStorageMode)
	}
	if _, ok, err := store.FindOriginal("img_archive_ok", 0); err != nil || !ok {
		t.Fatalf("original 0 missing, ok=%v err=%v", ok, err)
	}
	if _, ok, err := store.FindThumb("img_archive_ok", 1); err != nil || !ok {
		t.Fatalf("thumb 1 missing, ok=%v err=%v", ok, err)
	}
}

func TestRunnerRunUploadsCloudImagesAndStoresRemoteURLs(t *testing.T) {
	dao := &runnerArchiveDAO{}
	uploader := &runnerCloudUploaderStub{results: []runnerCloudUploadResult{
		{channel: "telegram", url: "https://cdn.example.com/1.png"},
		{channel: "telegram", url: "https://cdn.example.com/1_thumb.jpg"},
		{channel: "telegram", url: "https://cdn.example.com/2.png"},
		{channel: "telegram", url: "https://cdn.example.com/2_thumb.jpg"},
	}}
	r := &Runner{
		dao:           dao,
		settings:      runnerStorageSettingsStub{mode: StorageModeCloud},
		cloudUploader: uploader,
		downloadFn: func(ctx context.Context, signedURL string) ([]byte, string, error) {
			return mustRunnerPNG(t), "image/png", nil
		},
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			result.ConversationID = "conv_cloud_ok"
			result.FileIDs = []string{"file-1", "file-2"}
			result.SignedURLs = []string{"https://origin.example.com/1.png", "https://origin.example.com/2.png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_cloud_ok", N: 2})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if res.StorageMode != StorageModeCloud {
		t.Fatalf("storage mode = %s", res.StorageMode)
	}
	if len(uploader.callData) != 4 {
		t.Fatalf("upload calls = %d", len(uploader.callData))
	}
	if got := uploader.callChannels; len(got) != 4 || got[0] != "telegram" || got[1] != "telegram" || got[2] != "telegram" || got[3] != "telegram" {
		t.Fatalf("upload channels = %#v", got)
	}
	if got := uploader.callCompress; len(got) != 4 || got[0] || got[1] || got[2] || got[3] {
		t.Fatalf("upload compress flags = %#v", got)
	}
	if got := uploader.callNames; len(got) != 4 || got[0] != "img_cloud_ok_0" || got[1] != "tmp_img_cloud_ok_0" || got[2] != "img_cloud_ok_1" || got[3] != "tmp_img_cloud_ok_1" {
		t.Fatalf("upload file names = %#v", got)
	}
	if bytes.Equal(uploader.callData[0], uploader.callData[1]) {
		t.Fatal("expected first thumbnail bytes differ from original bytes")
	}
	if bytes.Equal(uploader.callData[2], uploader.callData[3]) {
		t.Fatal("expected second thumbnail bytes differ from original bytes")
	}
	if got := http.DetectContentType(uploader.callData[1]); got != "image/jpeg" {
		t.Fatalf("first thumbnail content type = %s", got)
	}
	if got := http.DetectContentType(uploader.callData[3]); got != "image/jpeg" {
		t.Fatalf("second thumbnail content type = %s", got)
	}
	if got := res.SignedURLs; len(got) != 2 || got[0] != "https://cdn.example.com/1.png" || got[1] != "https://cdn.example.com/2.png" {
		t.Fatalf("signed urls = %#v", got)
	}
	if got := res.ThumbURLs; len(got) != 2 || got[0] != "https://cdn.example.com/1_thumb.jpg" || got[1] != "https://cdn.example.com/2_thumb.jpg" {
		t.Fatalf("thumb urls = %#v", got)
	}
	if dao.lastStorageMode != StorageModeCloud {
		t.Fatalf("dao storage mode = %s", dao.lastStorageMode)
	}
	if got := dao.lastResultURLs; len(got) != 2 || got[0] != "https://cdn.example.com/1.png" || got[1] != "https://cdn.example.com/2.png" {
		t.Fatalf("dao result urls = %#v", got)
	}
	if got := dao.lastThumbURLs; len(got) != 2 || got[0] != "https://cdn.example.com/1_thumb.jpg" || got[1] != "https://cdn.example.com/2_thumb.jpg" {
		t.Fatalf("dao thumb urls = %#v", got)
	}
}

func TestRunnerRunKeepsSuccessWhenThumbBuildFails(t *testing.T) {
	dao := &runnerArchiveDAO{}
	uploader := &runnerCloudUploaderStub{results: []runnerCloudUploadResult{
		{channel: "telegram", url: "https://cdn.example.com/1.png"},
	}}
	r := &Runner{
		dao:           dao,
		settings:      runnerStorageSettingsStub{mode: StorageModeCloud},
		cloudUploader: uploader,
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			result.ConversationID = "conv_cloud_thumb_build_fail"
			result.FileIDs = []string{"file-1"}
			result.SignedURLs = []string{"https://origin.example.com/1.png"}
			result.archiveImages = []imagestore.SourceImage{{Index: 0, Data: []byte("not-an-image"), ContentType: "image/png"}}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_cloud_thumb_build_fail"})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if got := res.SignedURLs; len(got) != 1 || got[0] != "https://cdn.example.com/1.png" {
		t.Fatalf("signed urls = %#v", got)
	}
	if got := res.ThumbURLs; len(got) != 1 || got[0] != "" {
		t.Fatalf("thumb urls = %#v", got)
	}
	if got := dao.lastThumbURLs; len(got) != 1 || got[0] != "" {
		t.Fatalf("dao thumb urls = %#v", got)
	}
	if len(uploader.callData) != 1 {
		t.Fatalf("upload calls = %d", len(uploader.callData))
	}
}

func TestRunnerRunKeepsSuccessWhenThumbUploadFails(t *testing.T) {
	dao := &runnerArchiveDAO{}
	uploader := &runnerCloudUploaderStub{results: []runnerCloudUploadResult{
		{channel: "telegram", url: "https://cdn.example.com/1.png"},
		{channel: "telegram", err: errors.New("thumb upload failed")},
		{channel: "huggingface", err: errors.New("thumb upload failed")},
	}}
	r := &Runner{
		dao:           dao,
		settings:      runnerStorageSettingsStub{mode: StorageModeCloud},
		cloudUploader: uploader,
		downloadFn: func(ctx context.Context, signedURL string) ([]byte, string, error) {
			return mustRunnerPNG(t), "image/png", nil
		},
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			result.ConversationID = "conv_cloud_thumb_fail"
			result.FileIDs = []string{"file-1"}
			result.SignedURLs = []string{"https://origin.example.com/1.png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_cloud_thumb_fail"})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if got := res.SignedURLs; len(got) != 1 || got[0] != "https://cdn.example.com/1.png" {
		t.Fatalf("signed urls = %#v", got)
	}
	if got := res.ThumbURLs; len(got) != 1 || got[0] != "" {
		t.Fatalf("thumb urls = %#v", got)
	}
	if got := dao.lastResultURLs; len(got) != 1 || got[0] != "https://cdn.example.com/1.png" {
		t.Fatalf("dao result urls = %#v", got)
	}
	if got := dao.lastThumbURLs; len(got) != 1 || got[0] != "" {
		t.Fatalf("dao thumb urls = %#v", got)
	}
}

func TestRunnerRunMarksArchiveFailedWhenCloudUploadFails(t *testing.T) {
	dao := &runnerArchiveDAO{}
	uploader := &runnerCloudUploaderStub{results: []runnerCloudUploadResult{
		{channel: "telegram", err: errors.New("telegram failed")},
		{channel: "huggingface", err: errors.New("huggingface failed")},
	}}
	r := &Runner{
		dao:           dao,
		settings:      runnerStorageSettingsStub{mode: StorageModeCloud},
		cloudUploader: uploader,
		downloadFn: func(ctx context.Context, signedURL string) ([]byte, string, error) {
			return mustRunnerPNG(t), "image/png", nil
		},
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			result.ConversationID = "conv_archive_fail"
			result.FileIDs = []string{"file-1", "file-2"}
			result.SignedURLs = []string{"https://example.com/1.png", "https://example.com/2.png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_archive_fail", N: 2})
	if res.Status != StatusFailed {
		t.Fatalf("status = %s", res.Status)
	}
	if res.ErrorCode != ErrArchive {
		t.Fatalf("error code = %s", res.ErrorCode)
	}
	if dao.markSuccessCalls != 0 {
		t.Fatalf("mark success calls = %d", dao.markSuccessCalls)
	}
	if dao.markFailedCalls != 1 {
		t.Fatalf("mark failed calls = %d", dao.markFailedCalls)
	}
	if dao.lastFailedCode != ErrArchive {
		t.Fatalf("last failed code = %s", dao.lastFailedCode)
	}
	if got := uploader.callChannels; len(got) != 2 || got[0] != "telegram" || got[1] != "huggingface" {
		t.Fatalf("upload channels = %#v", got)
	}
}

func TestRunnerRunFallsBackToHuggingFaceWhenTelegramUploadFails(t *testing.T) {
	dao := &runnerArchiveDAO{}
	uploader := &runnerCloudUploaderStub{results: []runnerCloudUploadResult{
		{channel: "telegram", err: errors.New("telegram failed")},
		{channel: "huggingface", url: "https://cdn.example.com/fallback.png"},
		{channel: "telegram", err: errors.New("telegram failed")},
		{channel: "huggingface", url: "https://cdn.example.com/fallback_thumb.jpg"},
	}}
	r := &Runner{
		dao:           dao,
		settings:      runnerStorageSettingsStub{mode: StorageModeCloud},
		cloudUploader: uploader,
		downloadFn: func(ctx context.Context, signedURL string) ([]byte, string, error) {
			return mustRunnerPNG(t), "image/png", nil
		},
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			result.ConversationID = "conv_cloud_fallback"
			result.FileIDs = []string{"file-1"}
			result.SignedURLs = []string{"https://origin.example.com/1.png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_cloud_fallback", N: 1})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if got := uploader.callChannels; len(got) != 4 || got[0] != "telegram" || got[1] != "huggingface" || got[2] != "telegram" || got[3] != "huggingface" {
		t.Fatalf("upload channels = %#v", got)
	}
	if got := res.SignedURLs; len(got) != 1 || got[0] != "https://cdn.example.com/fallback.png" {
		t.Fatalf("signed urls = %#v", got)
	}
	if got := res.ThumbURLs; len(got) != 1 || got[0] != "https://cdn.example.com/fallback_thumb.jpg" {
		t.Fatalf("thumb urls = %#v", got)
	}
}

func TestRunnerRunUsesConfiguredHuggingFaceChannelWithoutTelegramFallback(t *testing.T) {
	dao := &runnerArchiveDAO{}
	uploader := &runnerCloudUploaderStub{results: []runnerCloudUploadResult{
		{channel: "huggingface", url: "https://cdn.example.com/hf.png"},
		{channel: "huggingface", url: "https://cdn.example.com/hf_thumb.jpg"},
	}}
	r := &Runner{
		dao: dao,
		settings: runnerStorageSettingsStub{
			mode:        StorageModeCloud,
			cloudConfig: `{"upload_url":"https://example.test/upload","auth_code":"abc","server_compress":false,"return_format":"full","upload_channel":"huggingface"}`,
		},
		cloudUploader: uploader,
		downloadFn: func(ctx context.Context, signedURL string) ([]byte, string, error) {
			return mustRunnerPNG(t), "image/png", nil
		},
		runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
			result.ConversationID = "conv_cloud_hf"
			result.FileIDs = []string{"file-1"}
			result.SignedURLs = []string{"https://origin.example.com/1.png"}
			return true, "", nil
		},
	}

	res := r.Run(context.Background(), RunOptions{TaskID: "img_cloud_hf", N: 1})
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if got := uploader.callChannels; len(got) != 2 || got[0] != "huggingface" || got[1] != "huggingface" {
		t.Fatalf("upload channels = %#v", got)
	}
	if got := res.ThumbURLs; len(got) != 1 || got[0] != "https://cdn.example.com/hf_thumb.jpg" {
		t.Fatalf("thumb urls = %#v", got)
	}
}

func TestRunnerArchiveExternalImagesUploadsInlineImageToCloud(t *testing.T) {
	uploader := &runnerCloudUploaderStub{results: []runnerCloudUploadResult{
		{channel: "telegram", url: "https://cdn.example.com/external.png"},
		{channel: "telegram", url: "https://cdn.example.com/external_thumb.jpg"},
	}}
	r := &Runner{
		settings:      runnerStorageSettingsStub{mode: StorageModeCloud},
		cloudUploader: uploader,
	}

	res, err := r.ArchiveExternalImages(context.Background(), "img_external_cloud", nil, []imagestore.SourceImage{
		{Data: mustRunnerPNGSize(t, 1200, 800), ContentType: "image/png"},
	})
	if err != nil {
		t.Fatalf("ArchiveExternalImages: %v", err)
	}
	if res.Status != StatusSuccess {
		t.Fatalf("status = %s", res.Status)
	}
	if res.StorageMode != StorageModeCloud {
		t.Fatalf("storage mode = %s", res.StorageMode)
	}
	if got := uploader.callNames; len(got) != 2 || got[0] != "img_external_cloud_0" || got[1] != "tmp_img_external_cloud_0" {
		t.Fatalf("upload file names = %#v", got)
	}
	if got := uploader.callCompress; len(got) != 2 || got[0] || got[1] {
		t.Fatalf("upload compress flags = %#v", got)
	}
	if bytes.Equal(uploader.callData[0], uploader.callData[1]) {
		t.Fatal("expected thumbnail bytes differ from original bytes")
	}
	if got := http.DetectContentType(uploader.callData[1]); got != "image/jpeg" {
		t.Fatalf("thumbnail content type = %s", got)
	}
	thumbImg, _, err := image.Decode(bytes.NewReader(uploader.callData[1]))
	if err != nil {
		t.Fatalf("decode thumbnail: %v", err)
	}
	if got := thumbImg.Bounds(); got.Dx() != 1200 || got.Dy() != 800 {
		t.Fatalf("thumbnail size = %dx%d", got.Dx(), got.Dy())
	}
	if got := res.SignedURLs; len(got) != 1 || got[0] != "https://cdn.example.com/external.png" {
		t.Fatalf("signed urls = %#v", got)
	}
	if got := res.ThumbURLs; len(got) != 1 || got[0] != "https://cdn.example.com/external_thumb.jpg" {
		t.Fatalf("thumb urls = %#v", got)
	}
}

func mustRunnerPNG(t *testing.T) []byte {
	t.Helper()
	return mustRunnerPNGSize(t, 64, 48)
}

func mustRunnerPNGSize(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 180, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}
