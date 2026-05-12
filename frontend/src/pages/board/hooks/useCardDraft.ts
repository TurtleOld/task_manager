import { useEffect, useRef, useState } from 'react'
import type { Card } from '../../../api/types'
import { formatIsoForTimeZone, zonedDateTimeLocalToIso } from '../../../shared/lib/timezone'
import type { BoardCardDraft, BoardPriority } from '../types'

export function useCardDraft(selectedCard: Card | null, profileTimeZone: string) {
  const [draft, setDraft] = useState<BoardCardDraft | null>(null)
  const draftBaseRef = useRef<BoardCardDraft | null>(null)
  const deadlineSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isoToDatetimeLocal = (value: string) => formatIsoForTimeZone(value, profileTimeZone)
  const datetimeLocalToIso = (value: string) => zonedDateTimeLocalToIso(value, profileTimeZone)

  useEffect(() => {
    if (!selectedCard) {
      setDraft(null)
      draftBaseRef.current = null
      return
    }

    const base: BoardCardDraft = {
      title: selectedCard.title || '',
      description: selectedCard.description || '',
      assignee: selectedCard.assignee ?? null,
      deadline: selectedCard.deadline ? isoToDatetimeLocal(selectedCard.deadline) : '',
      priority: (selectedCard.priority ?? 2) as BoardPriority,
      labels: selectedCard.labels ?? [],
      checklist: selectedCard.checklist ?? [],
      subtasks: selectedCard.subtasks ?? [],
      attachments: selectedCard.attachments ?? [],
    }
    setDraft(base)
    draftBaseRef.current = base
  }, [selectedCard?.id, profileTimeZone])

  useEffect(() => {
    return () => {
      if (deadlineSaveTimeoutRef.current) clearTimeout(deadlineSaveTimeoutRef.current)
    }
  }, [])

  const scheduleDeadlineSave = () => {
    if (deadlineSaveTimeoutRef.current) {
      clearTimeout(deadlineSaveTimeoutRef.current)
      deadlineSaveTimeoutRef.current = null
    }
  }

  const clearDeadlineSave = () => {
    if (deadlineSaveTimeoutRef.current) {
      clearTimeout(deadlineSaveTimeoutRef.current)
      deadlineSaveTimeoutRef.current = null
    }
  }

  return {
    draft,
    setDraft,
    draftBaseRef,
    scheduleDeadlineSave,
    clearDeadlineSave,
    datetimeLocalToIso,
  }
}
