import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BoardCardDraft } from '../types'

interface UseCardChecklistOptions {
  selectedCardId: number | null
  draft: BoardCardDraft | null
  setDraft: Dispatch<SetStateAction<BoardCardDraft | null>>
}

export function useCardChecklist({ selectedCardId, draft, setDraft }: UseCardChecklistOptions) {
  const [newChecklistItem, setNewChecklistItem] = useState('')
  const selectedChecklist = draft?.checklist ?? []

  useEffect(() => {
    setNewChecklistItem('')
  }, [selectedCardId])

  const addChecklistItem = () => {
    if (!selectedCardId || !draft) return
    const value = newChecklistItem.trim()
    if (!value) return
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, text: value, done: false }
    setDraft((prev) => (prev ? { ...prev, checklist: [...(prev.checklist ?? []), item] } : prev))
    setNewChecklistItem('')
  }

  const toggleChecklistItem = (itemId: string) => {
    if (!selectedCardId || !draft) return
    setDraft((prev) => (prev ? { ...prev, checklist: (prev.checklist ?? []).map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)) } : prev))
  }

  const removeChecklistItem = (itemId: string) => {
    if (!selectedCardId || !draft) return
    setDraft((prev) => (prev ? { ...prev, checklist: (prev.checklist ?? []).filter((item) => item.id !== itemId) } : prev))
  }

  return {
    selectedChecklist,
    newChecklistItem,
    setNewChecklistItem,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
  }
}
