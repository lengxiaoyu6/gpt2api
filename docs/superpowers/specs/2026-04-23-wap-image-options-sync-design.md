# WAP 生图参数同步设计

## 目标

将 `wap` 端生成页的图片参数能力同步到 `web` 端当前实现，补齐 10 档画面比例、`原图 / 2K / 4K` 输出尺寸选择，以及比例前缀写入 prompt 的行为。

## 现状

`web/src/views/personal/OnlinePlay.vue` 已具备以下能力：

1. 文生图与图生图各自维护独立的比例选择。
2. 比例列表共 10 档：`1:1`、`5:4`、`9:16`、`21:9`、`16:9`、`4:3`、`3:2`、`4:5`、`3:4`、`2:3`。
3. 输出尺寸支持 `原图`、`2K 高清`、`4K 高清`。
4. 提交请求前，会把 `Make the aspect ratio X:Y , ` 写入 prompt 第一行。
5. `size` 仅作为上游兼容字段，按比例映射到 `1024x1024`、`1792x1024`、`1024x1792` 三档之一。

`wap/src/components/views/Generate.tsx` 当前仅支持 5 档比例，且文生图与图生图共用一套比例状态，没有输出尺寸选择，也没有比例前缀同步逻辑。

## 设计方案

采用 `wap` 端本地统一参数模块的方式，将比例与尺寸配置集中维护，再由页面与状态层共同复用。

### 参数配置模块

新增 `wap/src/features/image/options.ts`，集中维护：

1. `AspectRatio` 类型，扩展为 10 档比例。
2. `UpscaleLevel` 类型：`'' | '2k' | '4k'`。
3. 比例选项数组，包含 `label`、`ratio`、`w`、`h`、`size`、`desc`。
4. `ASPECT_RATIO_TO_SIZE` 映射。
5. `OUTPUT_SIZE_OPTIONS` 选项。
6. `applyRatioPrefix` 方法。
7. `getRatioPreviewStyle` 方法，用于移动端比例缩略框。

这样可以保证页面展示、请求参数映射、测试断言都引用同一套定义。

### store 与 API 调整

`wap/src/api/me.ts` 需要与 `web` 端保持一致：

1. `PlayImageRequest` 新增 `upscale?: '' | '2k' | '4k'`。
2. `playEditImage` 的 `opts` 新增 `upscale`，并写入 `FormData`。

`wap/src/store/useStore.ts` 负责将页面选择转换为接口参数：

1. `generateImage` 接收入参 `upscale`。
2. `editImage` 接收入参 `upscale`。
3. 两者在发送前都调用 `applyRatioPrefix` 处理 prompt。
4. `size` 统一从 `ASPECT_RATIO_TO_SIZE` 中读取。

### 页面结构

`wap/src/components/views/Generate.tsx` 保持移动端卡片布局，仅同步能力，不照搬桌面端排版。

页面状态拆分为两组：

1. 文生图：`textAspectRatio`、`textUpscale`
2. 图生图：`imageAspectRatio`、`imageUpscale`

页面参数区包含：

1. 10 档比例按钮网格
2. 输出尺寸单选按钮组
3. 原有模型选择
4. 原有张数选择
5. 原有 prompt 输入

文生图与图生图提交时分别传递各自参数。

## 交互规则

### 比例处理

比例切换时，仅更新当前模式对应的比例状态。提交前统一通过 `applyRatioPrefix` 把比例前缀插入 prompt 第一行。

规则与 `web` 端一致：

1. 如果第一行已经是 `Make the aspect ratio X:Y ,`，则替换其中比例。
2. 如果第一行没有该前缀，则插入到 prompt 最前面。

### 输出尺寸处理

输出尺寸单选值映射为：

1. `''` → 原图
2. `'2k'` → 2K 高清
3. `'4k'` → 4K 高清

该值由页面直接传入 `store`，再由 `store` 透传到 API。

## 影响文件

### 新增文件

`wap/src/features/image/options.ts`

### 修改文件

`wap/src/api/me.ts`
`wap/src/store/useStore.ts`
`wap/src/components/views/Generate.tsx`
`wap/src/store/useStore.test.ts`
`wap/src/components/app.integration.test.tsx`

## 测试策略

按测试先行方式执行。

### store 测试

验证以下行为：

1. 10 档比例中的横向比例映射到 `1792x1024`。
2. 10 档比例中的纵向比例映射到 `1024x1792`。
3. `generateImage` 会写入比例前缀，并透传 `upscale`。
4. `editImage` 会写入比例前缀，并透传 `upscale`。

### 组件测试

验证以下行为：

1. 生成页展示 10 档比例选项。
2. 生成页展示 `原图 / 2K 高清 / 4K 高清`。
3. 文生图提交时带上当前比例、输出尺寸与张数。
4. 图生图界面能看到同样的参数区。
5. 原有模型切换、价格展示、结果展示行为保持正常。

## 自检

文档中已消除占位内容，比例列表、输出尺寸、影响文件与测试范围已明确，范围集中在 `wap` 端生成页参数同步，没有扩展到 `web` 端结构重构。
