import { useState } from 'react'
import { Badge, Button, Card as SurfaceCard, EmptyState, Skeleton } from '@/components/ui'
import type { CardActivity } from '@/api/types'
import type { ActivitySectionProps } from '../TaskModal.types'

const FIELD_LABELS: Record<string, string> = {
  title: 'Название',
  description: 'Описание',
  deadline: 'Срок',
  priority: 'Приоритет',
  column: 'Колонка',
  assignee: 'Исполнитель',
}

export function ActivitySection({ activities, activityLoading, activityError, reloadActivity }: ActivitySectionProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <SurfaceCard as="section" className="space-y-4">
      <button type="button" className="w-full text-left" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="neutral">Activity</Badge>
              <Badge variant="neutral">{activities.length}</Badge>
            </div>
            <h3 className="mt-3 text-h3 text-text">Активность</h3>
          </div>
          <span className="text-caption text-text-muted">{expanded ? 'Свернуть' : 'Показать'}</span>
        </div>
      </button>

      {expanded ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-caption text-text-muted">Последние 30 важных изменений задачи.</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void reloadActivity()} disabled={activityLoading}>Обновить</Button>
          </div>
          {activityError ? <p className="text-caption text-danger" role="alert">{activityError}</p> : null}
          {activityLoading ? <Skeleton className="h-20 w-full" /> : null}
          {!activityLoading && activities.length === 0 ? (
            <EmptyState title="Истории пока нет" className="p-4">Здесь появятся изменения названия, срока, приоритета, колонки и исполнителя.</EmptyState>
          ) : null}
          <div className="space-y-2">
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        </div>
      ) : null}
    </SurfaceCard>
  )
}

function ActivityItem({ activity }: { activity: CardActivity }) {
  const fields = Object.keys(activity.after)
  return (
    <article className="rounded-panel border border-border/70 bg-background-subtle/45 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm font-semibold text-text">{activity.actor_name || 'Система'} изменил задачу</p>
        <p className="text-caption text-text-muted">{formatDateTime(activity.created_at)}</p>
      </div>
      <div className="mt-2 space-y-1 text-caption text-text-muted">
        {fields.map((field) => (
          <p key={field}>
            <span className="font-semibold text-text">{FIELD_LABELS[field] || field}:</span>{' '}
            <span>{formatValue(activity.before[field]) || 'пусто'}</span>
            <span> → </span>
            <span>{formatValue(activity.after[field]) || 'пусто'}</span>
          </p>
        ))}
      </div>
    </article>
  )
}

function formatValue(value: unknown) {
  if (value == null || value === '') return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value)
  return String(value)
}

function formatDateTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
