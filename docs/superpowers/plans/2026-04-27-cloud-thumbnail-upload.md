# Cloud Thumbnail Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在云存储模式下先生成 JPEG 缩略图，再分别上传原图与缩略图，并把缩略图失败的影响范围限制在当前 `thumb_url` 字段。

**Architecture:** `internal/imagestore` 提供公共缩略图构建函数，供本地文件保存与云上传共用；`internal/image/runner.go` 保持原图上传为主资源路径，同时把缩略图构建或上传异常降级为告警并写入空字符串。实施顺序遵循测试优先：先锁定公共缩略图输出与云上传语义，再补最小实现并回归相关测试。

**Tech Stack:** Go, standard library image codecs, golang.org/x/image/draw, testing

---

## File Map

`internal/imagestore/thumb.go`
负责新增公共缩略图构建能力，统一最长边缩放与 JPEG 编码行为。

`internal/imagestore/thumb_test.go`
负责锁定 PNG 输入转 JPEG、最长边限制、输出内容类型三个关键行为。

`internal/imagestore/local.go`
负责把本地存储路径改为复用公共缩略图构建能力，避免两套实现分叉。

`internal/image/runner.go`
负责调整云上传顺序、缩略图构建辅助函数、告警日志与失败降级语义。

`internal/image/runner_archive_test.go`
负责锁定云模式下原图与缩略图上传字节差异、缩略图内容类型、缩略图失败降级与原图失败仍记归档失败。

---

### Task 1: 公共缩略图构建函数

**Files:**
- Create: `internal/imagestore/thumb.go`
- Create: `internal/imagestore/thumb_test.go`
- Modify: `internal/imagestore/local.go`

- [x] **Step 1: 先补公共缩略图失败测试**

在 `internal/imagestore/thumb_test.go` 写入以下测试：

```go
package imagestore

import (
    "image"
    "strings"
    "testing"
)

func TestBuildThumbnailConvertsPNGToJPEGAndResizes(t *testing.T) {
    out, contentType, err := BuildThumbnail(mustPNGBytes(t, 1200, 800), ThumbnailOptions{MaxEdge: 480, Quality: 80})
    if err != nil {
        t.Fatalf("BuildThumbnail: %v", err)
    }
    if contentType != "image/jpeg" {
        t.Fatalf("content type = %s", contentType)
    }
    if strings.Contains(string(out[:min(len(out), 32)]), "PNG") {
        t.Fatalf("unexpected png header")
    }
    img, _, err := image.Decode(bytes.NewReader(out))
    if err != nil {
        t.Fatalf("decode thumb: %v", err)
    }
    bounds := img.Bounds()
    if bounds.Dx() != 480 || bounds.Dy() != 320 {
        t.Fatalf("thumb size = %dx%d", bounds.Dx(), bounds.Dy())
    }
}
```

- [x] **Step 2: 运行公共缩略图测试并确认失败**

Run: `go test ./internal/imagestore -run TestBuildThumbnailConvertsPNGToJPEGAndResizes -v`
Expected: FAIL，提示 `BuildThumbnail`、`ThumbnailOptions` 未定义。

- [x] **Step 3: 增加公共缩略图实现并改造本地存储调用**

在 `internal/imagestore/thumb.go` 增加：

```go
const (
    DefaultThumbMaxEdge = 480
    DefaultThumbQuality = 82
)

type ThumbnailOptions struct {
    MaxEdge int
    Quality int
}

func BuildThumbnail(data []byte, opt ThumbnailOptions) ([]byte, string, error) {
    img, _, err := image.Decode(bytes.NewReader(data))
    if err != nil {
        return nil, "", err
    }
    maxEdge := opt.MaxEdge
    if maxEdge <= 0 {
        maxEdge = DefaultThumbMaxEdge
    }
    quality := opt.Quality
    if quality <= 0 {
        quality = DefaultThumbQuality
    }
    bounds := img.Bounds()
    targetW, targetH := fitWithin(bounds.Dx(), bounds.Dy(), maxEdge)
    dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
    draw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, draw.Over, nil)
    var buf bytes.Buffer
    if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: quality}); err != nil {
        return nil, "", err
    }
    return buf.Bytes(), "image/jpeg", nil
}
```

并把 `internal/imagestore/local.go` 的 `buildThumb` 调整为复用：

```go
func (l *Local) buildThumb(data []byte) ([]byte, error) {
    thumbData, _, err := BuildThumbnail(data, ThumbnailOptions{
        MaxEdge: l.thumbMaxEdge,
        Quality: l.thumbQuality,
    })
    return thumbData, err
}
```

`SaveTaskImages` 改为调用新的 `buildThumb(src.Data)`。

- [x] **Step 4: 重新运行 imagestore 测试**

Run: `go test ./internal/imagestore -v`
Expected: PASS，包含 `--- PASS: TestBuildThumbnailConvertsPNGToJPEGAndResizes`。

- [ ] **Step 5: 提交这一组修改**

```bash
git add internal/imagestore/thumb.go internal/imagestore/thumb_test.go internal/imagestore/local.go internal/imagestore/local_test.go
git commit -m "test: cover thumbnail generation behavior"
```

### Task 2: Runner 云上传缩略图降级语义

**Files:**
- Modify: `internal/image/runner.go`
- Modify: `internal/image/runner_archive_test.go`

- [x] **Step 1: 先补 Runner 失败测试**

在 `internal/image/runner_archive_test.go` 增加以下测试：

```go
func TestRunnerRunUploadsGeneratedThumbBytesToCloud(t *testing.T) {
    dao := &runnerArchiveDAO{}
    uploader := &runnerCloudUploaderStub{results: []runnerCloudUploadResult{
        {channel: "telegram", url: "https://cdn.example.com/1.png"},
        {channel: "telegram", url: "https://cdn.example.com/1_thumb.jpg"},
    }}
    r := &Runner{
        dao:           dao,
        settings:      runnerStorageSettingsStub{mode: StorageModeCloud},
        cloudUploader: uploader,
        runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
            result.ConversationID = "conv_cloud_thumb"
            result.FileIDs = []string{"file-1"}
            result.SignedURLs = []string{"https://origin.example.com/1.png"}
            result.archiveImages = []imagestore.SourceImage{{Index: 0, Data: mustRunnerPNG(t), ContentType: "image/png"}}
            return true, "", nil
        },
    }

    res := r.Run(context.Background(), RunOptions{TaskID: "img_cloud_thumb"})
    if res.Status != StatusSuccess {
        t.Fatalf("status = %s", res.Status)
    }
    if len(uploader.callData) != 2 {
        t.Fatalf("upload calls = %d", len(uploader.callData))
    }
    if bytes.Equal(uploader.callData[0], uploader.callData[1]) {
        t.Fatal("expected thumb bytes differ from original bytes")
    }
    if got := uploader.callCompress; len(got) != 2 || got[0] || got[1] {
        t.Fatalf("upload compress flags = %#v", got)
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
        runOnceFn: func(ctx context.Context, opt RunOptions, result *RunResult) (bool, string, error) {
            result.ConversationID = "conv_cloud_thumb_fail"
            result.FileIDs = []string{"file-1"}
            result.SignedURLs = []string{"https://origin.example.com/1.png"}
            result.archiveImages = []imagestore.SourceImage{{Index: 0, Data: mustRunnerPNG(t), ContentType: "image/png"}}
            return true, "", nil
        },
    }

    res := r.Run(context.Background(), RunOptions{TaskID: "img_cloud_thumb_fail"})
    if res.Status != StatusSuccess {
        t.Fatalf("status = %s", res.Status)
    }
    if got := res.ThumbURLs; len(got) != 1 || got[0] != "" {
        t.Fatalf("thumb urls = %#v", got)
    }
    if got := dao.lastResultURLs; len(got) != 1 || got[0] != "https://cdn.example.com/1.png" {
        t.Fatalf("dao result urls = %#v", got)
    }
}
```

并把现有云上传成功测试的断言更新为：缩略图上传字节与原图不同、缩略图文件名为 `tmp_<task_id>_<idx>`、压缩标志为 `false`。

- [x] **Step 2: 运行 Runner 相关测试并确认失败**

Run: `go test ./internal/image -run 'TestRunnerRunUploadsCloudImagesAndStoresRemoteURLs|TestRunnerRunUploadsGeneratedThumbBytesToCloud|TestRunnerRunKeepsSuccessWhenThumbUploadFails|TestRunnerRunMarksArchiveFailedWhenCloudUploadFails|TestRunnerArchiveExternalImagesUploadsInlineImageToCloud' -v`
Expected: FAIL，旧实现仍把原图字节上传两次，且缩略图失败会返回 `archive_failed`。

- [x] **Step 3: 在 Runner 中增加缩略图构建与告警降级逻辑**

在 `internal/image/runner.go` 增加辅助函数：

```go
func (r *Runner) buildCloudThumbSource(taskID string, src imagestore.SourceImage) (imagestore.SourceImage, error) {
    thumbData, contentType, err := imagestore.BuildThumbnail(src.Data, imagestore.ThumbnailOptions{})
    if err != nil {
        return imagestore.SourceImage{}, err
    }
    return imagestore.SourceImage{
        Index:       src.Index,
        FileName:    fmt.Sprintf("tmp_%s_%d", taskID, src.Index),
        Data:        thumbData,
        ContentType: contentType,
    }, nil
}
```

把 `uploadCloudImages` 调整为：

```go
uploadedURL, err := r.uploadCloudImage(ctx, uploader, original, channels, false)
if err != nil {
    return err
}
urls = append(urls, uploadedURL)

thumb, err := r.buildCloudThumbSource(taskID, src)
if err != nil {
    logger.L().Warn("image runner build cloud thumbnail failed", ...)
    thumbURLs = append(thumbURLs, "")
    continue
}
thumbURL, err := r.uploadCloudImage(ctx, uploader, thumb, channels, false)
if err != nil {
    logger.L().Warn("image runner upload cloud thumbnail failed", ...)
    thumbURLs = append(thumbURLs, "")
    continue
}
thumbURLs = append(thumbURLs, thumbURL)
```

- [x] **Step 4: 重新运行 Runner 测试**

Run: `go test ./internal/image -run 'TestRunnerRunUploadsCloudImagesAndStoresRemoteURLs|TestRunnerRunUploadsGeneratedThumbBytesToCloud|TestRunnerRunKeepsSuccessWhenThumbUploadFails|TestRunnerRunMarksArchiveFailedWhenCloudUploadFails|TestRunnerArchiveExternalImagesUploadsInlineImageToCloud' -v`
Expected: PASS，原图失败仍然是 `archive_failed`，缩略图失败只留下空字符串。

- [ ] **Step 5: 提交这一组修改**

```bash
git add internal/image/runner.go internal/image/runner_archive_test.go
git commit -m "fix: upload generated thumbnails in cloud mode"
```

### Task 3: 全量校验

**Files:**
- Modify: `docs/superpowers/plans/2026-04-27-cloud-thumbnail-upload.md`

- [x] **Step 1: 运行本次相关测试**

Run: `go test ./internal/imagestore ./internal/image`
Expected: PASS，两个包全部通过。

- [x] **Step 2: 记录执行结果并勾选完成项**

把当前计划文档中的已完成步骤改为 `[x]`，保留尚未执行的命令输出摘要，例如：

```markdown
执行记录：`go test ./internal/imagestore ./internal/image` 通过，`go test ./...` 通过，云模式缩略图失败降级与公共缩略图输出行为已覆盖。
```

- [x] **Step 3: 如有需要再补一次全仓 Go 校验**

Run: `go test ./...`
Expected: PASS；如果存在与本次修改无关的既有失败，只记录实际失败项并停止扩展修改范围。
