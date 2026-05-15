import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { NotificationInboxResponse } from '../types'
import { queryKeys } from './keys'

export function useNotificationInbox(options?: { enabled?: boolean; limit?: number; unreadOnly?: boolean }) {
  return useQuery<NotificationInboxResponse>({
    queryKey: queryKeys.notificationInbox(),
    queryFn: () => api.getNotificationInbox({ limit: options?.limit, unreadOnly: options?.unreadOnly }),
    enabled: options?.enabled ?? true,
    refetchInterval: 15000,
  })
}

export function useMarkNotificationInboxRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { ids?: number[]; mark_all?: boolean }) => api.markNotificationInboxRead(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.notificationInbox() })
    },
  })
}
