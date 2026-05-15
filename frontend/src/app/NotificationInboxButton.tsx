import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Bell } from 'lucide-react'
import { useMarkNotificationInboxRead, useNotificationInbox } from '../api/queries/notifications'
import { Button, EmptyState, Modal } from '@/components/ui'

export function NotificationInboxButton() {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useNotificationInbox({ limit: 20 })
  const markRead = useMarkNotificationInboxRead()
  const unreadCount = data?.unread_count ?? 0
  const items = data?.results ?? []
  const unreadIds = useMemo(() => items.filter((item) => item.unread).map((item) => item.id), [items])

  const markAllRead = () => {
    if (!unreadIds.length || markRead.isPending) return
    void markRead.mutateAsync({ mark_all: true })
  }

  const onItemOpen = (id: number) => {
    if (markRead.isPending) return
    void markRead.mutateAsync({ ids: [id] })
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-control border border-border bg-surface/90 text-text-muted shadow-surface transition hover:border-border-strong hover:bg-surface-hover hover:text-text"
        aria-label="Уведомления"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 ? <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Уведомления" className="max-w-2xl p-0">
        <div className="flex max-h-[75vh] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
            <div>
              <p className="text-body-sm font-semibold text-text">Лента событий</p>
              <p className="text-caption text-text-muted">Непрочитанных: {unreadCount}</p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={markAllRead} disabled={!unreadIds.length} loading={markRead.isPending}>Прочитать всё</Button>
          </div>

          <div className="overflow-y-auto px-3 py-3">
            {isLoading ? <p className="px-2 py-8 text-center text-body-sm text-text-muted">Загрузка уведомлений...</p> : null}
            {!isLoading && !items.length ? <EmptyState title="Пока пусто">Новые события по задачам и доскам появятся здесь.</EmptyState> : null}
            {!isLoading ? (
              <div className="space-y-2">
                {items.map((item) => (
                  <Link key={item.id} to={item.route || '/'} onClick={() => onItemOpen(item.id)} className={`block rounded-[1.1rem] border px-4 py-3 transition ${item.unread ? 'border-primary/30 bg-primary/5' : 'border-border/70 bg-surface/80 hover:bg-surface-hover'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-semibold text-text">{item.summary}</p>
                        <p className="mt-1 whitespace-pre-line text-body-sm text-text-muted">{item.message}</p>
                      </div>
                      <span className="shrink-0 text-caption text-text-muted">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ru })}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  )
}
