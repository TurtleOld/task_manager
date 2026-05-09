export const FONT_SIZE_KEY = 'app_font_size_px'
export const DEFAULT_FONT_SIZE_PX = 15
export const MIN_FONT_SIZE_PX = 13
export const MAX_FONT_SIZE_PX = 18

function clampFontSize(value: number) {
  return Math.min(MAX_FONT_SIZE_PX, Math.max(MIN_FONT_SIZE_PX, Math.round(value)))
}

export function loadAppFontSize(): number {
  try {
    const raw = localStorage.getItem(FONT_SIZE_KEY)
    if (!raw) return DEFAULT_FONT_SIZE_PX
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? clampFontSize(parsed) : DEFAULT_FONT_SIZE_PX
  } catch {
    return DEFAULT_FONT_SIZE_PX
  }
}

export function applyAppFontSize(size: number) {
  const next = clampFontSize(size)
  document.documentElement.style.fontSize = `${next}px`
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(next))
  } catch {
    // ignore storage failures
  }
  return next
}
