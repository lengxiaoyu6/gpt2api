# 记录详情创作操作入口设计

## 目标

在 Web 端记录详情弹窗中新增三项创作操作入口：`同参数再生成`、`基于此图继续编辑`、`复制本次提示词`。

三项能力与生图结果区保持一致的操作语义，其中前两项采用“切换到创作页并自动带入参数”的方式完成，复制提示词成功后详情弹窗保持打开。

## 范围

本次调整仅覆盖 `web` 端记录详情与创作页之间的参数承接流程，包含以下内容：

1. 记录详情新增三项操作按钮。
2. 记录详情向创作页传递完整创作草稿。
3. 创作页消费草稿并回填表单。
4. 图生图继续编辑所需的远程结果图加载与参考图回填。
5. 对应的状态管理与自动化测试补充。

本次调整范围内不包含以下内容：

1. 历史任务后端接口结构扩展。
2. 记录详情弹窗整体视觉重做。
3. 图片下载、删除记录等现有功能行为变更。
4. API 计费逻辑修改。

## 现状

当前生图结果区已经具备三项能力：

1. `同参数再生成` 使用 `lastSubmittedParams` 再次提交。
2. `基于此图继续编辑` 会切换到图生图模式，并将当前结果图转换为参考图。
3. `复制本次提示词` 调用剪贴板接口后显示成功提示。

对应代码位于 `web/src/components/views/Generate.tsx`。

当前记录详情弹窗位于 `web/src/components/views/History.tsx`，操作区仅包含：

1. `下载原图`
2. `删除记录`

状态管理位于 `web/src/store/useStore.ts`。目前仅具备 `pendingPrompt` 这种单字段跨页传值能力，适合灵感库将提示词带入创作页，尚未具备完整创作草稿的跨页承接结构。

## 设计方案

### 方案选择

本次采用“全局创作草稿状态”的方式，在 `useStore` 中新增一份 `pendingGenerateDraft`。记录详情负责写入草稿并切换到创作页，创作页负责消费草稿、回填界面状态、完成必要的远程图片处理。

采用该方案的原因如下：

1. `HistoryView` 与 `GenerateView` 的职责边界清楚。
2. 记录页无需依赖创作页内部本地状态结构。
3. 后续首页、灵感库、结果区等入口可以复用同一套跨页承接机制。
4. 图生图参考图的远程加载可以统一放在创作页处理，避免在记录页弹窗中进行重量级逻辑。

## 状态设计

### 新增草稿结构

在 `web/src/store/useStore.ts` 中新增草稿类型，建议结构如下：

```ts
type PendingGenerateDraft = {
  source: 'history-repeat' | 'history-continue-edit'
  mode: 'txt' | 'img'
  prompt: string
  modelSlug?: string | null
  aspectRatio?: AspectRatio
  quality?: OutputQualityValue
  count?: 1 | 2 | 3 | 4
  useOriginalSize?: boolean
  requestedSize?: string
  referenceImageUrls?: string[]
}
```

其中字段含义如下：

1. `source` 用于标识草稿来源，便于后续扩展来源差异化处理。
2. `mode` 用于区分文生图与图生图。
3. `prompt` 为回填后的提示词。
4. `modelSlug` 为目标模型 slug。
5. `aspectRatio` 为静态比例值。
6. `quality` 为质量档位。
7. `count` 为文生图张数。
8. `useOriginalSize` 用于标识图生图“原图尺寸”模式。
9. `requestedSize` 保存历史记录中的 `size`，供质量与比例推断使用。
10. `referenceImageUrls` 为图生图需要自动载入的参考图原图地址。

### Store 接口

在 Store 中新增：

1. `pendingGenerateDraft: PendingGenerateDraft | null`
2. `setPendingGenerateDraft(draft: PendingGenerateDraft | null)`
3. `consumePendingGenerateDraft(): PendingGenerateDraft | null`

以下场景需要同步清空草稿：

1. `logout`
2. `forceRelogin`
3. `handleUnauthorized`

`persist` 配置中不持久化该草稿，避免刷新页面后保留过期中间态。

## 参数回填规则

### 历史任务到创作草稿的映射

记录接口当前稳定提供如下字段：

1. `prompt`
2. `size`
3. `n`
4. `model_id`
5. `image_urls`
6. `thumb_urls`
7. `reference_urls`
8. `reference_thumb_urls`

当前接口未提供单独的质量字段，因此质量与比例需要根据 `size` 推断。

### 比例与质量推断规则

采用三层推断顺序：

#### 第一层：静态尺寸精确匹配

使用 `web/src/features/image/options.ts` 中现有尺寸映射，对全部 `AspectRatio + OutputQualityValue` 组合进行匹配。

如果历史 `size` 命中静态尺寸表，则得到：

1. `aspectRatio`
2. `quality`
3. `useOriginalSize = false`

#### 第二层：原图尺寸模式匹配

当任务属于图生图且仅存在一张参考图时，创作页在远程参考图载入完成后可得到参考图宽高。此时对 `1K`、`2K`、`4K` 依次调用 `resolveOriginalOutputSize(width, height, quality)`，将计算结果与历史 `requestedSize` 比较。

如果命中，则得到：

1. `useOriginalSize = true`
2. `quality = 命中的质量档位`
3. `aspectRatio` 保留一个安全值，例如 `1:1`，界面渲染时依据 `useOriginalSize` 展示“原图尺寸”选项

#### 第三层：宽高比回退

当前两层均未命中时：

1. 使用 `size` 解析出宽高。
2. 通过最大公约数化简为比例文本。
3. 若该比例命中现有静态 `AspectRatio` 联合值，则回填该比例。
4. 若无法命中，则回退到 `1:1`。
5. `quality` 回退为 `1K`。

### 模型回填规则

历史记录仅有 `model_id`，需要通过 `imageModels` 在前端完成映射：

1. 在 `imageModels` 中查找 `id === record.model_id` 的模型。
2. 若命中，则将对应 `slug` 写入草稿。
3. 若当前可用模型中不存在该记录模型，则保留创作页当前已选模型，并在消费草稿时给出一次提示。

### 张数回填规则

1. 文生图：按记录中的 `n` 回填，限制在 `1` 到 `4` 之间。
2. 图生图：固定为 `1`，与当前产品约束保持一致。

## 记录详情交互设计

### 操作区布局

记录详情的操作区拆分为两段：

第一段保留现有记录操作：

1. `下载原图`
2. `删除记录`

第二段新增创作操作：

1. `同参数再生成`
2. `基于此图继续编辑`
3. `复制本次提示词`

移动端采用自适应双列布局，复制按钮单独占一行，避免卡片高度过快增长。

### 同参数再生成

点击后先打开确认弹窗，弹窗文案与生图结果区保持同一语义：将使用相同的模型、比例、质量和提示词再次进入创作流程。

确认后的行为分为两类：

#### 文生图记录

写入文生图草稿并切换到创作页，包含：

1. `mode = 'txt'`
2. `prompt = record.prompt`
3. `modelSlug = 映射后的模型 slug`
4. `aspectRatio = 推断结果`
5. `quality = 推断结果`
6. `count = 规范化后的 n`

创作页消费草稿后仅回填表单，不自动提交任务。

#### 图生图记录

写入图生图草稿并切换到创作页，包含：

1. `mode = 'img'`
2. `prompt = record.prompt`
3. `modelSlug = 映射后的模型 slug`
4. `quality = 推断结果`
5. `requestedSize = record.size`
6. `referenceImageUrls = record.reference_urls`

如果该记录只有一张参考图并能命中原图尺寸模式，则写入 `useOriginalSize = true`；否则写入推断后的 `aspectRatio`。

### 基于此图继续编辑

该操作要求当前记录存在结果图，且优先使用详情弹窗当前选中的结果原图。

点击后的行为：

1. 写入图生图草稿。
2. `mode = 'img'`
3. `prompt = record.prompt`
4. `modelSlug = 映射后的模型 slug`
5. `quality = 推断结果`
6. `requestedSize = record.size`
7. `referenceImageUrls = [当前选中的结果原图 URL]`
8. `count = 1`

切换到创作页后，由创作页将该结果图加载为参考图，并回填图生图模式。

### 复制本次提示词

点击后执行剪贴板写入：

1. 成功时提示 `提示词已复制`
2. 失败时提示 `复制提示词失败，请稍后重试`
3. 详情弹窗保持打开

## 创作页消费草稿设计

### 消费时机

`GenerateView` 在初始化与依赖变化后读取 `consumePendingGenerateDraft()`。读取到草稿后进行一次性消费，并清空 Store 中的草稿值，避免重复回填。

`pendingPrompt` 保持现有灵感库用途，`pendingGenerateDraft` 负责完整创作草稿。消费顺序采用：

1. 优先消费 `pendingGenerateDraft`
2. 若为空，再消费 `pendingPrompt`

### 回填行为

#### 文生图草稿

回填：

1. `mode`
2. `prompt`
3. `selectedImageModel`
4. `textAspectRatio`
5. `textOutputQuality`
6. `imageCount`

同时清空旧的结果图，确保页面进入新的创作准备状态。

#### 图生图草稿

回填：

1. `mode = 'img'`
2. `prompt`
3. `selectedImageModel`
4. `imageOutputQuality`
5. `imageAspectRatio` 或 `useOriginalSize` 对应界面状态
6. 自动加载 `referenceImageUrls`

远程图片处理完成后调用现有参考图替换逻辑，将结果图或参考图载入 `sourceImages`。

## 远程参考图处理设计

### 抽取共享能力

将当前 `Generate.tsx` 内部的远程结果图转 `File`、再转 `SourceImage` 的逻辑抽到独立模块，例如：

`web/src/features/image/source-images.ts`

建议抽出以下能力：

1. `resolveSourceImage(file)`
2. `loadRemoteImageAsFile(url, fileName?)`
3. `resolveRemoteSourceImage(url)`

这样可以同时服务于：

1. 创作页结果区的“基于此图继续编辑”
2. 记录详情切换到创作页后的参考图自动回填

### 加载与失败处理

远程参考图回填采用以下规则：

1. 全部成功：完整替换到参考图区。
2. 部分成功：保留成功图片，提示失败数量。
3. 全部失败：保留提示词、模型、比例等字段，提示重新上传参考图。

图生图记录中的参考图最多按现有上限 `4` 张处理。

## 组件复用建议

建议抽出一个共享按钮组组件，例如 `ImageResultActions`，供以下两个场景共同使用：

1. 创作页结果区
2. 记录详情创作操作区

组件负责统一：

1. 按钮顺序
2. 禁用态文案
3. 间距与换行策略
4. 交互回调入口

这样可以保持两个区域的体验一致，降低后续维护成本。

若当前阶段更适合控制改动面，也可以先在两个页面分别实现，再在后续整理为共享组件。本次优先级高于复用的是交互一致性与跨页回填稳定性。

## 异常处理

### 记录状态限制

1. `复制本次提示词`：只要存在非空提示词即可使用。
2. `同参数再生成`：有提示词即可使用，图生图记录若缺少参考图时进入创作页后提示补充参考图。
3. `基于此图继续编辑`：仅当当前记录存在结果原图时可用。

### 草稿消费中的异常

1. 模型缺失：保留当前已选模型，并提示原模型当前不可用。
2. 远程图加载失败：提示参考图载入失败，请重新上传。
3. 历史 `size` 解析失败：比例回退为 `1:1`，质量回退为 `1K`。
4. 图生图记录参考图为空：仍进入图生图模式并回填提示词，等待手动补图。

## 测试设计

### Store 测试

文件：`web/src/store/useStore.test.ts`

补充以下场景：

1. `pendingGenerateDraft` 可以写入与消费。
2. 消费后草稿被清空。
3. `logout`、`forceRelogin`、`handleUnauthorized` 会清空草稿。

### 创作页测试

文件：`web/src/components/generate.image-notice.test.tsx`

补充以下场景：

1. 消费文生图草稿后正确回填提示词、模型、比例、质量、张数。
2. 消费图生图草稿后切换到图生图模式。
3. 图生图草稿会自动加载远程参考图。
4. 图生图原图尺寸命中时，界面显示“原图尺寸”选项。
5. 原模型不可用时，保留当前模型并显示提示。

### 记录页测试

文件：`web/src/components/backend-binding.test.tsx`

补充以下场景：

1. 记录详情显示三项创作操作按钮。
2. 点击 `复制本次提示词` 后调用剪贴板接口，详情弹窗持续打开。
3. 点击 `同参数再生成` 会先打开确认弹窗。
4. 确认后切换到创作页，并写入正确草稿。
5. 点击 `基于此图继续编辑` 后使用当前选中的结果原图写入草稿。
6. 图生图记录缺少结果图时，对应按钮禁用或保护处理正确。

## 实施范围

主要涉及以下文件：

1. `web/src/store/useStore.ts`
2. `web/src/store/useStore.test.ts`
3. `web/src/components/views/Generate.tsx`
4. `web/src/components/views/History.tsx`
5. `web/src/components/generate.image-notice.test.tsx`
6. `web/src/components/backend-binding.test.tsx`

如需抽取共享远程图片处理能力，预计新增：

1. `web/src/features/image/source-images.ts`

## 验收标准

满足以下条件即可视为本次调整完成：

1. 记录详情中可以看到 `同参数再生成`、`基于此图继续编辑`、`复制本次提示词` 三项入口。
2. `同参数再生成` 与 `基于此图继续编辑` 均会切换到创作页并自动回填参数。
3. `复制本次提示词` 成功后详情弹窗保持打开。
4. 图生图记录可以自动带入参考图或当前结果图。
5. 历史 `size` 可以稳定推断出比例与质量，特殊场景具备安全回退。
6. 相关自动化测试全部通过。
