import { priorityToTone } from '../../../shared/lib/priority'

const priorityRingClass: Record<ReturnType<typeof priorityToTone>, string> = {
  neutral: 'border-border-strong',
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-danger',
}

/** Цвет приоритета — кольцо, как у чекбоксов в агенде. */
export function priorityRing(priority: number | null | undefined): string {
  return priorityRingClass[priorityToTone(priority)]
}

export function russianPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
