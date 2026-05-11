import { ru } from 'chrono-node'
import { resolveTimeZone, zonedDateTimeLocalToIso } from './timezone'

export interface ParsedTaskInput {
  deadline: string | null
  deadlineText: string
  title: string
}

interface ParseTaskInputOptions {
  now?: Date
  timeZone?: string | null
}

const DEFAULT_DEADLINE_HOUR = 9

export function parseTaskInput(input: string, options: ParseTaskInputOptions = {}): ParsedTaskInput {
  const raw = input.trim()
  if (!raw) return { title: '', deadline: null, deadlineText: '' }

  const normalized = normalizeNumericDates(raw)
  const timeZone = resolveTimeZone(options.timeZone)
  const now = options.now ?? new Date()
  const result = ru.casual.parse(normalized, { instant: now, timezone: timeZone }, { forwardDate: true })[0]

  if (!result) return { title: raw, deadline: null, deadlineText: '' }

  const matchedText = raw.slice(result.index, result.index + result.text.length)
  const title = cleanupTitle(`${raw.slice(0, result.index)} ${raw.slice(result.index + result.text.length)}`)
  if (!title) return { title: raw, deadline: null, deadlineText: '' }

  const year = result.start.get('year')
  const month = result.start.get('month')
  const day = result.start.get('day')
  if (!year || !month || !day) return { title: raw, deadline: null, deadlineText: '' }

  const hour = result.start.isCertain('hour') ? result.start.get('hour') ?? DEFAULT_DEADLINE_HOUR : DEFAULT_DEADLINE_HOUR
  const minute = result.start.isCertain('minute') ? result.start.get('minute') ?? 0 : 0
  const localDateTime = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`
  const deadline = zonedDateTimeLocalToIso(localDateTime, timeZone)
  if (!deadline) return { title: raw, deadline: null, deadlineText: '' }

  return {
    title,
    deadline,
    deadlineText: matchedText.trim(),
  }
}

function normalizeNumericDates(value: string) {
  return value.replace(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/g, (_match, day: string, month: string, year?: string) => (
    year ? `${day}/${month}/${year}` : `${day}/${month}`
  ))
}

function cleanupTitle(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:.-]+$/g, '')
    .replace(/^[\s,;:.-]+/g, '')
    .trim()
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0')
}
