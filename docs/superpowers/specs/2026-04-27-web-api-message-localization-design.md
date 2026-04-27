# web 端 `/api/*` message 中文化设计

## 目标

将本项目 `web` 前端中来自 `/api/*` 业务接口的英文 `message` 统一转换为中文展示文案。

本次仅调整 `web` 端展示层行为，不修改后端返回内容，不修改 `wap`，不修改 `/v1/*` 兼容接口。

## 范围

纳入范围的入口如下：

1. `web/src/api/http.ts` 中对 `{ code, message, data }` 业务响应的处理。
2. `web/src/api/http.ts` 中对 `AxiosError` 的处理。
3. `web` 页面通过 `ApiError.message` 展示的错误文本。
4. `web` 中由 `ElMessage.error(...)` 弹出的接口错误提示。

排除范围如下：

1. 后端 `internal/*`、`pkg/resp/*` 的 message 文案。
2. `wap/*` 请求层与页面。
3. `/v1/*` OpenAI 兼容接口。
4. 非接口错误的本地表单校验文案。

## 现状

当前英文文案主要来自后端 `/api/*` handler 与中间件硬编码返回，例如：

1. `internal/auth/handler.go` 中的 `invalid email or password`、`email already registered`。
2. `internal/middleware/auth.go` 中的 `missing bearer token`、`invalid token: ...`、`insufficient permission`。
3. 其它业务 handler 中的 `not logged in`、`user not found`、`invalid id` 等。

`web/src/api/http.ts` 目前只有登录失败中的 `invalid email or password` 做了局部中文化，其余 message 基本沿用后端原文。

## 方案

### 总体方案

在 `web` 请求层新增统一的 message 本地化工具，并在 `web/src/api/http.ts` 中集中调用。

转换后的中文文案同时作为：

1. `ElMessage.error(...)` 的展示内容。
2. `ApiError.message` 的内容。
3. 401 刷新失败后跳转登录页时携带的提示内容。

这样页面层现有 `catch` 逻辑与提示弹窗可以继续复用，无需逐页修改。

### 文件设计

新增文件：`web/src/utils/api-message.ts`

职责如下：

1. 提供 `localizeApiMessage` 之类的纯函数。
2. 仅处理 `/api/*` 业务接口返回的英文 message。
3. 根据原始英文 message 输出中文文本。
4. 未命中映射时返回原文，避免遮蔽真实错误信息。

修改文件：`web/src/api/http.ts`

接入点如下：

1. `response` 成功回调中，`payload.code !== 0` 时先转换 `payload.message`，再创建 `ApiError` 并弹出提示。
2. `response` 失败回调中，基于请求地址与状态码，将 `payload?.message || error.message` 统一转换后再创建 `ApiError`。
3. 401 登录接口场景移除单条硬编码正则翻译，改为走统一函数。
4. 403 与其它状态的错误提示改为使用转换后的 message。
5. `redirectToLogin(...)` 传入转换后的 message。

### 生效边界

转换函数只对请求 URL 命中 `/api/` 的请求生效。

处理方式如下：

1. 若请求 URL 包含 `/api/`，执行中文化转换。
2. 若请求 URL 为 `/v1/` 或其它非 `/api/` 路径，原样返回 message。
3. Blob 下载与 gzip 下载逻辑保持现状，不增加额外处理。

## 文案映射策略

### 精确匹配

先覆盖已知高频英文 message，例如：

| 英文原文 | 中文文案 |
| --- | --- |
| `invalid email or password` | `邮箱或密码错误` |
| `email already registered` | `邮箱已注册` |
| `user registration is currently disabled` | `当前已关闭用户注册` |
| `this email domain is not allowed for registration` | `当前邮箱域名不允许注册` |
| `password is too short` | `密码长度过短` |
| `email verification code is required` | `请输入邮箱验证码` |
| `invalid or expired email verification code` | `邮箱验证码无效或已过期` |
| `email verification is disabled` | `当前未启用邮箱验证` |
| `email service is unavailable` | `邮件服务暂不可用` |
| `failed to send email verification code` | `发送邮箱验证码失败` |
| `email code requested too frequently` | `邮箱验证码请求过于频繁，请稍后再试` |
| `email code request rate limit exceeded` | `邮箱验证码请求次数已达上限，请稍后再试` |
| `user banned` | `账号已被封禁` |
| `missing bearer token` | `缺少登录凭证` |
| `not authenticated` | `当前未登录` |
| `not logged in` | `请先登录` |
| `unauthorized` | `未登录或登录状态已失效` |
| `admin only` | `仅管理员可访问` |
| `insufficient permission` | `当前账号无权执行此操作` |
| `user not found` | `用户不存在` |
| `group not found` | `分组不存在` |
| `model not found` | `模型不存在` |
| `backup not found` | `备份不存在` |
| `task not found` | `任务不存在` |
| `invalid id` | `标识无效` |
| `items required` | `缺少配置项` |
| `names required` | `缺少名称列表` |
| `email required` | `请输入邮箱` |
| `delta must not be zero` | `变更值不能为 0` |
| `cannot delete yourself` | `不能删除当前账号` |
| `cannot downgrade your own admin role` | `不能降低当前账号的管理员权限` |
| `admin password mismatch` | `管理员密码错误` |
| `old password mismatch` | `原密码错误` |
| `new password must differ from old password` | `新密码不能与原密码相同` |
| `password service not configured` | `密码服务未配置` |
| `daily checkin disabled` | `当前未开启签到功能` |

### 前缀匹配

用于处理后端拼接详情的 message，例如：

| 前缀 | 中文文案 |
| --- | --- |
| `invalid token:` | `登录状态已失效：` |
| `unknown key:` | `未知配置项：` |
| `invalid email:` | `邮箱格式有误：` |
| `file is required:` | `缺少上传文件：` |
| `请求参数错误:` | `请求参数错误：` |
| `解析失败:` | `解析失败：` |

实现时需要同时兼容英文冒号与中文冒号，避免重复替换。

### 兜底策略

未命中映射时，保留后端原文。

这样既避免误译，也保留排查问题所需的信息。后续如发现新的高频英文 message，再补充映射表即可。

## 对现有行为的影响

### 页面层

页面层的 `catch (err)` 与 `submitError.value = err.message` 保持不变，但显示内容将转为中文。

### 提示弹窗

`ElMessage.error(...)` 会统一显示中文 message，不再依赖各页面自行处理。

### 登录与鉴权

原有登录失败场景中的单条正则翻译将被统一映射替代，行为保持一致但实现更集中。

### 兼容性

因为仅在 `web` 内部转换，后端接口协议与其它前端调用侧均保持原样，兼容边界清晰。

## 测试设计

沿用当前 `web/tests/*.node.test.mjs` 的测试方式，先增加源码级约束测试。

建议新增：`web/tests/api-message-localization.node.test.mjs`

测试点如下：

1. `web/src/api/http.ts` 引入统一的 message 本地化工具。
2. `payload.code !== 0` 分支使用本地化后的 message 创建 `ApiError` 并弹出提示。
3. `AxiosError` 分支使用本地化后的 message。
4. 401 登录失败与刷新失败跳转均使用统一本地化结果。
5. `web/src/utils/api-message.ts` 中存在核心映射，例如 `invalid email or password`、`not logged in`、`insufficient permission`。
6. 映射函数仅对 `/api/*` 生效，保留 `/v1/*` 原文。

本次测试先保障请求层接入与核心映射存在，后续如需进一步加强，可补纯函数级运行测试。

## 实施顺序

1. 先新增 `web/tests/api-message-localization.node.test.mjs`，写出失败断言。
2. 再新增 `web/src/utils/api-message.ts`。
3. 修改 `web/src/api/http.ts` 接入统一转换。
4. 运行相关测试，确认通过。
5. 如有必要，再补充更多 message 映射项。

## 验收标准

满足以下条件即可视为完成：

1. `web` 中通过 `/api/*` 返回的常见英文 `message` 显示为中文。
2. `ApiError.message` 与 `ElMessage.error(...)` 使用同一套中文文案。
3. `/v1/*` 兼容接口行为保持不变。
4. `wap` 与后端代码保持不变。
5. 新增测试能够约束统一本地化逻辑的存在与接入位置。
