# 用户自主修改密码设计文档

## 目标

为当前登录用户增加自主修改密码能力。提交时必须校验原密码，修改成功后当前端登录态立即清理，并回到认证入口。

本次同时覆盖 `web` 与 `wap` 两个前端。`web` 提供独立“安全中心”页面，`wap` 在既有“安全中心”入口上补充修改密码弹层。

## 范围

本次修改包含以下内容：

1. 后端新增 `POST /api/me/change-password`。
2. 后端个人中心菜单增加“安全中心”。
3. `web` 新增 `/personal/security` 页面与调用接口。
4. `wap` 在“我的”页补充安全中心弹层与重新登录处理。
5. 补充后端、`web`、`wap` 对应测试。

本次保持以下边界：

1. 仅使当前端登录态立即失效。
2. 现有 JWT 体系保持现状，跨设备旧 token 不做统一撤销。
3. 注册、管理员重置密码、其它个人资料页面保持现状。

## 现状

后端当前已有 `auth.Service.VerifyPassword` 与 `HashPassword`，管理员重置密码已复用这两项能力。当前用户接口只有 `Me`、`Menu`、`CreditLogs`，尚无修改密码入口。

`web` 端个人中心菜单来自后端 `/api/me/menu`，静态路由中也尚未声明“安全中心”页面。

`wap` 端“我的”页已有“安全中心”菜单项，但没有点击行为。`logout()` 只会清空状态并切回首页，无法满足“修改成功后立即重新登录”的交互要求。

## 接口设计

新增接口：`POST /api/me/change-password`

请求体：

```json
{
  "old_password": "",
  "new_password": ""
}
```

成功响应：

```json
{
  "updated": true
}
```

错误语义：

1. 原密码错误：返回鉴权失败消息。
2. 新密码长度不足：返回参数错误消息。
3. 新旧密码相同：返回参数错误消息。
4. 用户不存在或状态异常：沿用现有服务层错误映射。

## 后端设计

`internal/user/handler.go` 增加 `ChangePassword`，处理顺序如下：

1. 读取当前用户 ID。
2. 绑定 JSON 请求体。
3. 校验原密码。
4. 校验新密码与当前密码不同。
5. 调用 `HashPassword` 生成新哈希。
6. 调用 DAO 更新当前用户 `password_hash` 与 `version`。
7. 返回 `updated: true`。

为了避免 `user` 包与 `auth` 包循环依赖，继续复用 `internal/user/admin_handler.go` 中已定义的 `PasswordService` 接口，并将其注入普通用户 `Handler`。

密码最小长度与注册逻辑保持一致，`auth.Service.HashPassword` 改为优先读取 `settings.PasswordMinLength()`，缺省仍回退到 6。

## Web 端设计

### 路由与菜单

后端 `internal/rbac/menu.go` 新增个人中心子菜单项：

1. 标题：`安全中心`
2. 路径：`/personal/security`
3. 权限：`self:profile`

`web/src/router/index.ts` 新增静态路由 `security`，组件文件为 `web/src/views/personal/Security.vue`。

### 页面交互

页面提供三个字段：

1. 原密码
2. 新密码
3. 确认新密码

校验规则：

1. 三项必填。
2. 新密码长度至少 6 位。
3. 确认密码与新密码一致。

提交成功后执行：

1. 成功提示。
2. `store.logout()` 清空本地 token。
3. `router.replace('/login')` 回到登录页。

## WAP 端设计

`wap/src/components/views/Profile.tsx` 中，为“安全中心”菜单项增加点击行为，打开修改密码弹层。

弹层内提供：

1. 原密码输入框。
2. 新密码输入框。
3. 确认密码输入框。
4. 提交按钮。

成功后执行：

1. 成功提示。
2. 清空本地 token 与用户状态。
3. 打开认证弹层，使页面回到待登录状态。

为避免在组件内散落状态重置逻辑，`wap/src/store/useStore.ts` 增加一个显式动作，例如 `forceRelogin(tab)`，负责：

1. 清空 token。
2. 清空用户态、历史、模型、签到信息。
3. 切回 `home`。
4. 记录 `pendingTab`。
5. 打开认证弹层。

修改密码成功后调用 `forceRelogin('profile')`。

## 测试设计

### 后端

补充 Go 单元测试，覆盖：

1. `HashPassword` 读取动态密码最小长度。
2. `MenuForRole("user")` 包含“安全中心”。
3. `ChangePassword` 原密码错误、新旧密码相同、成功更新三种路径。

### Web

补充静态 Node 测试，覆盖：

1. `me` API 增加 `changeMyPassword`。
2. 路由增加 `/personal/security`。
3. 菜单树包含“安全中心”。
4. `Security.vue` 含表单字段、提交调用、成功后登出与跳转。

### WAP

补充 Vitest，覆盖：

1. store 的 `forceRelogin('profile')` 会清空状态并打开认证弹层。
2. “安全中心”点击后出现弹层。
3. 提交成功后调用修改密码接口并触发重新登录。

## 验证方式

1. `go test ./internal/auth ./internal/rbac ./internal/user`
2. `cd web && node --test tests/change-password.node.test.mjs`
3. `cd wap && npm run test -- --run src/store/useStore.test.ts src/components/backend-binding.test.tsx`
