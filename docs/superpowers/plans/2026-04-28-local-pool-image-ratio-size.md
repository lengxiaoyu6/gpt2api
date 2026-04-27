# Local Pool Image Ratio Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正本地账号池图片请求，使关闭质量选择时仍按所选比例提交 `size`。

**Architecture:** 仅调整 Web 与 WAP 前端的请求组装条件。`supports_output_size` 继续控制质量选项展示与质量价格档位；本地账号池通过 `has_image_channel` 派生出独立的 `size` 提交条件。

**Tech Stack:** Vue 3, React, TypeScript, node:test, Vitest

---

### Task 1: 先写回归测试

**Files:**
- Modify: `wap/src/store/useStore.test.ts`
- Modify: `web/tests/online-play-pricing.node.test.mjs`
- Test: `cd wap && npm run test -- --run src/store/useStore.test.ts`
- Test: `cd web && node --test tests/online-play-pricing.node.test.mjs`

- [ ] **Step 1: Write the failing test**

将 WAP 现有“关闭输出质量时省略 size”断言改为“本地账号池仍发送 1K 对应 size”，并补一个外置图片渠道仍省略 `size` 的场景。Web 侧补源码断言，要求出现 `has_image_channel` 派生的本地账号池判断和 `1K` 兜底质量。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd wap && npm run test -- --run src/store/useStore.test.ts && cd /root/code/gpt2api/web && node --test tests/online-play-pricing.node.test.mjs`
Expected: FAIL，因为当前实现仍把 `supports_output_size` 与 `size` 提交绑定在一起。

- [ ] **Step 3: Write minimal implementation**

在 `wap/src/store/useStore.ts` 与 `web/src/views/personal/OnlinePlay.vue` 中增加本地账号池判断与 `1K` 兜底质量，再将 `size` 提交条件调整为“支持输出尺寸或属于本地账号池”。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd wap && npm run test -- --run src/store/useStore.test.ts && cd /root/code/gpt2api/web && node --test tests/online-play-pricing.node.test.mjs`
Expected: PASS

### Task 2: 执行静态校验

**Files:**
- Modify: `web/src/views/personal/OnlinePlay.vue`
- Modify: `wap/src/store/useStore.ts`
- Test: `cd web && npm run build`
- Test: `cd wap && npm run lint`

- [ ] **Step 1: Run web build**

Run: `cd web && npm run build`
Expected: PASS

- [ ] **Step 2: Run WAP type check**

Run: `cd wap && npm run lint`
Expected: PASS
