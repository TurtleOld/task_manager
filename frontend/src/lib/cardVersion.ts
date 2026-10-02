export function shouldApplyCardVersion(incoming: number, current: number | undefined): boolean {
  if (current == null) return true
  return incoming >= current
}
