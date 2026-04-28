import { http } from './http'

export interface LoginReq {
  email: string
  password: string
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  expires_in?: number
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

export function login(req: LoginReq): Promise<LoginResp> {
  return http.post('/api/auth/login', req)
}

export function register(req: RegisterReq): Promise<UserInfo> {
  return http.post('/api/auth/register', req)
}

export function sendRegisterEmailCode(req: SendRegisterEmailCodeReq): Promise<SendRegisterEmailCodeResp> {
  return http.post('/api/auth/email-code/send', req)
}

export function refresh(refreshToken: string): Promise<TokenPair> {
  return http.post('/api/auth/refresh', { refresh_token: refreshToken })
}

export interface MeResp {
  user: UserInfo
  role: string
  permissions: string[]
}

export function getMe(): Promise<MeResp> {
  return http.get('/api/me')
}

export interface MenuItem {
  key: string
  title: string
  icon?: string
  path?: string
  children?: MenuItem[]
}

export interface MenuResp {
  role: string
  menu: MenuItem[]
  permissions: string[]
}

export function getMenu(): Promise<MenuResp> {
  return http.get('/api/me/menu')
}
