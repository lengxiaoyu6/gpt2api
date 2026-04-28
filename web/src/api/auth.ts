import { http } from './http'

export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in?: number
}

export interface UserInfo {
  id: number
  email: string
  nickname: string
  role: string
  status: string
  group_id: number
  credit_balance: number
  credit_frozen: number
  created_at?: string
  last_login_at?: string
}

export interface LoginReq {
  email: string
  password: string
}

export interface LoginResp {
  user: UserInfo
  token: TokenPair
}

export interface RegisterReq {
  email: string
  password: string
  nickname?: string
  email_code?: string
}

export interface SendRegisterEmailCodeReq {
  email: string
}

export interface SendRegisterEmailCodeResp {
  sent: boolean
  expire_sec: number
  retry_after_sec: number
}

export function login(req: LoginReq) {
  return http.post('/api/auth/login', req) as Promise<LoginResp>
}

export function register(req: RegisterReq) {
  return http.post('/api/auth/register', req) as Promise<UserInfo>
}

export function sendRegisterEmailCode(req: SendRegisterEmailCodeReq) {
  return http.post('/api/auth/email-code/send', req) as Promise<SendRegisterEmailCodeResp>
}

export function refresh(refreshToken: string) {
  return http.post('/api/auth/refresh', { refresh_token: refreshToken }) as Promise<TokenPair>
}
