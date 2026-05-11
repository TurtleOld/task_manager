import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { api } from '../../../api/client'
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

  const addChecklistItem = async () => {
    if (!selectedCardId || !draft) return
    const text = newChecklistItem.trim()
    if (!text) return
    setNewChecklistItem('')
    const created = await api.addChecklistItem(selectedCardId, { text, done: false })
    setDraft((prev) => (prev ? { ...prev, checklist: [...(prev.checklist ?? []), created] } : prev))
  }

  const toggleChecklistItem = async (itemId: number) => {
    if (!selectedCardId || !draft) return
    const item = draft.checklist.find((i) => i.id === itemId)
    if (!item) return
    // Optimistic update
    setDraft((prev) =>
      prev
        ? { ...prev, checklist: prev.checklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) }
        : prev
    )
    try {
      const updated = await api.updateChecklistItem(selectedCardId, itemId, { done: !item.done })
      setDraft((prev) =>
        prev ? { ...prev, checklist: prev.checklist.map((i) => (i.id === itemId ? updated : i)) } : prev
      )
    } catch {
      // Roll back optimistic update on failure
      setDraft((prev) =>
        prev
          ? { ...prev, checklist: prev.checklist.map((i) => (i.id === itemId ? item : i)) }
          : prev
      )
    }
  }

  const removeChecklistItem = async (itemId: number) => {
    if (!selectedCardId || !draft) return
    const snapshot = draft.checklist
    setDraft((prev) => (prev ? { ...prev, checklist: prev.checklist.filter((i) => i.id !== itemId) } : prev))
    try {
      await api.deleteChecklistItem(selectedCardId, itemId)
    } catch {
      setDraft((prev) => (prev ? { ...prev, checklist: snapshot } : prev))
    }
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
