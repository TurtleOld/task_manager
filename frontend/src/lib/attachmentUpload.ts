import { ApiError, NetworkError, type UploadKind } from '../api/client'

const MB = 1024 * 1024
export const ATTACHMENT_MAX_MB = 10
export const ATTACHMENT_MAX_BYTES = ATTACHMENT_MAX_MB * MB

const COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/webp'])
const COMPRESS_ABOVE_BYTES = 1.5 * MB
const PHOTO_MAX_SIDE = 2560
const PHOTO_QUALITY = 0.85

export function needsCompression(
  file: { type: string; size: number },
  dimensions: { width: number; height: number },
): boolean {
  if (!COMPRESSIBLE_TYPES.has(file.type)) return false
  return file.size > COMPRESS_ABOVE_BYTES || Math.max(dimensions.width, dimensions.height) > PHOTO_MAX_SIDE
}

export async function preparePhoto(file: File): Promise<File> {
  if (!COMPRESSIBLE_TYPES.has(file.type)) return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }
  try {
    if (!needsCompression(file, bitmap)) return file
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) return file
    // JPEG has no alpha: a transparent WebP would otherwise turn black.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY))
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]*$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } finally {
    bitmap.close()
  }
}

export class TooLargeError extends Error {
  constructor() {
    super(`File exceeds ${ATTACHMENT_MAX_MB} MB`)
    this.name = 'TooLargeError'
  }
}

export interface UploadFailure {
  name: string
  reason: string
}

export interface UploadProgress {
  current: number
  total: number
}

const TOO_LARGE = `больше ${ATTACHMENT_MAX_MB} МБ`
const NOT_AN_IMAGE = 'это не изображение — загрузите как «Файл»'
const OFFLINE = 'нет связи с сервером'
const GENERIC = 'не удалось загрузить'

export function failureReason(error: unknown, kind: UploadKind): string {
  if (error instanceof TooLargeError) return TOO_LARGE
  if (error instanceof NetworkError) return OFFLINE
  if (error instanceof ApiError) {
    if (error.status === 413) return TOO_LARGE
    if (error.status === 400 && kind === 'photo') return NOT_AN_IMAGE
  }
  return GENERIC
}

export function failureToast(failures: UploadFailure[], total: number): { title: string; description?: string } {
  const lines = failures.map(({ name, reason }) => `${name}: ${reason}`)
  const [only] = lines
  if (lines.length === 1 && only) return { title: only }
  return { title: `Загружено ${total - failures.length} из ${total}`, description: lines.join('\n') }
}
