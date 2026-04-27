# 本地账号池比例参数修正设计

## 目标

在本地账号池模型关闭质量选择时，页面仍然按照所选比例提交 `size`，使服务端能够继续根据 `size` 追加宽高比提示。

## 根因

当前前端把 `supports_output_size` 同时用于两个判断：

1. 是否展示质量选项。
2. 是否向后端发送 `size`。

本地账号池模型通常关闭质量选择，因此前端会省略 `size`。服务端收到空值后补成 `1024x1024`，最终退回 `1:1`。

## 方案

### Web 与 WAP 请求组装

图片请求增加两个派生语义：

1. `isLocalPool`：`has_image_channel !== true`。
2. `effectiveQuality`：如果模型支持质量选择则沿用当前选择，否则固定为 `1K`。

提交规则调整为：

1. 本地账号池始终发送 `size`。
2. 外置图片渠道继续只在 `supports_output_size=true` 时发送 `size`。
3. 质量选项的显示条件继续保持现状，仅由 `supports_output_size` 控制。

### 影响范围

涉及文件：

1. `web/src/views/personal/OnlinePlay.vue`
2. `wap/src/store/useStore.ts`
3. `web/tests/online-play-pricing.node.test.mjs`
4. `wap/src/store/useStore.test.ts`

## 验证要点

需要覆盖以下场景：

1. 本地账号池关闭质量选择时，文生图请求仍带 `size`，且质量档位按 `1K` 映射。
2. 本地账号池关闭质量选择时，图生图请求仍带 `size`，且张数限制保持原状。
3. 外置图片渠道关闭 `supports_output_size` 时，请求继续省略 `size`。
4. Web 端源码中保留“隐藏质量选择”与“本地账号池继续提交 `size`”两套独立判断。
