# WAP 历史图片详情生成耗时展示设计

## 目标

修正 WAP 历史图片详情弹层中的“生成耗时”展示规则，使该字段只表达真实耗时，不再混入任务状态文案。

## 现状

`wap/src/components/views/History.tsx` 当前通过 `getTaskDurationLabel` 计算耗时。当 `started_at` 与 `finished_at` 同时存在时，页面按两者差值展示秒数；当时间字段缺失时，页面会在“生成耗时”一栏展示 `任务失败`、`生成中`、`等待开始`。

后端图片任务流程已经写入耗时所需时间字段：

`internal/image/dao.go` 在任务进入运行态时写入 `started_at=NOW()`，在成功或失败结束时写入 `finished_at=NOW()`。`/api/me/images/tasks` 通过 `internal/image/me_handler.go` 原样返回 `created_at`、`started_at`、`finished_at`。

## 方案

### 展示语义调整

“生成耗时”字段只显示真实耗时。

展示规则如下：

1. `started_at` 与 `finished_at` 同时存在、可解析且结束时间大于等于开始时间时，展示秒数。
2. `started_at` 缺失时，回退使用 `created_at` 与 `finished_at` 计算；两者可解析且结束时间大于等于开始时间时，展示秒数。
3. 其余情况统一展示 `未知`。
4. “任务状态”字段继续使用现有逻辑展示 `处理中`、`任务失败`、`任务已完成`。

### 时间计算规则

优先使用 `started_at -> finished_at` 计算；当 `started_at` 缺失时，回退使用 `created_at -> finished_at`。

这样可以兼容后端尚未写入 `started_at` 的历史任务，优先保留运行时耗时；回退场景会把排队时间计入展示值，但展示结果优于固定显示 `未知`，也与当前业务已返回的时间字段保持一致。

## 范围

### 修改文件

`wap/src/components/views/History.tsx`

调整 `getTaskDurationLabel` 的返回规则，只保留真实耗时与 `未知` 两种输出。

`wap/src/components/backend-binding.test.tsx`

补充历史详情“生成耗时”的回归测试，覆盖成功任务显示秒数、失败任务在有完整时间时显示秒数、`started_at` 缺失时回退 `created_at` 显示秒数、缺少结束时间时显示 `未知`。

## 取舍

当前方案只修改前端展示层，不调整历史任务接口结构。优点是变更范围小，且与现有后端时间字段结构一致，并覆盖了缺失 `started_at` 的历史数据；代价是回退到 `created_at` 时，展示值可能包含排队阶段时间。
