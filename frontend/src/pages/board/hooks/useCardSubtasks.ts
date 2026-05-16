import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { api } from '../../../api/client'
import { parseTaskInput } from '../../../shared/lib/parseTaskInput'
import type { BoardCardDraft } from '../types'

interface UseCardSubtasksOptions {
  selectedCardId: number | null
  draft: BoardCardDraft | null
  setDraft: Dispatch<SetStateAction<BoardCardDraft | null>>
  profileTimeZone: string
}

export function useCardSubtasks({ selectedCardId, draft, setDraft, profileTimeZone }: UseCardSubtasksOptions) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [subtaskBusy, setSubtaskBusy] = useState(false)
  const selectedSubtasks = draft?.subtasks ?? []

  const addSubtask = async () => {
    const parsed = parseTaskInput(newSubtaskTitle, { timeZone: profileTimeZone })
    const title = parsed.title.trim()
    if (!selectedCardId || selectedCardId < 0 || !title || subtaskBusy) return

    setSubtaskBusy(true)
    try {
      const created = await api.addSubtask(selectedCardId, {
        title,
        deadline: parsed.deadline,
        priority: draft?.priority || 2,
      })
      setDraft((prev) => (prev ? { ...prev, subtasks: [...(prev.subtasks ?? []), created] } : prev))
      setNewSubtaskTitle('')
      toast.success(`Подзадача «${created.title}» создана`)
    } catch {
      toast.error('Не удалось создать подзадачу')
    } finally {
      setSubtaskBusy(false)
    }
  }

  return {
    selectedSubtasks,
    newSubtaskTitle,
    setNewSubtaskTitle,
    subtaskBusy,
    addSubtask,
  }
}
