import { describe, expect, test } from 'vitest'

import { IMAGE_RATIO_OPTIONS, resolveOutputSize } from './options'

describe('image output quality mapping', () => {
  test('exposes only ratios that have concrete size mappings', () => {
    expect(IMAGE_RATIO_OPTIONS.map((option) => option.ratio)).toEqual([
      '1:1',
      '5:4',
      '9:16',
      '16:9',
      '4:3',
      '3:2',
      '4:5',
      '3:4',
      '2:3',
      '21:9',
    ])
  })

  test('maps ratio and quality to actual upstream size', () => {
    expect(resolveOutputSize('1:1', '1K')).toBe('1024x1024')
    expect(resolveOutputSize('5:4', '1K')).toBe('1040x832')
    expect(resolveOutputSize('9:16', '4K')).toBe('2160x3840')
    expect(resolveOutputSize('16:9', '2K')).toBe('2048x1152')
    expect(resolveOutputSize('4:3', '4K')).toBe('3264x2448')
    expect(resolveOutputSize('3:2', '2K')).toBe('2016x1344')
    expect(resolveOutputSize('4:5', '4K')).toBe('2560x3200')
    expect(resolveOutputSize('3:4', '2K')).toBe('1536x2048')
    expect(resolveOutputSize('2:3', '4K')).toBe('2336x3504')
    expect(resolveOutputSize('21:9', '4K')).toBe('3696x1584')
  })
})
