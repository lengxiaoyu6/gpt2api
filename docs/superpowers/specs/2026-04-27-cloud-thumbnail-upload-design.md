# 云存储模式缩略图上传改造设计

## 目标

在云存储模式下，将缩略图生成职责收回到服务端本身，避免将原图再次上传并依赖远端压缩能力，从而解决以下两类问题：

1. 原图较大时，缩略图上传阶段容易失败，进而使整次图片归档失败。
2. 远端压缩未生效时，`thumb_url` 实际指向与原图近似的资源，历史列表与结果展示会把原图当作缩略图使用。

本次改造保持现有接口字段不变，仍然返回 `url` 与 `thumb_url`，仅调整服务端在云存储模式下的归档方式与失败处理语义。

## 当前实现

当前图片归档分为本地存储与云存储两种模式。

本地存储模式下，`internal/imagestore/local.go` 的 `SaveTaskImages` 会在保存原图的同时，本地生成 JPEG 缩略图并落盘。这部分行为已经稳定。

云存储模式下，`internal/image/runner.go` 的 `uploadCloudImages` 会对同一张图片执行两次上传：

1. 第一次上传原图，`serverCompress=false`
2. 第二次继续上传同一份原图字节，仅把 `serverCompress=true` 作为查询参数传给远端图床

当前代码并未在第二次上传前生成较小的缩略图字节，因此远端压缩是否真正生效完全依赖外部服务。只要第二次上传失败，当前任务就会进入 `archive_failed`。此外，历史接口与同步生图接口在 `thumb_url` 为空时会回退到原图地址，因此也会出现“缩略图看起来就是原图”的表现。

## 采用方案

采用“服务端先生成缩略图，再分别上传原图与缩略图”的方案。

改造后的基本语义如下：

1. 原图仍按当前方式上传到云端。
2. 缩略图由服务端本地生成，格式统一为 JPEG。
3. 缩略图上传时发送本地生成后的较小字节，而不是再次发送原图字节。
4. 缩略图上传失败时，保留原图归档结果，`thumb_url` 置空，由现有展示层回退到原图。

这样既能降低缩略图上传体积，也能避免缩略图上传失败拖垮整次任务。

## 结构调整

### 缩略图生成能力抽取

当前本地存储模式的缩略图生成逻辑位于 `internal/imagestore/local.go` 的 `buildThumb` 中，能力已经满足需要，但作用域过窄，只能由本地文件存储调用。

本次调整将缩略图生成能力提取为公共函数，建议放入 `internal/imagestore` 内的独立文件，例如：

`internal/imagestore/thumb.go`

建议提供一个纯函数接口：

```go
func BuildThumbnail(data []byte, opt ThumbnailOptions) ([]byte, string, error)
```

其中：

1. 输入为原图字节。
2. 输出为缩略图字节与内容类型。
3. 默认输出 `image/jpeg`。
4. 选项字段至少包含最长边与 JPEG 质量。

`Local.SaveTaskImages` 与云存储上传逻辑共用这一份能力，避免两套缩放与编码逻辑长期分叉。

### 云存储上传职责调整

当前 `runner.go` 的 `uploadCloudImages` 只负责把原始 `SourceImage` 上传两次。调整后，它需要分清“原图上传数据”和“缩略图上传数据”。

建议改为以下顺序：

1. 对原始 `SourceImage` 直接上传，得到原图 URL。
2. 基于原始字节生成缩略图字节。
3. 以新的 `SourceImage` 构造缩略图上传对象：
   1. `Data` 为缩略图字节
   2. `ContentType` 为 `image/jpeg`
   3. `FileName` 使用 `tmp_<task_id>_<idx>`
4. 上传缩略图，得到缩略图 URL。
5. 将原图 URL 写入 `result_urls`，缩略图 URL 写入 `thumb_urls`。

这里的关键变化是：第二次上传不再重用原始 `src.Data`。

### 失败语义调整

当前实现中，缩略图上传失败会直接返回错误，整任务进入 `archive_failed`。这对于主流程过于苛刻，因为原图已经可用。

调整后区分两类失败：

#### 原图上传失败

原图是图片归档的主体资源。原图上传失败时，任务仍记为 `archive_failed`，因为最终结果页无法提供稳定图片地址。

#### 缩略图生成或上传失败

缩略图属于列表与预览优化资源。缩略图生成失败或上传失败时：

1. 记录告警日志。
2. 当前图片的 `thumb_url` 留空。
3. 整个任务仍视为成功。
4. 前端继续使用现有回退语义，通过原图地址显示卡片图。

这一语义与 `internal/image/me_handler.go` 以及 `internal/gateway/images.go` 现有的回退处理保持一致，因此前端无需额外改动。

## 数据流调整

### 同步图片生成接口

`/api/me/playground/image` 与 `/api/me/playground/image-edit` 在云存储模式下，返回值结构保持不变：

```json
{
  "data": [
    {
      "url": "https://.../original.png",
      "thumb_url": "https://.../thumb.jpg"
    }
  ]
}
```

当缩略图生成或上传失败时：

```json
{
  "data": [
    {
      "url": "https://.../original.png",
      "thumb_url": ""
    }
  ]
}
```

调用方已经存在 `thumb_url || url` 的回退逻辑，因此可保持显示稳定。

### 历史任务接口

`GET /api/me/images/tasks` 与 `GET /api/me/images/tasks/:id` 继续使用当前语义：

1. `thumb_urls[idx]` 有值时返回缩略图地址。
2. `thumb_urls[idx]` 为空时回退为 `image_urls[idx]`。

因此，历史任务页面与 WAP 页面无需修改接口消费规则。

## 参数建议

缩略图建议统一使用以下默认规格：

1. 长边 480 像素。
2. JPEG 质量 80 到 82。
3. 保持原始宽高比。
4. 不裁切，不加水印。

理由如下：

1. 与本地存储现有默认值接近，行为一致。
2. 足够覆盖历史列表卡片、结果缩略条、小图预览。
3. 上传体积通常会显著小于原图，能明显降低远端上传失败概率。

这些值适合先作为代码常量写死；等行为稳定后，再考虑是否开放为系统设置。

## 代码改动范围

### `internal/imagestore`

新增公共缩略图构建能力，并让 `Local.SaveTaskImages` 改为调用公共函数。

建议新增内容：

1. `ThumbnailOptions`
2. `BuildThumbnail`
3. 默认缩略图常量，例如 `DefaultThumbMaxEdge`、`DefaultThumbQuality`

### `internal/image/runner.go`

重点修改 `uploadCloudImages`：

1. 原图上传保持现状。
2. 缩略图上传前先构建 JPEG 缩略图。
3. 缩略图失败从“整任务失败”调整为“当前图无缩略图”。
4. 最终 `thumbURLs` 允许包含空字符串。

建议补一个小型辅助函数，例如：

```go
func (r *Runner) buildCloudThumbSource(taskID string, src imagestore.SourceImage) (imagestore.SourceImage, error)
```

这样 `uploadCloudImages` 主体可以保持清晰。

### `internal/imagestore/sanyue_img_hub.go`

上传器主体接口可以保持不变，因为它本身只负责传输字节；真正变化的是传入的数据由原图字节改成缩略图字节。

可选优化是：

1. 缩略图上传时将 `serverCompress` 固定为 `false`，避免对已经压缩完成的 JPEG 再交给远端重复处理。
2. 保留参数兼容性，但在调用侧显式控制。

建议优先采用第一种，行为更确定。

## 日志与观测

需要补充两类日志：

### 缩略图生成失败

记录字段建议包含：

1. `task_id`
2. `idx`
3. 原图内容类型
4. 原图字节大小
5. 错误信息

### 缩略图上传失败

记录字段建议包含：

1. `task_id`
2. `idx`
3. 缩略图字节大小
4. 上传通道
5. 错误信息

日志级别适合使用 `Warn`。因为主任务仍成功，日志的作用主要是排查质量问题与上传通道稳定性。

## 测试范围

### 单元测试

重点补充以下测试：

1. 公共缩略图函数可将 PNG 输入转换为 JPEG 输出。
2. 缩略图尺寸符合最长边约束。
3. 云存储模式下，原图上传与缩略图上传使用不同字节。
4. 缩略图上传对象的 `ContentType` 为 `image/jpeg`。
5. 缩略图生成失败时，任务仍成功，`thumb_urls` 对应位置为空。
6. 缩略图上传失败时，任务仍成功，`result_urls` 保留，`thumb_urls` 对应位置为空。
7. 原图上传失败时，任务进入 `archive_failed`。

### 接口测试

重点验证以下行为：

1. 同步生图成功后，响应中的 `thumb_url` 能返回独立缩略图地址。
2. 缩略图缺失时，响应中的 `thumb_url` 为空，前端展示仍能回退到原图。
3. 历史任务接口在云存储模式下继续正确组装 `thumb_urls`。

## 兼容性

本次调整保持以下内容不变：

1. `ImageGenData` 结构不变。
2. `image_tasks.thumb_urls` 字段语义不变。
3. 前端 `thumb_url || url` 回退规则不变。
4. 历史任务页与 WAP 页的数据消费方式不变。

因此改动主要集中在服务端归档阶段，对现有页面与数据库结构影响较小。

## 后续事项

本次设计先处理“缩略图由服务端本地生成并上传”的问题。后续可继续观察两项指标：

1. 原图与缩略图上传成功率差异。
2. 缩略图平均体积与远端响应时间。

如果后续仍有少量缩略图缺失，再补一轮异步重试即可；这一能力与本次设计兼容，不会推翻当前实现。
