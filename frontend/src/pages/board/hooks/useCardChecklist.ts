import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
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
    try {
      const created = await api.addChecklistItem(selectedCardId, { text, done: false })
      setDraft((prev) => (prev ? { ...prev, checklist: [...(prev.checklist ?? []), created] } : prev))
      toast.success('Пункт чек-листа добавлен')
    } catch {
      toast.error('Не удалось добавить пункт чек-листа')
      setNewChecklistItem(text)
    }
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
      toast.success(updated.done ? 'Пункт чек-листа выполнен' : 'Пункт чек-листа снова активен')
    } catch {
      // Roll back optimistic update on failure
      setDraft((prev) =>
        prev
          ? { ...prev, checklist: prev.checklist.map((i) => (i.id === itemId ? item : i)) }
          : prev
      )
      toast.error('Не удалось обновить пункт чек-листа')
    }
  }

  const removeChecklistItem = async (itemId: number) => {
    if (!selectedCardId || !draft) return
    const snapshot = draft.checklist
    setDraft((prev) => (prev ? { ...prev, checklist: prev.checklist.filter((i) => i.id !== itemId) } : prev))
    try {
      await api.deleteChecklistItem(selectedCardId, itemId)
      toast.success('Пункт чек-листа удалён')
    } catch {
      setDraft((prev) => (prev ? { ...prev, checklist: snapshot } : prev))
      toast.error('Не удалось удалить пункт чек-листа')
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
