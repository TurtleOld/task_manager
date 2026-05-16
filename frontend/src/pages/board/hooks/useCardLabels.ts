import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { BoardCardDraft, BoardLabel } from '../types'
import { hashLabelColor } from '../lib/labelColor'

interface UseCardLabelsOptions {
  selectedCardId: number | null
  draft: BoardCardDraft | null
  setDraft: Dispatch<SetStateAction<BoardCardDraft | null>>
  allKnownLabels: BoardLabel[]
}

export function useCardLabels({ selectedCardId, draft, setDraft, allKnownLabels }: UseCardLabelsOptions) {
  const [newLabel, setNewLabel] = useState('')
  const selectedLabels = draft?.labels ?? []

  useEffect(() => {
    setNewLabel('')
  }, [selectedCardId])

  const addLabelValue = (input: string | BoardLabel) => {
    if (!selectedCardId || !draft) return
    const candidate: BoardLabel = typeof input === 'string'
      ? { name: input.trim(), color: hashLabelColor(input.trim()) }
      : input
    if (!candidate.name) return
    if (draft.labels.some((label) => label.name === candidate.name)) return
    const known = allKnownLabels.find((label) => label.name === candidate.name)
    const resolved: BoardLabel = known
      ? known
      : { name: candidate.name, color: candidate.color || hashLabelColor(candidate.name) }
    setDraft((prev) => (prev ? { ...prev, labels: [...prev.labels, resolved] } : prev))
    toast.success(`Лейбл «${resolved.name}» добавлен`)
  }

  const addLabel = () => {
    if (!selectedCardId) return
    addLabelValue(newLabel)
    setNewLabel('')
  }

  const removeLabel = (name: string) => {
    if (!selectedCardId || !draft) return
    setDraft((prev) => (prev ? { ...prev, labels: prev.labels.filter((item) => item.name !== name) } : prev))
    toast.success(`Лейбл «${name}» удалён`)
  }

  return {
    selectedLabels,
    newLabel,
    setNewLabel,
    addLabelValue,
    removeLabel,
    addLabel,
  }
}
