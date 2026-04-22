# 生图耗时优化设计

## 目标

当前同步生图请求平均耗时约为 160 秒到 190 秒，主要耗时集中在单次请求内部的上游等待，而非排队、数据库写入或本地图片代理阶段。

本次优化目标有两项。

第一，继续保持“终稿优先”的同步接口行为，尽量争取 IMG2 终稿。

第二，在保持现有返回语义的前提下压缩平均耗时。若多轮尝试后仍未获得终稿，继续允许以 `is_preview=true` 返回预览结果。

本次范围控制在等待策略与观测能力，不引入新的异步任务执行架构，也不修改计费语义。

## 现状与问题归因

现有代码中的等待策略主要分散在两个位置。

`internal/image/runner.go` 内部将同会话重试轮数固定为 3 轮。

`internal/upstream/chatgpt/image.go` 内部将轮询参数固定为以下默认值。

```go
Interval     = 6s
StableRounds = 4
PreviewWait  = 30s
MaxWait      = 300s
```

这组参数会形成较长的固定等待时间。

当某一轮先出现一条 tool 消息时，系统还会继续等待 30 秒以确认是否出现第二条；若已经出现两条以上 tool 消息，还会再等待多个轮询周期以确认结果稳定。再叠加同会话最多 3 轮尝试，整体耗时会被显著放大。

数据库样本还显示：

1. `created_at -> started_at` 基本为 0 秒，排队不是当前瓶颈。
2. 近期成功任务的 `file_ids` 多为 `sed:*`，表明多数样本没有命中更快的 file-service 直出路径。
3. 现有系统已经具备 `image_tasks` 与任务查询接口，因此本次无须为优化耗时而调整任务模型。

## 设计原则

本次设计遵循四条原则。

1. 同步接口继续优先争取终稿，不将首屏速度置于终稿获取之前。
2. 返回语义保持兼容，继续允许 `is_preview=true` 作为最终兜底。
3. 将关键等待参数从硬编码改为配置项，便于线上按样本逐步调节。
4. 先补齐测试与关键观测，再压缩等待时间，避免把行为变化与定位难度叠在一起。

## 方案比较

### 方案一

保留三轮同会话尝试，同时缩短每轮等待窗口，并将等待参数配置化。

这一方案的特点是：

1. 继续坚持终稿优先。
2. 平均耗时有明显下降空间。
3. 对现有接口、前端提示、计费与任务查询兼容性最好。

代价是部分“本来会在较晚时刻拿到终稿”的请求，可能提前进入预览兜底。

### 方案二

将同会话尝试轮数从 3 轮降为 2 轮，并同步压缩轮询窗口。

这一方案耗时下降幅度更大，但预览兜底比例更容易升高，对“终稿优先”的坚持程度会下降一层。

### 方案三

保持等待策略基本不动，先为调度器增加账号速度评分与命中率评分。

这一方案对行为影响最小，但短期内对平均耗时改善有限，而且需要先补充更多任务级观测数据。

### 采用方案

采用方案一。

保留三轮同会话尝试，但显著压缩轮询等待，并将等待参数改为显式配置项。账号评分调度作为后续增强项，不并入本次修改。

## 配置设计

新增图像等待配置段，建议命名为 `image`。

```yaml
image:
  same_conversation_max_turns: 3
  poll_max_wait_sec: 120
  poll_interval_sec: 3
  poll_stable_rounds: 2
  preview_wait_sec: 15
```

各字段含义如下。

`same_conversation_max_turns` 控制同一账号、同一会话内最多尝试几轮 picture_v2 请求。

`poll_max_wait_sec` 控制单轮轮询总等待上限。

`poll_interval_sec` 控制会话轮询间隔。

`poll_stable_rounds` 控制在判定结果已稳定前，连续观察到相同沉淀结果的轮数。

`preview_wait_sec` 控制首条 tool 消息出现后，为第二条 tool 消息保留的等待窗口。

默认值采用保守压缩策略，而不是极限压缩。其目的在于先观察终稿率与平均耗时的变化，再决定是否继续收紧参数。

## 代码结构调整

### 配置层

在 `internal/config/config.go` 增加图像等待配置结构，并纳入主配置对象。

在 `configs/config.example.yaml` 与 `configs/config.yaml` 增加对应字段。

### Runner 层

在 `internal/image/runner.go` 中移除写死的 `sameConvMax = 3`。

`Runner` 需要接收图像等待配置，并在 `Run` 与 `runOnce` 中使用配置值，而不是依赖内部常量。

`RunOptions.PollMaxWait` 仍然保留，但其默认值改为配置值；调用方未显式指定时，按配置自动补齐。

### Upstream 轮询层

`internal/upstream/chatgpt/image.go` 中的 `PollConversationForImages` 继续保留默认值兜底，但正常业务路径应全部显式传入：

1. `MaxWait`
2. `Interval`
3. `StableRounds`
4. `PreviewWait`

这样可以确保线上行为完全由配置驱动。

### Gateway 层

`internal/gateway/images.go` 中保持同步接口语义不变。

请求仍然同步等待 `Runner.Run` 返回。命中终稿时按现有方式返回图片；若三轮后仍只有预览图，则继续返回 `is_preview=true`。

本次不新增新的请求字段，也不调整已有响应字段。

## 运行时行为

优化后的同步请求路径如下。

1. 账号调度、预扣、任务入库流程保持不变。
2. 单轮 picture_v2 请求仍然先走 `PrepareFConversation` 与 `StreamFConversation`。
3. 若 SSE 已经直出终稿，则立即返回。
4. 若 SSE 未直出终稿，则按配置化轮询参数等待会话结果。
5. 若该轮仅得到预览图，则在同会话内继续下一轮尝试，最多 3 轮。
6. 若 3 轮后仍未得到终稿，则使用最后一轮预览作为兜底返回，并标记 `is_preview=true`。

这一路径与现有行为保持一致，仅缩短等待窗口。

## 观测设计

本次至少补齐日志观测，便于后续继续调参。

建议新增或明确输出以下字段。

1. `same_conversation_max_turns`
2. `poll_max_wait_sec`
3. `poll_interval_sec`
4. `poll_stable_rounds`
5. `preview_wait_sec`
6. `turns_used`
7. `is_preview`
8. `poll_status`
9. `sse_fids`
10. `poll_fids`

如果改动范围允许，后续可以再把 `turns_used` 与 `is_preview` 入库到 `image_tasks`，为调度器做账号评分提供基础数据。本次先以日志为主。

## 测试设计

本次修改需要先补测试，再修改实现。

### Runner 测试

新增 `internal/image/runner_test.go`，覆盖以下行为。

1. `Run` 在未显式传入 `PollMaxWait` 时，会采用配置中的默认值。
2. 同会话最大轮数由配置控制，而不是内部常量。
3. 命中终稿时返回成功且 `IsPreview=false`。
4. 多轮后仍未命中终稿时，继续返回成功且 `IsPreview=true`。

### Upstream 轮询测试

新增或补充 `internal/upstream/chatgpt/image_test.go`，覆盖以下行为。

1. `PollConversationForImages` 在显式传入 `PreviewWait`、`Interval`、`StableRounds` 时，按传入值执行。
2. 单条 tool 消息在超过 `PreviewWait` 后会进入 `preview_only`。
3. 多条 tool 消息在满足稳定条件后会进入 `img2`。

### 配置测试

如当前配置层已有测试模式，则补一条解析测试，确保新增 `image` 段可以正常装载。

## 验证方式

本次修改完成后，验证分为三层。

第一层是单元测试，确认等待参数确实由配置控制，且兜底语义保持不变。

第二层是本地静态验证，确认配置文件可加载、代码可编译。

第三层是任务样本对比。至少观察以下指标：

1. `usage_logs` 中图片请求平均耗时
2. `image_tasks` 中成功任务平均耗时
3. `is_preview=true` 的占比变化
4. `image runner IMG2` 命中日志占比变化

若平均耗时下降而预览占比升幅可接受，则保留该组参数；若预览占比明显升高，再逐步回调 `preview_wait_sec` 或 `poll_stable_rounds`。

## 非本次范围

以下内容不并入本次修改。

1. 真正的异步 worker 架构
2. 基于账号近期表现的调度器评分
3. 数据库表结构调整
4. 图片下载链路并发化
5. 计费、前端文案与接口结构调整

## 实施顺序

1. 为等待参数补配置结构与样例配置。
2. 为 `Runner` 和轮询逻辑补失败测试。
3. 修改实现，使等待参数改为配置驱动。
4. 补日志字段并运行单元测试。
5. 运行编译与目标测试，确认行为保持稳定。
