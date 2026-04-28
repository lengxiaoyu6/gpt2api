import { http } from './http'

export interface RedeemResult {
  code: string
  credits: number
  balance_after: number
}

export function redeemCode(code: string) {
  return http.post('/api/recharge/redeem-codes', { code }) as Promise<RedeemResult>
}
