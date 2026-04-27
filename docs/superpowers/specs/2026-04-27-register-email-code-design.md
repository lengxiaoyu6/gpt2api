# 注册邮箱验证码设计

## 目标

为用户注册流程增加邮箱验证码校验能力，并同时覆盖 Web 与 WAP 两端注册入口。

本次实现采用邮箱验证码方式，不引入短信、图形验证码或邀请码组合逻辑。

## 接口设计

新增发送验证码接口：

`POST /api/auth/email-code/send`

请求体：

```json
{
  "email": "user@example.com"
}
```

成功返回：

```json
{
  "sent": true,
  "expire_sec": 600,
  "retry_after_sec": 60
}
```

扩展注册接口请求体：

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "nickname": "demo",
  "email_code": "123456"
}
```

## 开关语义

系统设置 `auth.require_email_verify=true` 时：

1. 注册请求中的 `email_code` 为必填字段。
2. 服务端在创建用户前必须校验并消费验证码。
3. 前端展示验证码输入框与发送按钮。

系统设置 `auth.require_email_verify=false` 时：

1. 注册请求允许省略 `email_code`。
2. 服务端忽略 `email_code` 字段。
3. 发送验证码接口按业务拒绝，返回 `email verification is disabled`。

同时将 `auth.require_email_verify` 设为公开设置项，使匿名端可通过 `GET /api/public/site-info` 读取该配置。

## Redis 设计

验证码有效期为 10 分钟，重发冷却为 60 秒。

限频规则如下：

1. 单邮箱 10 分钟最多发送 5 次。
2. 单 IP 10 分钟最多发送 20 次。

Redis 键如下：

```text
auth:register:email_code:value:{email}
auth:register:email_code:cooldown:{email}
auth:register:email_code:rate:email:{email}
auth:register:email_code:rate:ip:{ip}
```

验证码消费采用 Lua compare-and-delete，保证验证码只能使用一次。

## 发送流程

发送验证码接口按以下顺序处理：

1. 邮箱规范化。
2. 校验 `auth.require_email_verify` 开关。
3. 校验 SMTP 服务可用。
4. 校验邮箱域名白名单。
5. 校验邮箱是否已注册。
6. 校验开放注册规则与首位管理员例外。
7. 校验冷却与窗口限频。
8. 生成六位验证码并发送邮件。

## 注册流程

注册接口按以下顺序处理：

1. 规范化邮箱、昵称、验证码。
2. 校验密码长度。
3. 校验邮箱域名白名单。
4. 校验邮箱是否已注册。
5. 校验开放注册规则与首位管理员例外。
6. 在需要邮箱验证时校验并消费验证码。
7. 创建用户。
8. 发放注册赠送积分。
9. 发送欢迎邮件。

## 错误消息

本次实现统一使用以下错误消息：

```text
email verification is disabled
user registration is currently disabled
email already registered
this email domain is not allowed for registration
email code requested too frequently
email code request rate limit exceeded
email service is unavailable
failed to send email verification code
email verification code is required
invalid or expired email verification code
```

## 前端交互

Web 与 WAP 都增加验证码输入框与发送按钮。

倒计时规则采用跨刷新保留并校准：

1. 使用 `sessionStorage` 保存 `{ email, expire_at }`。
2. 页面刷新后恢复倒计时。
3. 服务端返回 `429` 且带 `retry_after_sec` 时，以服务端剩余秒数重写本地到期时间。
4. 邮箱变更时清空验证码输入与旧倒计时。

## 非目标

本次范围内暂不增加错误验证码次数单独计数器。
