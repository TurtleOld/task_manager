import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError, api } from '../api/client'
import { TooLargeError, failureReason, failureToast, needsCompression } from './attachmentUpload'

const MB = 1024 * 1024

describe('needsCompression', () => {
  it('compresses a heavy camera JPEG', () => {
    expect(needsCompression({ type: 'image/jpeg', size: 4 * MB }, { width: 4000, height: 3000 })).toBe(true)
  })

  it('compresses a light JPEG that is still too large in pixels', () => {
    expect(needsCompression({ type: 'image/jpeg', size: MB }, { width: 1200, height: 3000 })).toBe(true)
  })

  it('compresses a heavy WebP', () => {
    expect(needsCompression({ type: 'image/webp', size: 2 * MB }, { width: 2000, height: 1500 })).toBe(true)
  })

  it('leaves a small JPEG alone', () => {
    expect(needsCompression({ type: 'image/jpeg', size: MB }, { width: 2560, height: 1920 })).toBe(false)
  })

  it('never touches PNG and GIF', () => {
    expect(needsCompression({ type: 'image/png', size: 8 * MB }, { width: 5000, height: 5000 })).toBe(false)
    expect(needsCompression({ type: 'image/gif', size: 8 * MB }, { width: 5000, height: 5000 })).toBe(false)
  })
})

describe('failureReason', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports a file rejected before sending as over the limit', () => {
    expect(failureReason(new TooLargeError(), 'file')).toBe('больше 10 МБ')
  })

  it('reports the HTML 413 page from nginx as over the limit', async () => {
    vi.stubGlobal('document', { cookie: '' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<html><body>413 Request Entity Too Large</body></html>', {
          status: 413,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )
    const error = await api.uploadCardAttachments(1, [new File(['x'], 'чек.jpg')], 'photo').catch((e: unknown) => e)

    expect(failureReason(error, 'photo')).toBe('больше 10 МБ')
  })

  it('explains a rejected photo', () => {
    expect(failureReason(new ApiError(400, 'Это не изображение — загрузите как «Файл»'), 'photo')).toBe(
      'это не изображение — загрузите как «Файл»',
    )
  })

  it('does not leak other 400 details', () => {
    expect(failureReason(new ApiError(400, 'HTTP 400: Bad Request'), 'file')).toBe('не удалось загрузить')
  })

  it('reports a failed fetch as a lost connection', () => {
    expect(failureReason(new NetworkError(), 'file')).toBe('нет связи с сервером')
  })

  it('does not blame the network for a bug in the client', () => {
    expect(failureReason(new TypeError('x is undefined'), 'file')).toBe('не удалось загрузить')
  })

  it('falls back to a generic reason', () => {
    expect(failureReason(new ApiError(500, 'HTTP 500: Internal Server Error'), 'file')).toBe('не удалось загрузить')
  })
})

describe('failureToast', () => {
  it('shows a single failure on its own', () => {
    expect(failureToast([{ name: 'чек.jpg', reason: 'больше 10 МБ' }], 3)).toEqual({
      title: 'чек.jpg: больше 10 МБ',
    })
  })

  it('summarises a partly failed batch', () => {
    const failures = [
      { name: 'a.jpg', reason: 'больше 10 МБ' },
      { name: 'b.jpg', reason: 'нет связи с сервером' },
    ]
    expect(failureToast(failures, 5)).toEqual({
      title: 'Загружено 3 из 5',
      description: 'a.jpg: больше 10 МБ\nb.jpg: нет связи с сервером',
    })
  })
})
