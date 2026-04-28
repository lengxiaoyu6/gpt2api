import { describe, expect, test } from 'vitest'

import * as utils from './utils'

describe('formatCredit', () => {
  test('scales credit values by 10000 and keeps two decimals', () => {
    const formatCredit = (utils as Record<string, unknown>).formatCredit as
      | ((value: number | null | undefined) => string)
      | undefined

    expect(typeof formatCredit).toBe('function')
    expect(formatCredit?.(89900)).toBe('8.99')
    expect(formatCredit?.(1234)).toBe('0.12')
    expect(formatCredit?.(88)).toBe('0.01')
  })

  test('returns zero for empty or invalid credit values', () => {
    const formatCredit = (utils as Record<string, unknown>).formatCredit as
      | ((value: number | null | undefined) => string)
      | undefined

    expect(typeof formatCredit).toBe('function')
    expect(formatCredit?.(null)).toBe('0')
    expect(formatCredit?.(undefined)).toBe('0')
    expect(formatCredit?.(Number.NaN)).toBe('0')
  })
})
