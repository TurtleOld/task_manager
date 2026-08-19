import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { AdminUser, AuthUser, Card, CardComment, ChecklistItem } from '../types'
import { queryKeys } from './keys'

export function useTask(taskId: number | null) {
  return useQuery<Card>({
    queryKey: queryKeys.card(taskId ?? 0),
    queryFn: () => api.getCard(taskId as number),
    enabled: taskId != null,
  })
}

function setTaskCard(qc: ReturnType<typeof useQueryClient>, card: Card) {
  qc.setQueryData<Card>(queryKeys.card(card.id), card)
}

type TaskMutationContext = { previous: Card | undefined }

/**
 * Автосейв полей задачи (срок, исполнитель, приоритет, название, описание).
 * Оптимистично применяет изменение к кэшу задачи; при ошибке — откат.
 */
export function useTaskUpdateField(taskId: number) {
  const qc = useQueryClient()
  const key = queryKeys.card(taskId)
  return useMutation<Card, Error, Parameters<typeof api.updateCard>[1], TaskMutationContext>({
    mutationFn: (payload) => api.updateCard(taskId, payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Card>(key)
      qc.setQueryData<Card>(key, (prev) => (prev ? { ...prev, ...payload, labels: prev.labels } : prev))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSuccess: (card) => setTaskCard(qc, card),
  })
}

export function useTaskComplete(taskId: number, currentUserId?: number | null) {
  const qc = useQueryClient()
  const key = queryKeys.card(taskId)
  return useMutation<Card, Error, { complete: boolean }, TaskMutationContext>({
    mutationFn: ({ complete }) => (complete ? api.completeCard(taskId) : api.uncompleteCard(taskId)),
    onMutate: async ({ complete }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Card>(key)
      qc.setQueryData<Card>(key, (prev) => {
        if (!prev) return prev
        const now = new Date().toISOString()
        return {
          ...prev,
          completed_at: complete ? now : null,
          completed_by: complete ? currentUserId ?? null : null,
          subtasks: complete
            ? prev.subtasks.map((subtask) =>
                subtask.completed_at ? subtask : { ...subtask, completed_at: now, completed_by: currentUserId ?? null },
              )
            : prev.subtasks,
        }
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSuccess: (card) => setTaskCard(qc, card),
  })
}

/**
 * Отметка подзадачи выполненной прямо из списка подзадач на экране
 * родителя — тот же переключатель, что и в агенде и на собственном экране
 * подзадачи (issue 07: «выполненность переключается тем же чекбоксом»).
 */
export function useTaskSubtaskComplete(taskId: number, currentUserId?: number | null) {
  const qc = useQueryClient()
  const key = queryKeys.card(taskId)
  return useMutation<Card, Error, { id: number; complete: boolean }, { previous: Card | undefined }>({
    mutationFn: ({ id, complete }) => (complete ? api.completeCard(id) : api.uncompleteCard(id)),
    onMutate: async ({ id, complete }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Card>(key)
      qc.setQueryData<Card>(key, (prev) => {
        if (!prev) return prev
        const now = new Date().toISOString()
        return {
          ...prev,
          subtasks: prev.subtasks.map((subtask) =>
            subtask.id === id
              ? { ...subtask, completed_at: complete ? now : null, completed_by: complete ? currentUserId ?? null : null }
              : subtask,
          ),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
    onSuccess: (subtask) => {
      qc.setQueryData<Card>(key, (prev) => {
        if (!prev) return prev
        return { ...prev, subtasks: prev.subtasks.map((item) => (item.id === subtask.id ? subtask : item)) }
      })
    },
  })
}

export function useTaskAddSubtask(taskId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof api.addSubtask>[1]) => api.addSubtask(taskId, payload),
    onSuccess: (subtask) => {
      qc.setQueryData<Card>(queryKeys.card(taskId), (prev) => {
        if (!prev) return prev
        if (prev.subtasks.some((item) => item.id === subtask.id)) return prev
        return { ...prev, subtasks: [...prev.subtasks, subtask] }
      })
    },
  })
}

export function useTaskChecklistAdd(taskId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof api.addChecklistItem>[1]) => api.addChecklistItem(taskId, payload),
    onSuccess: (item) => {
      qc.setQueryData<Card>(queryKeys.card(taskId), (prev) => {
        if (!prev) return prev
        if (prev.checklist.some((existing) => existing.id === item.id)) return prev
        return { ...prev, checklist: [...prev.checklist, item] }
      })
    },
  })
}

export function useTaskChecklistUpdate(taskId: number) {
  const qc = useQueryClient()
  const key = queryKeys.card(taskId)
  return useMutation<
    ChecklistItem,
    Error,
    { itemId: number; payload: Parameters<typeof api.updateChecklistItem>[2] },
    { previous: Card | undefined }
  >({
    mutationFn: ({ itemId, payload }) => api.updateChecklistItem(taskId, itemId, payload),
    onMutate: async ({ itemId, payload }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Card>(key)
      qc.setQueryData<Card>(key, (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          checklist: prev.checklist.map((item) => (item.id === itemId ? { ...item, ...payload } : item)),
        }
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous)
    },
  })
}

/**
 * Ручной порядок пунктов чек-листа. Переставляет пункты в кэше сразу
 * (перетаскивание должно выглядеть мгновенным), затем сохраняет новую
 * позицию только у тех пунктов, что действительно сдвинулись.
 */
export function useTaskChecklistReorder(taskId: number) {
  const qc = useQueryClient()
  const key = queryKeys.card(taskId)
  return useMutation<void, Error, number[]>({
    mutationFn: async (orderedIds) => {
      const card = qc.getQueryData<Card>(key)
      if (!card) return
      const byId = new Map(card.checklist.map((item) => [item.id, item]))
      const changed = orderedIds
        .map((id, index) => ({ id, position: index }))
        .filter(({ id, position }) => byId.get(id)?.position !== position)
      await Promise.all(changed.map(({ id, position }) => api.updateChecklistItem(taskId, id, { position })))
    },
    onMutate: (orderedIds) => {
      qc.setQueryData<Card>(key, (prev) => {
        if (!prev) return prev
        const byId = new Map(prev.checklist.map((item) => [item.id, item]))
        const reordered = orderedIds
          .map((id, index) => {
            const item = byId.get(id)
            return item ? { ...item, position: index } : null
          })
          .filter((item): item is ChecklistItem => item != null)
        return { ...prev, checklist: reordered }
      })
    },
  })
}

export function useTaskChecklistDelete(taskId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: number) => api.deleteChecklistItem(taskId, itemId),
    onSuccess: (_result, itemId) => {
      qc.setQueryData<Card>(queryKeys.card(taskId), (prev) => {
        if (!prev) return prev
        return { ...prev, checklist: prev.checklist.filter((item) => item.id !== itemId) }
      })
    },
  })
}

export function useTaskAddAttachment(taskId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof api.addCardAttachment>[1]) => api.addCardAttachment(taskId, payload),
    onSuccess: (card) => setTaskCard(qc, card),
  })
}

export function useTaskUploadAttachments(taskId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ files, type }: { files: File[]; type?: 'file' | 'photo' }) =>
      api.uploadCardAttachments(taskId, files, type),
    onSuccess: (card) => setTaskCard(qc, card),
  })
}

export function useTaskDeleteAttachment(taskId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: string) => api.deleteCardAttachment(taskId, attachmentId),
    onSuccess: (card) => setTaskCard(qc, card),
  })
}

export function useTaskComments(taskId: number) {
  return useQuery<CardComment[]>({
    queryKey: queryKeys.cardComments(taskId),
    queryFn: () => api.listCardComments(taskId),
  })
}

export function useTaskAddComment(taskId: number) {
  const qc = useQueryClient()
  const key = queryKeys.cardComments(taskId)
  return useMutation<CardComment, Error, { text: string }>({
    mutationFn: ({ text }) => api.addCardComment(taskId, { text }),
    onSuccess: (comment) => {
      qc.setQueryData<CardComment[]>(key, (prev) =>
        prev ? (prev.some((item) => item.id === comment.id) ? prev : [...prev, comment]) : [comment],
      )
    },
  })
}

export function useTaskUpdateComment(taskId: number) {
  const qc = useQueryClient()
  const key = queryKeys.cardComments(taskId)
  return useMutation<CardComment, Error, { commentId: number; text: string }>({
    mutationFn: ({ commentId, text }) => api.updateCardComment(taskId, commentId, { text }),
    onSuccess: (comment) => {
      qc.setQueryData<CardComment[]>(key, (prev) => prev?.map((item) => (item.id === comment.id ? comment : item)))
    },
  })
}

export function useTaskDeleteComment(taskId: number) {
  const qc = useQueryClient()
  const key = queryKeys.cardComments(taskId)
  return useMutation<void, Error, number>({
    mutationFn: (commentId) => api.deleteCardComment(taskId, commentId),
    onSuccess: (_result, commentId) => {
      qc.setQueryData<CardComment[]>(key, (prev) => prev?.filter((item) => item.id !== commentId))
    },
  })
}

export function useTaskArchive(taskId: number) {
  return useMutation<void, Error, void>({
    mutationFn: () => api.deleteCard(taskId),
  })
}

export interface AssignableUser {
  id: number
  name: string
}

/**
 * Список людей, которым можно назначить задачу. Администратор видит всю
 * семью, участник — только себя (тот же принцип, что и на доске).
 */
export function useAssignableUsers(user: AuthUser | null) {
  return useQuery<AssignableUser[]>({
    queryKey: queryKeys.users(),
    queryFn: async () => {
      if (!user) return []
      if (!user.is_admin) return [{ id: user.id, name: user.full_name || user.username }]
      const users: AdminUser[] = await api.listUsers()
      return users.map((item) => ({ id: item.id, name: item.full_name || item.username }))
    },
    enabled: user != null,
  })
}
