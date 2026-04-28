export type AspectRatio =
  | '1:1'
  | '5:4'
  | '9:16'
  | '16:9'
  | '4:3'
  | '3:2'
  | '4:5'
  | '3:4'
  | '2:3'
  | '21:9'
export type OutputQualityValue = '1K' | '2K' | '4K'

export interface ImageRatioOption {
  label: string
  ratio: AspectRatio
  w: number
  h: number
  desc: string
}

export const IMAGE_RATIO_OPTIONS: ReadonlyArray<ImageRatioOption> = [
  { label: '方形', ratio: '1:1', w: 1, h: 1, desc: '社交媒体' },
  { label: '横屏', ratio: '5:4', w: 5, h: 4, desc: '海报横幅' },
  { label: '故事', ratio: '9:16', w: 9, h: 16, desc: '竖屏短片' },
  { label: '宽屏', ratio: '16:9', w: 16, h: 9, desc: '电影宽屏' },
  { label: '横屏', ratio: '4:3', w: 4, h: 3, desc: '经典画幅' },
  { label: '宽幅', ratio: '3:2', w: 3, h: 2, desc: '摄影横幅' },
  { label: '标准', ratio: '4:5', w: 4, h: 5, desc: '社媒竖幅' },
  { label: '竖版', ratio: '3:4', w: 3, h: 4, desc: '人像摄影' },
  { label: '竖版', ratio: '2:3', w: 2, h: 3, desc: '海报竖幅' },
  { label: '超宽屏', ratio: '21:9', w: 21, h: 9, desc: '全景横幅' },
] as const

const OUTPUT_SIZE_BY_RATIO: Record<AspectRatio, Record<OutputQualityValue, string>> = {
  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '4K': '2880x2880' },
  '5:4': { '1K': '1040x832', '2K': '2080x1664', '4K': '3200x2560' },
  '9:16': { '1K': '720x1280', '2K': '1152x2048', '4K': '2160x3840' },
  '16:9': { '1K': '1280x720', '2K': '2048x1152', '4K': '3840x2160' },
  '4:3': { '1K': '1024x768', '2K': '2048x1536', '4K': '3264x2448' },
  '3:2': { '1K': '1008x672', '2K': '2016x1344', '4K': '3504x2336' },
  '4:5': { '1K': '832x1040', '2K': '1664x2080', '4K': '2560x3200' },
  '3:4': { '1K': '768x1024', '2K': '1536x2048', '4K': '2448x3264' },
  '2:3': { '1K': '672x1008', '2K': '1344x2016', '4K': '2336x3504' },
  '21:9': { '1K': '1344x576', '2K': '2016x864', '4K': '3696x1584' },
}

export const OUTPUT_QUALITY_OPTIONS: ReadonlyArray<{ value: OutputQualityValue; label: string }> = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
] as const

export function resolveOutputSize(ratio: AspectRatio, quality: OutputQualityValue) {
  return OUTPUT_SIZE_BY_RATIO[ratio][quality]
}

export function getRatioPreviewStyle(option: Pick<ImageRatioOption, 'w' | 'h'>) {
  const max = 28
  const ar = option.w / option.h
  const width = ar >= 1 ? max : Math.round(max * ar)
  const height = ar >= 1 ? Math.round(max / ar) : max
  return {
    width: `${width}px`,
    height: `${height}px`,
  }
}
