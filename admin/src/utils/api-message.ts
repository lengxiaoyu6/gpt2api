const EXACT_MESSAGE_MAP: Record<string, string> = {
  'invalid email or password': '邮箱或密码错误',
  'email already registered': '邮箱已注册',
  'user registration is currently disabled': '当前已关闭用户注册',
  'this email domain is not allowed for registration': '当前邮箱域名不允许注册',
  'password is too short': '密码长度过短',
  'email verification code is required': '请输入邮箱验证码',
  'invalid or expired email verification code': '邮箱验证码无效或已过期',
  'email verification is disabled': '当前未启用邮箱验证',
  'email service is unavailable': '邮件服务暂不可用',
  'failed to send email verification code': '发送邮箱验证码失败',
  'email code requested too frequently': '邮箱验证码请求过于频繁，请稍后再试',
  'email code request rate limit exceeded': '邮箱验证码请求次数已达上限，请稍后再试',
  'user banned': '账号已被封禁',
  'missing bearer token': '缺少登录凭证',
  'not authenticated': '当前未登录',
  'not logged in': '请先登录',
  'unauthorized': '未登录或登录状态已失效',
  'admin only': '仅管理员可访问',
  'insufficient permission': '当前账号无权执行此操作',
  'invalid backup id': '备份标识无效',
  'backup not found': '备份不存在',
  'restore is disabled by config; set backup.allow_restore=true first': '当前未开启恢复功能，请先设置 backup.allow_restore=true',
  'internal server error': '服务器内部错误',
  'invalid id': '标识无效',
  'model not found': '模型不存在',
  'items required': '缺少配置项',
  'email required': '请输入邮箱',
  'role must be user or admin': '角色只能是 user 或 admin',
  'status must be active or banned': '状态只能是 active 或 banned',
  'user not found': '用户不存在',
  'cannot downgrade your own admin role': '不能降低当前账号的管理员权限',
  'admin password mismatch': '管理员密码错误',
  'cannot delete yourself': '不能删除当前账号',
  'delta must not be zero': '变更值不能为 0',
  'group not found': '分组不存在',
  'password service not configured': '密码服务未配置',
  'old password mismatch': '原密码错误',
  'new password must differ from old password': '新密码不能与原密码相同',
  'daily checkin disabled': '当前未开启签到功能',
  'names required': '缺少名称列表',
  'missing refresh token': '缺少刷新令牌',
  'refresh failed': '刷新登录状态失败',
  'smtp not configured: enable smtp and fill mail settings in admin console': 'SMTP 未配置，请先在管理后台填写并启用邮件设置',
  'x-admin-confirm header required for this destructive operation': '当前操作需要提供管理员确认密码',
  'task id required': '缺少任务标识',
  'task not found': '任务不存在',
}

const PREFIX_MESSAGE_MAP = [
  ['invalid token', '登录状态已失效'],
  ['unknown key', '未知配置项'],
  ['invalid email', '邮箱格式有误'],
  ['file is required', '缺少上传文件'],
  ['request failed with status code', '请求失败，状态码'],
] as const

const REGEXP_MESSAGE_RULES: Array<{
  pattern: RegExp
  replace: (rawMessage: string, ...args: string[]) => string
}> = [
  {
    pattern: /^(.+?) must be integer$/i,
    replace: (_rawMessage: string, key: string) => `${key} 必须为整数`,
  },
  {
    pattern: /^(.+?) option disabled:\s*(.+)$/i,
    replace: (_rawMessage: string, key: string, value: string) => `${key} 当前不支持选项：${value}`,
  },
  {
    pattern: /^(.+?) must be one of the allowed options$/i,
    replace: (_rawMessage: string, key: string) => `${key} 必须为允许的选项之一`,
  },
  {
    pattern: /^send failed:\s*(.+)$/i,
    replace: (_rawMessage: string, detail: string) => `发送失败：${detail}`,
  },
  {
    pattern: /^file exceeds\s+(\d+)\s+mb$/i,
    replace: (_rawMessage: string, size: string) => `上传文件超过 ${size} MB 限制`,
  },
] as const

function normalizeRequestPath(requestUrl?: string) {
  const raw = (requestUrl || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw, 'http://local').pathname
  } catch {
    return raw
  }
}

function replacePrefixMessage(rawMessage: string, normalizedMessage: string) {
  for (const [prefix, translated] of PREFIX_MESSAGE_MAP) {
    if (normalizedMessage.startsWith(`${prefix}:`) || normalizedMessage.startsWith(`${prefix}：`)) {
      const suffix = rawMessage.slice(prefix.length + 1).trim()
      return suffix ? `${translated}：${suffix}` : translated
    }
    if (normalizedMessage.startsWith(`${prefix} `)) {
      const suffix = rawMessage.slice(prefix.length).trim()
      return suffix ? `${translated} ${suffix}` : translated
    }
  }
  return rawMessage
}

function replaceRegexpMessage(rawMessage: string) {
  for (const { pattern, replace } of REGEXP_MESSAGE_RULES) {
    const matched = rawMessage.match(pattern)
    if (matched) {
      return replace(rawMessage, ...matched.slice(1))
    }
  }
  return rawMessage
}

export function shouldLocalizeApiMessage(requestUrl?: string) {
  const path = normalizeRequestPath(requestUrl)
  if (!path) return false
  if (path.startsWith('/v1/')) return false
  return path.startsWith('/api/')
}

export function localizeApiMessage(message?: string, requestUrl?: string) {
  const rawMessage = (message || '').trim()
  if (!rawMessage) return rawMessage
  if (!shouldLocalizeApiMessage(requestUrl)) return rawMessage
  const normalizedMessage = rawMessage.toLowerCase()
  const exactMatched = EXACT_MESSAGE_MAP[normalizedMessage]
  if (exactMatched) return exactMatched
  const prefixMatched = replacePrefixMessage(rawMessage, normalizedMessage)
  if (prefixMatched !== rawMessage) return prefixMatched
  return replaceRegexpMessage(rawMessage)
}
