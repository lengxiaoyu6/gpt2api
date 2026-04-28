# WAP 历史图片详情模型标识展示设计

## 目标

将 WAP 历史图片详情弹层中的“生成模型”展示从 `model_id` 改为模型 `slug`，当当前模型列表中找不到对应项时显示 `未知`。

## 现状

`wap/src/components/views/History.tsx` 当前在详情弹层中渲染 `MODEL #{selectedImage.model_id}`。历史任务接口 `wap/src/api/me.ts` 仅包含 `model_id`，当前 WAP 端可通过 `useStore` 中的 `imageModels` 获取模型列表，其中包含 `id`、`slug` 与 `description`。

## 方案

### 前端映射

在 `HistoryView` 内读取 `imageModels`，按 `id` 查找当前历史任务对应的模型，并取其 `slug` 作为展示文本。

展示规则如下：

1. 命中模型时显示 `slug`。
2. 未命中模型时显示 `未知`。
3. 保持现有详情弹层结构与样式，仅替换文本来源。

## 范围

### 修改文件

`wap/src/components/views/History.tsx`

增加模型显示解析逻辑，替换详情弹层中的模型展示文本。

`wap/src/components/backend-binding.test.tsx`

补充历史详情中模型展示的回归测试，覆盖命中 `slug` 与回退 `未知` 两种情况。

## 取舍

当前方案仅调整前端页面，不修改 `/api/me/images/tasks` 返回结构。优点是变更范围小，适合当前需求；代价是展示依赖当前模型列表，但当列表缺失时已有明确回退值 `未知`。
