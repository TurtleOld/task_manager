export const LABEL_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
] as const

export function hashLabelColor(name: string): string {
  let sum = 0
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i)
  return LABEL_PALETTE[sum % LABEL_PALETTE.length] ?? LABEL_PALETTE[0]
}
