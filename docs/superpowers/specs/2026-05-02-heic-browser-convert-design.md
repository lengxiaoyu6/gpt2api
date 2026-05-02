# HEIC 参考图浏览器转码设计

## 目标

图生图上传入口在选择 HEIC、HEIF 参考图后，浏览器本地先转换为 JPEG，再使用转换结果完成预览与提交。服务端继续保留 HEIC 识别与转码逻辑，作为兼容兜底。

## 现状

当前前端已经允许选择 `.heic`、`.heif`，也能识别扩展名伪装的 HEIC 文件头，但界面只显示“提交后自动转换”的占位卡片，提交时仍上传原始文件。这样会产生两个问题。

其一，浏览器端无法看到真实预览，移动端体验较差。

其二，提交给后端的仍是原始 HEIC 文件，浏览器、网关、渠道任一环节只要对 HEIC 兼容性较弱，就会出现偶发失败。

## 设计原则

### 单次上传只保留一份可提交文件

组件内部对每张参考图同时记录原始文件与上传文件。普通图片保持原样；HEIC、HEIF 在转换成功后生成 JPEG 文件，并将其作为唯一提交对象。

### 预览与提交使用同一份转换结果

预览图使用转换后 JPEG 的 blob URL，提交接口使用同一份 JPEG `File`。这样可以保证界面展示与真正提交的内容一致，减少二次失败。

### 服务端逻辑继续保留

`internal/gateway/images.go` 已经具备 HEIC 自动识别与转码逻辑。该逻辑继续保留，用于兼容旧客户端、绕过前端转换、或浏览器端转换失败后仍收到 HEIC 的场景。

## 方案比较

### 方案一

继续维持当前“前端占位、后端转码”的方式。

优点是改动最少。缺点是预览能力缺失，提交链路仍包含 HEIC，移动端体验与成功率都较弱。

### 方案二

前端主线程直接使用浏览器端 HEIC 解码库转成 JPEG。

优点是实现简单。缺点是移动端在大图转换时容易出现界面卡顿，当前项目已有“手机端滚动卡顿”的历史问题，这种方式会继续放大主线程压力。

### 方案三

前端使用 Worker 中的 HEIC 转码能力，完成本地 JPEG 转换，再将结果用于预览和提交。

优点是预览、提交、兼容性三件事一次解决，同时将重计算移出主线程，更适合移动端。缺点是需要新增依赖与 Worker 封装。

本次采用方案三。

## 前端结构调整

### 依赖

`web` 侧新增 `heic-to` 依赖，使用其 Worker 入口完成 HEIC、HEIF 到 JPEG 的浏览器端转换。

### 文件职责

`web/src/components/views/Generate.tsx` 负责上传入口、状态展示、删除、提交流程。

`web/src/lib/heic.ts` 负责 HEIC 文件识别、Worker 转码封装、文件名与 MIME 规范化。

如果 Vite 对 Worker 入口处理需要独立包装，则增加 `web/src/workers/heic-convert.worker.ts`，由 `web/src/lib/heic.ts` 统一调用。组件层只感知“转换结果”，不感知底层 Worker 实现。

### SourceImage 结构

`SourceImage` 从当前的两字段结构扩展为以下语义：

```ts
interface SourceImage {
  originalFile: File
  uploadFile: File
  preview: string | null
  previewMode: 'image' | 'converting' | 'error'
  sourceFormat: 'png' | 'jpeg' | 'webp' | 'heic' | 'heif'
  errorMessage?: string
}
```

其中：

`originalFile` 用于保留原始来源，便于错误提示与调试。

`uploadFile` 是真正提交给 `editImage` 的文件。普通图片等于原始文件，HEIC、HEIF 为转换后的 JPEG。

`preview` 永远指向当前可展示图片。普通图片使用原始文件 blob，HEIC、HEIF 使用转换后 JPEG blob。

`previewMode` 用于驱动界面状态。转换过程中显示加载态，成功后显示图片，失败后显示错误态并阻止提交。

## 上传与转换流程

### 文件识别

沿用当前实现：

先看 MIME；

再看扩展名；

再读取文件前 32 字节检查 `ftyp` 品牌，覆盖“扩展名是 `.png` 但内容其实是 HEIC”的场景。

### 普通图片流程

PNG、JPEG、WEBP 维持现有处理：

生成 blob URL；

记录为 `originalFile=uploadFile=file`；

立即进入可提交列表。

### HEIC、HEIF 流程

识别为 HEIC、HEIF 后，执行以下流程：

先在列表中插入“转换中”卡片，避免界面没有反馈；

在 Worker 中将文件转换为 JPEG；

转换成功后，构造新的 `.jpg` 文件名与 `image/jpeg` MIME；

生成转换后 blob URL，覆盖占位卡片；

将 `uploadFile` 替换为转换后的 JPEG 文件；

转换失败时，移除该文件并给出明确提示。

为了避免失败项继续参与提交，失败文件不会保留在 `sourceImages` 中。

## 预览交互

HEIC 转换成功后，界面与 PNG、JPEG、WEBP 统一，展示真实图片缩略图，而不是“待转换”文案。

转换中的卡片显示明显状态：

“正在转换参考图”

并展示旋转图标或进度占位样式。

移动端与桌面端都保持当前多图宫格布局；转换完成时卡片原位更新，避免列表跳动。

## 提交流程

`handleGenerate` 在图生图模式下改为：

```ts
files: sourceImages.map((image) => image.uploadFile)
```

同时在提交前增加一层校验：

如果仍存在 `previewMode === 'converting'` 的项目，提示“参考图仍在转换中”；

如果转换后有效图片数为 0，提示“请上传参考图”。

这样可以避免用户在转换尚未完成时触发提交。

## 资源释放

组件卸载或删除单张参考图时，继续回收 blob URL。

HEIC 转换前后如果都产生中间 URL，只保留最终预览 URL，旧 URL 立即释放，避免移动端内存占用持续增长。

## 错误处理

前端需要覆盖以下错误：

浏览器端库初始化失败；

文件内容损坏，无法转换；

转换结果为空；

转换后文件超过前端允许的大小。

统一提示文案采用“参考图转换失败，请更换图片后重试”这一类明确文本；日志中保留底层错误信息用于开发排查。

如果浏览器端转换成功但服务端仍返回参考图格式错误，则继续按服务端错误展示。服务端兜底保留，但正常路径已经使用 JPEG 文件提交。

## 测试方案

### 前端单测

`web/src/components/generate.image-notice.test.tsx` 增加以下覆盖：

HEIC 上传后会先进入转换流程，最终显示真实图片预览；

提交时 `editImage` 收到的是 `image/jpeg` 文件，文件名转为 `.jpg`；

扩展名伪装为 `.png` 的 HEIC 文件也会先转 JPEG 再提交；

转换失败时显示错误提示，且 `editImage` 不会收到失败文件；

普通图片与 HEIC 混合上传时，普通图片保持原始文件，HEIC 使用转换后 JPEG。

测试中对 Worker 转码逻辑做模块 mock，避免真实浏览器解码依赖。

### 构建验证

执行 `pnpm --dir web build`，确认 Vite 能正确打包 Worker 与新增依赖。

### 后端回归

执行 `go test ./internal/gateway -count=1`，确认服务端 HEIC 兼容逻辑仍然通过，形成双层保障。

## 兼容性说明

浏览器端转换是主路径，服务端转码是兼容路径。两层能力同时存在时：

新前端获得即时预览与更稳定的提交结果；

旧前端、脚本请求、异常请求仍可由服务端继续处理 HEIC。
