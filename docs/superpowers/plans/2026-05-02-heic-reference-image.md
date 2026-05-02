# HEIC 参考图自动转码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为图生图增加 HEIC、HEIF 参考图自动转码与前端占位预览能力。

**Architecture:** 前端区分可直接预览图片与需服务端转码图片；服务端在参考图统一预处理阶段识别 HEIC、HEIF 并转为 JPEG，再沿用既有上传、归档、生图流程。转码器通过可替换函数注入，测试使用 stub 隔离外部依赖。

**Tech Stack:** React、Vitest、Go、Gin、heif-convert、Alpine Docker

---

### Task 1: 后端 HEIC 转码入口

**Files:**
Create: 无
Modify: `internal/gateway/image_channel_test.go`, `internal/gateway/images.go`
Test: `internal/gateway/image_channel_test.go`

- [ ] **Step 1: 写后端失败测试**

```go
func TestImageEditsConvertsHEICMultipartReferenceImagesBeforeChannelUpload(t *testing.T) { /* ... */ }
func TestImageGenerationsConvertsHEICJSONReferenceImagesBeforeChannelUpload(t *testing.T) { /* ... */ }
```

- [ ] **Step 2: 运行测试确认当前失败**

Run: `go test ./internal/gateway -run 'TestImage(EditsConvertsHEICMultipartReferenceImagesBeforeChannelUpload|GenerationsConvertsHEICJSONReferenceImagesBeforeChannelUpload)' -count=1`
Expected: FAIL，提示缺少转码实现或断言失败。

- [ ] **Step 3: 实现最小转码逻辑**

```go
var referenceHEICToJPEG = defaultReferenceHEICToJPEG

func normalizeReferenceImageInput(ctx context.Context, data []byte, fileName, declaredContentType string) (image.ReferenceImage, error) { /* ... */ }
func isHEICReferenceImage(data []byte, declaredContentType, fileName string) bool { /* ... */ }
func defaultReferenceHEICToJPEG(ctx context.Context, data []byte) ([]byte, error) { /* ... */ }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `go test ./internal/gateway -run 'TestImage(EditsConvertsHEICMultipartReferenceImagesBeforeChannelUpload|GenerationsConvertsHEICJSONReferenceImagesBeforeChannelUpload|EditsRejectsInvalidMultipartReferenceImageFormat|GenerationsRejectsInvalidJSONReferenceImageFormat)' -count=1`
Expected: PASS

### Task 2: 前端 HEIC 选择与占位卡片

**Files:**
Create: 无
Modify: `web/src/components/generate.image-notice.test.tsx`, `web/src/components/views/Generate.tsx`
Test: `web/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: 写前端失败测试**

```ts
 test('image-to-image accepts heic source images with conversion placeholder and submit payload', async () => { /* ... */ })
```

- [ ] **Step 2: 运行测试确认当前失败**

Run: `pnpm --dir web test --run src/components/generate.image-notice.test.tsx -t 'image-to-image accepts heic source images with conversion placeholder and submit payload'`
Expected: FAIL，`accept` 属性或占位内容与预期不符。

- [ ] **Step 3: 实现最小交互**

```tsx
const SOURCE_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.heic,.heif,image/png,image/jpeg,image/webp,image/heic,image/heif'
interface SourceImage { file: File; preview: string | null; previewMode: 'image' | 'convert' }
```

HEIC、HEIF 使用占位卡片；PNG、JPG、WEBP 维持原有 blob 预览。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir web test --run src/components/generate.image-notice.test.tsx -t 'image-to-image accepts heic source images with conversion placeholder and submit payload'`
Expected: PASS

### Task 3: 部署依赖与整体回归

**Files:**
Create: 无
Modify: `deploy/Dockerfile`
Test: `internal/gateway/image_channel_test.go`, `web/src/components/generate.image-notice.test.tsx`

- [ ] **Step 1: 补充运行时依赖**

```dockerfile
RUN sed -i 's@https\?://dl-cdn.alpinelinux.org@http://mirrors.ustc.edu.cn@g' /etc/apk/repositories \
    && apk add --no-cache ca-certificates tzdata curl bash mariadb-client libheif-tools \
    && update-ca-certificates
```

- [ ] **Step 2: 运行后端回归测试**

Run: `go test ./internal/gateway -count=1`
Expected: PASS

- [ ] **Step 3: 运行前端相关回归测试**

Run: `pnpm --dir web test --run src/components/generate.image-notice.test.tsx`
Expected: PASS
