import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import type { RecurrenceRule } from '../../../api/types'

type RecurrencePreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'
type RecurrenceDraft = Pick<RecurrenceRule, 'freq' | 'interval' | 'byweekday' | 'byday' | 'until' | 'count'>

interface UseCardRecurrenceOptions {
  selectedCardId: number | null
  selectedCardIsPending: boolean
  cardDeadline: string
}

const EMPTY_RULE: RecurrenceDraft = {
  freq: 'weekly',
  interval: 1,
  byweekday: [] as number[],
  byday: null as number | null,
  until: null as string | null,
  count: null as number | null,
}

export function useCardRecurrence({ selectedCardId, selectedCardIsPending, cardDeadline }: UseCardRecurrenceOptions) {
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null)
  const [recurrenceDraft, setRecurrenceDraft] = useState<RecurrenceDraft>({ ...EMPTY_RULE })
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>('none')
  const [recurrenceLoading, setRecurrenceLoading] = useState(false)
  const [recurrenceBusy, setRecurrenceBusy] = useState(false)
  const [recurrenceError, setRecurrenceError] = useState('')

  useEffect(() => {
    let mounted = true
    setRecurrenceError('')
    setRecurrenceRule(null)
    setRecurrencePreset('none')
    setRecurrenceDraft({ ...EMPTY_RULE })
    if (!selectedCardId || selectedCardIsPending) return

    setRecurrenceLoading(true)
    api.getCardRecurrence(selectedCardId)
      .then((rule) => {
        if (!mounted) return
        setRecurrenceRule(rule)
        if (rule) {
          setRecurrenceDraft({
            freq: rule.freq,
            interval: rule.interval,
            byweekday: rule.byweekday,
            byday: rule.byday,
            until: rule.until,
            count: rule.count,
          })
          setRecurrencePreset(presetFromRule(rule))
        }
      })
      .catch((error: Error) => {
        if (mounted) setRecurrenceError(error.message)
      })
      .finally(() => {
        if (mounted) setRecurrenceLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [selectedCardId, selectedCardIsPending])

  const applyRecurrencePreset = (preset: RecurrencePreset) => {
    setRecurrencePreset(preset)
    setRecurrenceDraft(ruleFromPreset(preset, cardDeadline))
  }

  const saveRecurrence = async () => {
    if (!selectedCardId || selectedCardIsPending || recurrenceBusy) return false
    setRecurrenceBusy(true)
    setRecurrenceError('')
    try {
      if (recurrencePreset === 'none') {
        await api.deleteCardRecurrence(selectedCardId)
        setRecurrenceRule(null)
        return true
      }
      const saved = await api.saveCardRecurrence(selectedCardId, recurrenceDraft)
      setRecurrenceRule(saved)
      setRecurrencePreset(presetFromRule(saved))
      return true
    } catch (error) {
      setRecurrenceError((error as Error).message)
      return false
    } finally {
      setRecurrenceBusy(false)
    }
  }

  return {
    recurrenceRule,
    recurrenceDraft,
    setRecurrenceDraft,
    recurrencePreset,
    recurrenceLoading,
    recurrenceBusy,
    recurrenceError,
    applyRecurrencePreset,
    saveRecurrence,
  }
}

function ruleFromPreset(preset: RecurrencePreset, cardDeadline: string): RecurrenceDraft {
  const date = cardDeadline ? new Date(cardDeadline) : new Date()
  const weekday = Number.isNaN(date.getTime()) ? new Date().getDay() : date.getDay()
  const mondayBasedWeekday = (weekday + 6) % 7
  const day = Number.isNaN(date.getTime()) ? new Date().getDate() : date.getDate()

  if (preset === 'daily') return { ...EMPTY_RULE, freq: 'daily' }
  if (preset === 'weekdays') return { ...EMPTY_RULE, freq: 'weekly', byweekday: [0, 1, 2, 3, 4] }
  if (preset === 'weekly') return { ...EMPTY_RULE, freq: 'weekly', byweekday: [mondayBasedWeekday] }
  if (preset === 'monthly') return { ...EMPTY_RULE, freq: 'monthly', byday: day }
  if (preset === 'yearly') return { ...EMPTY_RULE, freq: 'yearly', byday: day }
  return { ...EMPTY_RULE }
}

function presetFromRule(rule: Pick<RecurrenceRule, 'freq' | 'interval' | 'byweekday'>): RecurrencePreset {
  if (rule.freq === 'daily' && rule.interval === 1) return 'daily'
  if (rule.freq === 'weekly' && rule.interval === 1 && JSON.stringify(rule.byweekday) === JSON.stringify([0, 1, 2, 3, 4])) return 'weekdays'
  if (rule.freq === 'weekly' && rule.interval === 1) return 'weekly'
  if (rule.freq === 'monthly' && rule.interval === 1) return 'monthly'
  if (rule.freq === 'yearly' && rule.interval === 1) return 'yearly'
  return 'weekly'
}
