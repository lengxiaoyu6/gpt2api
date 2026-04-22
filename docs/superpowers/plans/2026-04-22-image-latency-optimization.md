# Image Latency Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将图片同步请求的等待策略改为配置驱动，在保持终稿优先与 `is_preview=true` 兜底语义不变的前提下，缩短单次请求平均耗时。

**Architecture:** 配置层新增 `image` 段统一描述同会话最大轮数与轮询等待参数，`Runner` 负责把这些参数注入每轮会话执行与结果日志，`chatgpt` 轮询层继续保留默认值兜底但新增时序测试保证显式参数生效。实现顺序遵循先测试后实现：先锁定配置解析、Runner 默认值与预览兜底行为，再接入主程序构造与观测字段。

**Tech Stack:** Go, Viper, Zap, net/http/httptest, YAML

---

## File Map

`internal/config/config.go`
负责新增 `ImageConfig` 并挂到主配置对象，供启动阶段统一装载。

`internal/config/config_test.go`
负责验证 `image` 段能被正确解析，避免上线后因为 YAML 字段名拼写或结构遗漏导致等待参数回退到旧值。

`configs/config.example.yaml`
负责样例配置，作为部署文档与默认参数来源。

`configs/config.yaml`
负责当前环境配置，保证本地与测试环境能按新参数启动。

`cmd/server/main.go`
负责把 `cfg.Image` 注入 `image.NewRunner`。

`internal/image/runner.go`
负责去掉写死的 `sameConvMax = 3` 与 `PollMaxWait = 300s`，把配置参数用于同会话多轮尝试、轮询调用与结果日志。

`internal/image/runner_test.go`
负责锁定 `Runner` 的三个关键行为：配置默认值注入、同会话轮数来自配置、三轮仍未命中终稿时返回 `is_preview=true`。

`internal/upstream/chatgpt/image.go`
负责保留 `PollConversationForImages` 的默认值兜底，同时把显式传入的 `Interval`、`StableRounds`、`PreviewWait`、`MaxWait` 作为唯一执行依据。

`internal/upstream/chatgpt/image_test.go`
负责通过 `httptest.Server` 模拟 conversation 轮询时序，验证 `preview_only` 与 `img2` 的判定窗口。

---

### Task 1: 配置结构与样例配置

**Files:**
- Create: `internal/config/config_test.go`
- Modify: `internal/config/config.go`
- Modify: `configs/config.example.yaml`
- Modify: `configs/config.yaml`

- [ ] **Step 1: 先写配置解析失败测试**

```go
package config

import (
    "os"
    "path/filepath"
    "sync"
    "testing"
)

func TestLoadImageConfig(t *testing.T) {
    t.Cleanup(func() {
        global = nil
        once = sync.Once{}
    })

    dir := t.TempDir()
    path := filepath.Join(dir, "config.yaml")
    raw := `app:
  name: demo
scheduler:
  min_interval_sec: 60
upstream:
  base_url: "https://chatgpt.com"
image:
  same_conversation_max_turns: 3
  poll_max_wait_sec: 120
  poll_interval_sec: 3
  poll_stable_rounds: 2
  preview_wait_sec: 15
`
    if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
        t.Fatalf("write config: %v", err)
    }

    cfg, err := Load(path)
    if err != nil {
        t.Fatalf("load config: %v", err)
    }
    if cfg.Image.SameConversationMaxTurns != 3 {
        t.Fatalf("same_conversation_max_turns = %d", cfg.Image.SameConversationMaxTurns)
    }
    if cfg.Image.PollMaxWaitSec != 120 {
        t.Fatalf("poll_max_wait_sec = %d", cfg.Image.PollMaxWaitSec)
    }
    if cfg.Image.PreviewWaitSec != 15 {
        t.Fatalf("preview_wait_sec = %d", cfg.Image.PreviewWaitSec)
    }
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `go test ./internal/config -run TestLoadImageConfig -v`
Expected: FAIL，提示 `Config` 缺少 `Image` 字段，或 `cfg.Image.*` 读取到零值。

- [ ] **Step 3: 在配置结构中增加图像等待配置**

```go
type Config struct {
    App       AppConfig       `mapstructure:"app"`
    Log       LogConfig       `mapstructure:"log"`
    MySQL     MySQLConfig     `mapstructure:"mysql"`
    Redis     RedisConfig     `mapstructure:"redis"`
    JWT       JWTConfig       `mapstructure:"jwt"`
    Crypto    CryptoConfig    `mapstructure:"crypto"`
    Security  SecurityConfig  `mapstructure:"security"`
    Scheduler SchedulerConfig `mapstructure:"scheduler"`
    Upstream  UpstreamConfig  `mapstructure:"upstream"`
    Image     ImageConfig     `mapstructure:"image"`
    EPay      EPayConfig      `mapstructure:"epay"`
    Backup    BackupConfig    `mapstructure:"backup"`
    SMTP      SMTPConfig      `mapstructure:"smtp"`
}

type ImageConfig struct {
    SameConversationMaxTurns int `mapstructure:"same_conversation_max_turns"`
    PollMaxWaitSec           int `mapstructure:"poll_max_wait_sec"`
    PollIntervalSec          int `mapstructure:"poll_interval_sec"`
    PollStableRounds         int `mapstructure:"poll_stable_rounds"`
    PreviewWaitSec           int `mapstructure:"preview_wait_sec"`
}
```

- [ ] **Step 4: 在样例配置与当前配置中加入 `image` 段**

```yaml
image:
  same_conversation_max_turns: 3
  poll_max_wait_sec: 120
  poll_interval_sec: 3
  poll_stable_rounds: 2
  preview_wait_sec: 15
```

把这段分别插入 `configs/config.example.yaml` 与 `configs/config.yaml` 的 `upstream` 段后面，保持当前文件既有缩进风格。

- [ ] **Step 5: 重新运行配置测试**

Run: `go test ./internal/config -run TestLoadImageConfig -v`
Expected: PASS，输出 `--- PASS: TestLoadImageConfig`。

- [ ] **Step 6: 提交这一组修改**

```bash
git add internal/config/config.go internal/config/config_test.go configs/config.example.yaml configs/config.yaml
git commit -m "test: cover image wait config loading"
```

### Task 2: Runner 默认值注入与同会话轮数控制

**Files:**
- Modify: `internal/image/runner.go:31-110`
- Modify: `internal/image/runner.go:291-533`
- Modify: `internal/image/runner_test.go`
- Modify: `cmd/server/main.go:145-146`

- [ ] **Step 1: 先补 Runner 失败测试，锁定配置默认值与预览兜底语义**

在 `internal/image/runner_test.go` 追加以下测试：

```go
func TestRunnerRunUsesConfiguredPollMaxWaitWhenUnset(t *testing.T) {
    r := &Runner{
        cfg: config.ImageConfig{PollMaxWaitSec: 120},
        runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
            if opt.PollMaxWait != 120*time.Second {
                t.Fatalf("PollMaxWait = %s", opt.PollMaxWait)
            }
            result.ConversationID = "conv_cfg_wait"
            result.FileIDs = []string{"sed:preview_1"}
            result.SignedURLs = []string{"https://example.com/preview.png"}
            result.ContentTypes = []string{"image/png"}
            result.IsPreview = true
            return true, "", nil
        },
    }

    res := r.Run(context.Background(), RunOptions{TaskID: "img_cfg_wait"})
    if res.Status != StatusSuccess {
        t.Fatalf("status = %s", res.Status)
    }
    if !res.IsPreview {
        t.Fatalf("expected preview fallback")
    }
}

func TestRunnerImageWaitConfigUsesConfiguredValues(t *testing.T) {
    r := &Runner{cfg: config.ImageConfig{
        SameConversationMaxTurns: 2,
        PollMaxWaitSec:           120,
        PollIntervalSec:          3,
        PollStableRounds:         2,
        PreviewWaitSec:           15,
    }}

    cfg := r.imageWaitConfig()
    if cfg.SameConversationMaxTurns != 2 {
        t.Fatalf("SameConversationMaxTurns = %d", cfg.SameConversationMaxTurns)
    }
    if cfg.PollIntervalSec != 3 {
        t.Fatalf("PollIntervalSec = %d", cfg.PollIntervalSec)
    }
    if cfg.PreviewWaitSec != 15 {
        t.Fatalf("PreviewWaitSec = %d", cfg.PreviewWaitSec)
    }
}

func TestRunnerRunPreservesPreviewFallbackResult(t *testing.T) {
    r := &Runner{
        cfg: config.ImageConfig{SameConversationMaxTurns: 2, PollMaxWaitSec: 120},
        runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
            result.ConversationID = "conv_preview"
            result.FileIDs = []string{"sed:preview_2"}
            result.SignedURLs = []string{"https://example.com/preview-2.png"}
            result.ContentTypes = []string{"image/png"}
            result.TurnsInConv = 2
            result.IsPreview = true
            return true, "", nil
        },
    }

    res := r.Run(context.Background(), RunOptions{TaskID: "img_preview_fallback"})
    if res.Status != StatusSuccess {
        t.Fatalf("status = %s", res.Status)
    }
    if res.TurnsInConv != 2 {
        t.Fatalf("TurnsInConv = %d", res.TurnsInConv)
    }
    if !res.IsPreview {
        t.Fatalf("expected preview fallback")
    }
    if got := len(res.FileIDs); got != 1 || res.FileIDs[0] != "sed:preview_2" {
        t.Fatalf("file ids = %v", res.FileIDs)
    }
}
```

- [ ] **Step 2: 运行 Runner 相关测试并确认失败**

Run: `go test ./internal/image -run 'TestRunnerRunUsesConfiguredPollMaxWaitWhenUnset|TestRunnerImageWaitConfigUsesConfiguredValues|TestRunnerRunPreservesPreviewFallbackResult' -v`
Expected: FAIL，提示 `Runner` 缺少 `cfg` 字段、`imageWaitConfig` 未定义，或 `PollMaxWait` 仍然沿用 300 秒默认值。

- [ ] **Step 3: 在 Runner 中增加配置字段与默认值归一化**

把构造器改成接收 `config.ImageConfig`，并增加一个只负责补默认值的辅助方法：

```go
type Runner struct {
    sched     *scheduler.Scheduler
    dao       *DAO
    cfg       config.ImageConfig
    runOnceFn runnerAttemptFunc
}

func NewRunner(sched *scheduler.Scheduler, dao *DAO, cfg config.ImageConfig) *Runner {
    return &Runner{sched: sched, dao: dao, cfg: cfg}
}

func (r *Runner) normalizeOptions(opt RunOptions) RunOptions {
    if opt.MaxAttempts <= 0 {
        opt.MaxAttempts = 2
    }
    if opt.PerAttemptTimeout <= 0 {
        opt.PerAttemptTimeout = 5 * time.Minute
    }
    if opt.PollMaxWait <= 0 {
        waitSec := r.cfg.PollMaxWaitSec
        if waitSec <= 0 {
            waitSec = 120
        }
        opt.PollMaxWait = time.Duration(waitSec) * time.Second
    }
    if opt.UpstreamModel == "" {
        opt.UpstreamModel = "auto"
    }
    if opt.N <= 0 {
        opt.N = 1
    }
    return opt
}
```

`Run` 开头改成：

```go
opt = r.normalizeOptions(opt)
```

并在 `cmd/server/main.go` 接入：

```go
imageRunner := image.NewRunner(sched, imageDAO, cfg.Image)
```

- [ ] **Step 4: 把同会话轮数与轮询参数全部改为配置驱动**

在 `internal/image/runner.go` 中新增一个统一读取等待配置的辅助方法：

```go
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
```

把原来的写死值替换为：

```go
waitCfg := r.imageWaitConfig()
sameConvMax := waitCfg.SameConversationMaxTurns

pollOpt := chatgpt.PollOpts{
    MaxWait:         opt.PollMaxWait,
    Interval:        time.Duration(waitCfg.PollIntervalSec) * time.Second,
    StableRounds:    waitCfg.PollStableRounds,
    PreviewWait:     time.Duration(waitCfg.PreviewWaitSec) * time.Second,
    BaselineToolIDs: baselineTools,
}
```

- [ ] **Step 5: 补充结果日志字段并复跑 Runner 测试**

把 `image runner result summary` 扩充为：

```go
logger.L().Info("image runner result summary",
    zap.String("task_id", opt.TaskID),
    zap.Uint64("account_id", lease.Account.ID),
    zap.String("conv_id", convID),
    zap.Int("same_conversation_max_turns", waitCfg.SameConversationMaxTurns),
    zap.Int("poll_max_wait_sec", waitCfg.PollMaxWaitSec),
    zap.Int("poll_interval_sec", waitCfg.PollIntervalSec),
    zap.Int("poll_stable_rounds", waitCfg.PollStableRounds),
    zap.Int("preview_wait_sec", waitCfg.PreviewWaitSec),
    zap.Int("turns_used", result.TurnsInConv),
    zap.Bool("is_preview", result.IsPreview),
    zap.Int("refs", len(fileRefs)),
    zap.Strings("refs_list", fileRefs),
    zap.Int("signed_count", len(signedURLs)),
)
```

然后运行：

Run: `go test ./internal/image -run 'TestRunnerRunUsesConfiguredPollMaxWaitWhenUnset|TestRunnerImageWaitConfigUsesConfiguredValues|TestRunnerRunPreservesPreviewFallbackResult|TestRunnerRunRetriesUpstreamErrorUntilSuccess|TestRunnerRunExhaustsConfiguredRetriesForUpstreamError|TestRunnerRunDoesNotExtendPreviewOnlyWhenMaxAttemptsIsOne' -v`
Expected: PASS。

- [ ] **Step 6: 提交这一组修改**

```bash
git add internal/image/runner.go internal/image/runner_test.go cmd/server/main.go
git commit -m "feat: drive image runner waits from config"
```

### Task 3: 轮询时序测试与显式参数校验

**Files:**
- Create: `internal/upstream/chatgpt/image_test.go`
- Modify: `internal/upstream/chatgpt/image.go:494-635`

- [ ] **Step 1: 先写轮询行为测试**

在 `internal/upstream/chatgpt/image_test.go` 创建一个按请求次数返回不同 mapping 的 `httptest.Server`，然后加入以下测试：

```go
func TestPollConversationForImagesReturnsPreviewOnlyAfterConfiguredPreviewWait(t *testing.T) {
    srv := newConversationServer([]map[string]interface{}{
        conversationWithToolMessages(toolMessage("msg-preview", 1, nil, []string{"sed_preview"})),
        conversationWithToolMessages(toolMessage("msg-preview", 1, nil, []string{"sed_preview"})),
        conversationWithToolMessages(toolMessage("msg-preview", 1, nil, []string{"sed_preview"})),
    })
    defer srv.Close()

    cli, err := New(Options{BaseURL: srv.URL, AuthToken: "token", DeviceID: "did"})
    if err != nil {
        t.Fatalf("new client: %v", err)
    }

    status, fids, sids := cli.PollConversationForImages(context.Background(), "conv-1", PollOpts{
        MaxWait:      80 * time.Millisecond,
        Interval:     5 * time.Millisecond,
        PreviewWait:  12 * time.Millisecond,
        StableRounds: 2,
    })

    if status != PollStatusPreviewOnly {
        t.Fatalf("status = %s", status)
    }
    if len(fids) != 0 {
        t.Fatalf("unexpected file ids: %v", fids)
    }
    if !reflect.DeepEqual(sids, []string{"sed_preview"}) {
        t.Fatalf("sediment ids = %v", sids)
    }
}

func TestPollConversationForImagesReturnsIMG2AfterConfiguredStableRounds(t *testing.T) {
    srv := newConversationServer([]map[string]interface{}{
        conversationWithToolMessages(
            toolMessage("msg-preview", 1, nil, []string{"sed_preview"}),
            toolMessage("msg-final", 2, []string{"file_final"}, []string{"sed_preview"}),
        ),
        conversationWithToolMessages(
            toolMessage("msg-preview", 1, nil, []string{"sed_preview"}),
            toolMessage("msg-final", 2, []string{"file_final"}, []string{"sed_preview"}),
        ),
    })
    defer srv.Close()

    cli, err := New(Options{BaseURL: srv.URL, AuthToken: "token", DeviceID: "did"})
    if err != nil {
        t.Fatalf("new client: %v", err)
    }

    status, fids, sids := cli.PollConversationForImages(context.Background(), "conv-1", PollOpts{
        MaxWait:      80 * time.Millisecond,
        Interval:     5 * time.Millisecond,
        PreviewWait:  20 * time.Millisecond,
        StableRounds: 1,
    })

    if status != PollStatusIMG2 {
        t.Fatalf("status = %s", status)
    }
    if !reflect.DeepEqual(fids, []string{"file_final"}) {
        t.Fatalf("file ids = %v", fids)
    }
    if !reflect.DeepEqual(sids, []string{"sed_preview"}) {
        t.Fatalf("sediment ids = %v", sids)
    }
}
```

测试辅助函数也放在同文件，避免散落：

```go
func toolMessage(id string, createTime float64, fileIDs []string, sedimentIDs []string) map[string]interface{} {
    parts := make([]interface{}, 0, len(fileIDs)+len(sedimentIDs))
    for _, fid := range fileIDs {
        parts = append(parts, fmt.Sprintf("file-service://%s", fid))
    }
    for _, sid := range sedimentIDs {
        parts = append(parts, fmt.Sprintf("sediment://%s", sid))
    }
    return map[string]interface{}{
        "id":          id,
        "create_time": createTime,
        "recipient":   "all",
        "author": map[string]interface{}{
            "role": "tool",
            "name": "dalle.text2im",
        },
        "metadata": map[string]interface{}{
            "async_task_type": "image_gen",
            "model_slug":      "gpt-image-1",
        },
        "content": map[string]interface{}{
            "content_type": "multimodal_text",
            "parts":        parts,
        },
    }
}

func conversationWithToolMessages(msgs ...map[string]interface{}) map[string]interface{} {
    mapping := make(map[string]interface{}, len(msgs))
    for _, msg := range msgs {
        mapping[msg["id"].(string)] = map[string]interface{}{"message": msg}
    }
    return map[string]interface{}{
        "current_node": msgs[len(msgs)-1]["id"].(string),
        "mapping":      mapping,
    }
}

func newConversationServer(responses []map[string]interface{}) *httptest.Server {
    var mu sync.Mutex
    idx := 0
    return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        mu.Lock()
        defer mu.Unlock()
        if idx >= len(responses) {
            idx = len(responses) - 1
        }
        _ = json.NewEncoder(w).Encode(responses[idx])
        idx++
    }))
}
```

- [ ] **Step 2: 运行轮询测试并确认失败**

Run: `go test ./internal/upstream/chatgpt -run 'TestPollConversationForImagesReturnsPreviewOnlyAfterConfiguredPreviewWait|TestPollConversationForImagesReturnsIMG2AfterConfiguredStableRounds' -v`
Expected: FAIL，提示测试文件尚未创建、辅助函数未定义，或断言与当前行为不一致。

- [ ] **Step 3: 在轮询层抽一个显式归一化辅助函数，保持默认值兜底**

把 `PollConversationForImages` 开头的默认值处理收束到独立函数，减少后续调参时分散修改：

```go
func normalizePollOpts(opt PollOpts) PollOpts {
    if opt.MaxWait == 0 {
        opt.MaxWait = 300 * time.Second
    }
    if opt.Interval == 0 {
        opt.Interval = 6 * time.Second
    }
    if opt.StableRounds == 0 {
        opt.StableRounds = 4
    }
    if opt.PreviewWait == 0 {
        opt.PreviewWait = 30 * time.Second
    }
    return opt
}
```

然后在 `PollConversationForImages` 开头改成：

```go
opt = normalizePollOpts(opt)
```

其余分支逻辑保持原样，避免把本次修改扩大到协议识别逻辑。

- [ ] **Step 4: 运行轮询测试与全包测试**

Run: `go test ./internal/upstream/chatgpt -v`
Expected: PASS，至少包含新增两个测试的通过输出。

- [ ] **Step 5: 提交这一组修改**

```bash
git add internal/upstream/chatgpt/image.go internal/upstream/chatgpt/image_test.go
git commit -m "test: cover image poll wait windows"
```

### Task 4: 端到端回归验证与观测核对

**Files:**
- Modify: `internal/image/runner.go`
- Modify: `cmd/server/main.go`
- Modify: `configs/config.example.yaml`
- Modify: `configs/config.yaml`

- [ ] **Step 1: 运行后端目标测试集合**

Run:

```bash
go test ./internal/config ./internal/image ./internal/upstream/chatgpt -v
```

Expected: PASS，三个包全部通过。

- [ ] **Step 2: 运行项目编译检查**

Run: `go test ./cmd/server -run TestNonExistent -count=0`
Expected: PASS，输出 `ok   github.com/432539/gpt2api/cmd/server [no tests to run]` 或等价编译成功信息。

- [ ] **Step 3: 启动前检查配置是否携带新字段**

Run:

```bash
rg -n "same_conversation_max_turns|poll_max_wait_sec|poll_interval_sec|poll_stable_rounds|preview_wait_sec" configs/config.example.yaml configs/config.yaml
```

Expected: 两个配置文件都能搜到 5 个字段。

- [ ] **Step 4: 记录上线后观测点**

在变更说明中附上以下核对命令，供上线后观察：

```bash
docker compose logs -f server | rg "image runner (poll done|preview_only|IMG2|result summary)"
```

重点核对日志字段是否完整出现：

```text
same_conversation_max_turns=
poll_max_wait_sec=
poll_interval_sec=
poll_stable_rounds=
preview_wait_sec=
turns_used=
is_preview=
poll_status=
```

- [ ] **Step 5: 提交最终整合修改**

```bash
git add cmd/server/main.go internal/image/runner.go internal/config/config.go internal/config/config_test.go internal/upstream/chatgpt/image.go internal/upstream/chatgpt/image_test.go configs/config.example.yaml configs/config.yaml
git commit -m "feat: shorten image polling waits with config"
```

---

## Spec Coverage Check

规格中的“配置设计”由 Task 1 完成，`image` 段 5 个字段全部入配置与样例文件。

规格中的“Runner 层调整”由 Task 2 完成，包括 `sameConvMax` 去常量化、`PollMaxWait` 默认值配置化、结果语义保持终稿优先与预览兜底。

规格中的“Upstream 轮询层调整”由 Task 3 完成，显式参数继续保留默认值兜底并补时序测试。

规格中的“观测设计”和“验证方式”由 Task 2 的日志扩充与 Task 4 的验证步骤完成。

本计划没有纳入账号评分、异步 worker、数据库结构调整，与规格范围一致。

## Placeholder Scan

计划中的所有代码步骤都给出了明确的文件路径、测试名、命令与代码片段；没有保留 `TODO`、`TBD` 或“参考前文”之类占位表述。

## Type Consistency Check

配置字段统一使用 `SameConversationMaxTurns`、`PollMaxWaitSec`、`PollIntervalSec`、`PollStableRounds`、`PreviewWaitSec`。

Runner 结果字段统一使用 `TurnsInConv` 与 `IsPreview`。

轮询状态统一使用 `PollStatusPreviewOnly` 与 `PollStatusIMG2`，避免后续步骤出现不同命名。
