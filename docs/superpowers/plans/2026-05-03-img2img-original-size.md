# 图生图原图尺寸 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Web 图生图单图上传场景增加“原图尺寸”比例选项，并按原图宽高比生成动态 `size` 提交。

**Architecture:** 在前端上传阶段记录参考图宽高，界面层按单图条件插入动态比例项，请求层支持 `size` 覆盖值。服务端计费识别从静态尺寸表扩展为“静态映射优先，像素面积兜底归类”。

**Tech Stack:** React、TypeScript、Zustand、Vitest、Go

---

### Task 1: 先补前端与服务端失败测试

**Files:**
Create: 无
Modify: `web/src/components/generate.image-notice.test.tsx`
Modify: `web/src/store/useStore.test.ts`
Modify: `internal/billing/pricing_image_quality_test.go`
Test: `web/src/components/generate.image-notice.test.tsx`
Test: `web/src/store/useStore.test.ts`
Test: `internal/billing/pricing_image_quality_test.go`

- [ ] 为图生图页面增加单图显示“原图尺寸”与提交流程测试。
- [ ] 为 `editImage` 增加 `size` 覆盖优先级测试。
- [ ] 为计费质量识别增加动态尺寸归类测试。

### Task 2: 实现前端动态比例选项与请求参数

**Files:**
Modify: `web/src/components/views/Generate.tsx`
Modify: `web/src/features/image/options.ts`
Modify: `web/src/store/useStore.ts`

- [ ] 为参考图结构补充宽高与比例辅助函数。
- [ ] 图生图单图场景插入“原图尺寸”比例卡片。
- [ ] 生成提交时优先发送动态 `size`。

### Task 3: 实现服务端动态尺寸质量识别

**Files:**
Modify: `internal/billing/pricing.go`
Modify: `internal/billing/pricing_image_quality_test.go`

- [ ] 在静态映射未命中时，按面积将动态尺寸归类到 `1K`、`2K`、`4K`。
- [ ] 保持旧有静态尺寸映射测试继续通过。

### Task 4: 完整验证

**Files:**
Create: 无

- [ ] 运行前端相关 Vitest。
- [ ] 运行 Go 计费测试。
- [ ] 检查 `git diff --stat`，确认仅包含本次变更。
