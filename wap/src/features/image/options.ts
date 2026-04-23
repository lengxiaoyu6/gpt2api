export type AspectRatio = '1:1' | '5:4' | '9:16' | '21:9' | '16:9' | '4:3' | '3:2' | '4:5' | '3:4' | '2:3'
export type UpscaleLevel = '' | '2k' | '4k'

export interface ImageRatioOption {
  label: string
  ratio: AspectRatio
  w: number
  h: number
  size: string
  desc: string
}

export const IMAGE_RATIO_OPTIONS: ReadonlyArray<ImageRatioOption> = [
  { label: '方形', ratio: '1:1', w: 1, h: 1, size: '1024x1024', desc: '社交媒体' },
  { label: '横屏', ratio: '5:4', w: 5, h: 4, size: '1792x1024', desc: '平面海报' },
  { label: '故事', ratio: '9:16', w: 9, h: 16, size: '1024x1792', desc: '短视频' },
  { label: '超宽屏', ratio: '21:9', w: 21, h: 9, size: '1792x1024', desc: '影院横幅' },
  { label: '宽屏', ratio: '16:9', w: 16, h: 9, size: '1792x1024', desc: '电影宽屏' },
  { label: '横屏', ratio: '4:3', w: 4, h: 3, size: '1792x1024', desc: '经典画幅' },
  { label: '宽幅', ratio: '3:2', w: 3, h: 2, size: '1792x1024', desc: '风景摄影' },
  { label: '标准', ratio: '4:5', w: 4, h: 5, size: '1024x1792', desc: '社媒封面' },
  { label: '竖版', ratio: '3:4', w: 3, h: 4, size: '1024x1792', desc: '人像摄影' },
  { label: '竖版', ratio: '2:3', w: 2, h: 3, size: '1024x1792', desc: '海报竖幅' },
] as const

export const ASPECT_RATIO_TO_SIZE: Record<AspectRatio, string> = Object.fromEntries(
  IMAGE_RATIO_OPTIONS.map((option) => [option.ratio, option.size]),
) as Record<AspectRatio, string>

export const OUTPUT_SIZE_OPTIONS: ReadonlyArray<{ value: UpscaleLevel; label: string; desc: string }> = [
  { value: '', label: '原图', desc: '保持原始尺寸' },
  { value: '2k', label: '2K 高清', desc: '适合细节展示' },
  { value: '4k', label: '4K 高清', desc: '适合大图查看' },
] as const

const RATIO_PREFIX_RE = /^\s*Make the aspect ratio\s+\S+\s*,\s*/i

export function applyRatioPrefix(prompt: string, ratio: AspectRatio) {
  const prefix = `Make the aspect ratio ${ratio} , `
  const lines = prompt.split(/\r?\n/)
  if (lines.length > 0 && RATIO_PREFIX_RE.test(lines[0])) {
    lines[0] = lines[0].replace(RATIO_PREFIX_RE, prefix)
    return lines.join('\n')
  }
  return prefix + prompt
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
