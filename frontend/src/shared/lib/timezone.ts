import { api } from '../../api/client'
import type { NotificationProfile } from '../../api/types'

export const DEFAULT_TIMEZONE = 'UTC'

const FALLBACK_TIMEZONES = ['UTC', 'Europe/Moscow', 'Europe/Berlin', 'Asia/Yekaterinburg', 'Asia/Novosibirsk']

export const TIMEZONE_OPTIONS = (() => {
  const supportedValuesOf = Intl.supportedValuesOf as ((key: 'timeZone') => string[]) | undefined
  const values = supportedValuesOf?.('timeZone')?.length ? supportedValuesOf('timeZone') : FALLBACK_TIMEZONES

  return values.map((value) => ({
    value,
    label: value.replaceAll('_', ' '),
  }))
})()

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function resolveTimeZone(value: string | null | undefined): string {
  return isValidTimeZone(value) ? value : DEFAULT_TIMEZONE
}

export function getTimeZoneLabel(value: string | null | undefined): string {
  const resolved = resolveTimeZone(value)
  return TIMEZONE_OPTIONS.find((item) => item.value === resolved)?.label ?? resolved
}

export function getDeviceTimeZone(): string {
  try {
    return resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return DEFAULT_TIMEZONE
  }
}

export async function ensureProfileTimeZoneInitialized(
  profile: NotificationProfile,
  preferredTimeZone: string
): Promise<NotificationProfile> {
  if (profile.timezone_configured) {
    return { ...profile, timezone: resolveTimeZone(profile.timezone) }
  }

  const nextTimeZone = resolveTimeZone(preferredTimeZone)

  try {
    return await api.updateNotificationProfile({ timezone: nextTimeZone })
  } catch {
    return {
      ...profile,
      timezone: nextTimeZone,
      timezone_configured: false,
    }
  }
}

export function formatIsoForTimeZone(value: string, timeZone: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(parsed)
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`
}

export function zonedDateTimeLocalToIso(value: string, timeZone: string): string | null {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const getOffset = (ts: number) => {
    const parts = formatter.formatToParts(new Date(ts))
    const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second)
    )
    return asUtc - ts
  }
  const offset = getOffset(utcGuess)
  const result = utcGuess - offset
  const adjustedOffset = getOffset(result)
  const finalResult = adjustedOffset === offset ? result : utcGuess - adjustedOffset
  const iso = new Date(finalResult).toISOString()
  return Number.isNaN(new Date(iso).getTime()) ? null : iso
}
