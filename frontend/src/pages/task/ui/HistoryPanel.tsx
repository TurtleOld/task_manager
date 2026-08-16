import { Badge, Card as SurfaceCard, EmptyState, Skeleton } from '@/components/ui'
import type { HistoryEntry } from '../lib/history'

interface HistoryPanelProps {
  entries: HistoryEntry[]
  loading: boolean
  timeZone: string
}

export function HistoryPanel({ entries, loading, timeZone }: HistoryPanelProps) {
  return (
    <SurfaceCard as="section" className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="neutral">История</Badge>
        <Badge variant="neutral">{entries.length}</Badge>
      </div>

      {loading ? <Skeleton className="h-16 w-full" /> : null}

      {!loading && entries.length === 0 ? (
        <EmptyState title="Истории пока нет" className="p-4">
          Здесь появятся изменения срока, приоритета, исполнителя и отметка о выполнении.
        </EmptyState>
      ) : null}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-panel border border-border/70 bg-background-subtle/45 px-3 py-2.5 text-body-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-text">{entry.text}</p>
              <p className="shrink-0 text-caption text-text-muted">{formatDateTime(entry.createdAt, timeZone)}</p>
            </div>
          </li>
        ))}
      </ul>
    </SurfaceCard>
  )
}

function formatDateTime(value: string, timeZone: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
