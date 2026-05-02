import { heicTo as heicToMainThread } from 'heic-to'
import { heicTo as heicToWorkerThread } from 'heic-to/next'

export type SourceImageFormat = 'png' | 'jpeg' | 'webp' | 'heic' | 'heif'

export const SOURCE_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.heic,.heif,image/png,image/jpeg,image/webp,image/heic,image/heif'
export const SUPPORTED_SOURCE_IMAGE_FORMATS = 'PNG、JPG、WEBP、HEIC、HEIF'

const DIRECT_PREVIEW_SOURCE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const DIRECT_PREVIEW_SOURCE_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp'])
const CONVERTIBLE_SOURCE_IMAGE_TYPES = new Set(['image/heic', 'image/heif'])
const CONVERTIBLE_SOURCE_IMAGE_EXTENSIONS = new Set(['heic', 'heif'])
const HEIF_FILE_TYPE_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'])
const SOURCE_IMAGE_SIGNATURE_BYTES = 32

const getNormalizedSourceImageType = (file: File) => file.type.trim().toLowerCase()

const getSourceImageExtension = (file: File) => file.name.split('.').pop()?.trim().toLowerCase() || ''

const hasHEIFFileTypeBox = (bytes: Uint8Array) => {
  if (bytes.length < 16) {
    return false
  }
  if (String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') {
    return false
  }
  const boxSize = Math.min(
    bytes.length,
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0,
  )
  for (let offset = 8; offset + 4 <= boxSize; offset += 4) {
    const brand = String.fromCharCode(...bytes.slice(offset, offset + 4)).trim().toLowerCase()
    if (HEIF_FILE_TYPE_BRANDS.has(brand)) {
      return true
    }
  }
  return false
}

const readSourceImageSignature = async (file: File) => {
  try {
    const buffer = await file.slice(0, SOURCE_IMAGE_SIGNATURE_BYTES).arrayBuffer()
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

const resolveSourceImageFormatByMetadata = (file: File): SourceImageFormat | null => {
  const normalizedType = getNormalizedSourceImageType(file)
  if (normalizedType === 'image/png') {
    return 'png'
  }
  if (normalizedType === 'image/jpeg') {
    return 'jpeg'
  }
  if (normalizedType === 'image/webp') {
    return 'webp'
  }
  if (normalizedType === 'image/heic') {
    return 'heic'
  }
  if (normalizedType === 'image/heif') {
    return 'heif'
  }

  const extension = getSourceImageExtension(file)
  if (extension === 'png') {
    return 'png'
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    return 'jpeg'
  }
  if (extension === 'webp') {
    return 'webp'
  }
  if (extension === 'heic') {
    return 'heic'
  }
  if (extension === 'heif') {
    return 'heif'
  }
  return null
}

const resolveHEIFFormat = (file: File): SourceImageFormat => {
  const normalizedType = getNormalizedSourceImageType(file)
  if (normalizedType === 'image/heif') {
    return 'heif'
  }
  const extension = getSourceImageExtension(file)
  if (extension === 'heif') {
    return 'heif'
  }
  return 'heic'
}

const toJPEGFileName = (name: string) => {
  const normalizedName = name.trim()
  if (!normalizedName) {
    return 'reference.jpg'
  }
  const dotIndex = normalizedName.lastIndexOf('.')
  const baseName = dotIndex > 0 ? normalizedName.slice(0, dotIndex) : normalizedName
  return `${baseName || 'reference'}.jpg`
}

const convertWithPreferredConverter = async (file: File) => {
  const converter = typeof OffscreenCanvas !== 'undefined' ? heicToWorkerThread : heicToMainThread
  return converter({
    blob: file,
    type: 'image/jpeg',
    quality: 0.9,
  })
}

export const isConvertibleSourceImageFormat = (format: SourceImageFormat) => format === 'heic' || format === 'heif'

export const isDirectPreviewSourceImageFormat = (format: SourceImageFormat) => (
  format === 'png' || format === 'jpeg' || format === 'webp'
)

export const detectSourceImageFormat = async (file: File): Promise<SourceImageFormat | null> => {
  const metadataFormat = resolveSourceImageFormatByMetadata(file)
  if (metadataFormat && isConvertibleSourceImageFormat(metadataFormat)) {
    return metadataFormat
  }

  const signature = await readSourceImageSignature(file)
  if (signature && hasHEIFFileTypeBox(signature)) {
    return resolveHEIFFormat(file)
  }

  if (metadataFormat && isDirectPreviewSourceImageFormat(metadataFormat)) {
    const normalizedType = getNormalizedSourceImageType(file)
    const extension = getSourceImageExtension(file)
    if (
      DIRECT_PREVIEW_SOURCE_IMAGE_TYPES.has(normalizedType)
      || DIRECT_PREVIEW_SOURCE_IMAGE_EXTENSIONS.has(extension)
    ) {
      return metadataFormat
    }
  }

  if (metadataFormat) {
    const normalizedType = getNormalizedSourceImageType(file)
    const extension = getSourceImageExtension(file)
    if (
      CONVERTIBLE_SOURCE_IMAGE_TYPES.has(normalizedType)
      || CONVERTIBLE_SOURCE_IMAGE_EXTENSIONS.has(extension)
      || DIRECT_PREVIEW_SOURCE_IMAGE_TYPES.has(normalizedType)
      || DIRECT_PREVIEW_SOURCE_IMAGE_EXTENSIONS.has(extension)
    ) {
      return metadataFormat
    }
  }

  return null
}

export const convertHEICToJPEG = async (file: File): Promise<File> => {
  const output = await convertWithPreferredConverter(file)
  const convertedBlob = Array.isArray(output) ? output[0] : output
  if (!(convertedBlob instanceof Blob) || convertedBlob.size === 0) {
    throw new Error('empty converted blob')
  }
  return new File([convertedBlob], toJPEGFileName(file.name), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
