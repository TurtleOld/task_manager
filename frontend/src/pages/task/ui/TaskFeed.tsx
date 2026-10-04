import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Pencil, Trash2 } from 'lucide-react'
import { Button, Skeleton, Textarea } from '@/components/ui'
import type { CardComment } from '../../../api/types'
import type { HistoryEntry } from '../lib/history'
import { russianPlural } from '../lib/taskFormat'

interface TaskFeedProps {
  comments: CardComment[]
  history: HistoryEntry[]
  loading: boolean
  busy: boolean
  timeZone: string
  onAdd: (text: string) => void
  onUpdate: (commentId: number, text: string) => void
  onDelete: (commentId: number) => void
}

type FeedItem =
  | { kind: 'comment'; at: string; comment: CardComment }
  | { kind: 'event'; at: string; entry: HistoryEntry }

/** Комментарии и история изменений одной хронологией: кто что сделал и что ответили. */
export function TaskFeed({ comments, history, loading, busy, timeZone, onAdd, onUpdate, onDelete }: TaskFeedProps) {
  const [draft, setDraft] = useState('')
  const streamRef = useRef<HTMLOListElement>(null)

  const items = useMemo<FeedItem[]>(() => {
    const merged: FeedItem[] = [
      ...comments.map((comment) => ({ kind: 'comment' as const, at: comment.created_at, comment })),
      ...history.map((entry) => ({ kind: 'event' as const, at: entry.createdAt, entry })),
    ]
    return merged.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [comments, history])

  // Свежие записи внизу, как в переписке: держим ленту прокрученной к концу.
  useLayoutEffect(() => {
    const stream = streamRef.current
    if (stream) stream.scrollTop = stream.scrollHeight
  }, [items.length])

  const submit = () => {
    const text = draft.trim()
    if (!text || busy) return
    onAdd(text)
    setDraft('')
  }

  return (
    <aside className="flex min-h-0 flex-col border-t border-border/60 bg-background-subtle/40 lg:border-l lg:border-t-0" aria-label="Лента задачи">
      <h3 className="flex items-baseline gap-2 px-5 pb-1 pt-5 text-body-sm font-semibold text-text-muted">
        Лента
        {comments.length > 0 ? (
          <span className="font-normal text-text-muted/70">
            {comments.length} {russianPlural(comments.length, 'комментарий', 'комментария', 'комментариев')}
          </span>
        ) : null}
      </h3>

      <ol ref={streamRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 pb-4 pt-2">
        {loading ? (
          <li className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-12 w-full" />
          </li>
        ) : null}
        {!loading && items.length === 0 ? (
          <li className="py-2 text-body-sm text-text-muted">Здесь появятся комментарии и изменения задачи.</li>
        ) : null}
        {items.map((item) =>
          item.kind === 'event' ? (
            <FeedEvent key={`e${item.entry.id}`} entry={item.entry} timeZone={timeZone} />
          ) : (
            <FeedComment
              key={`c${item.comment.id}`}
              comment={item.comment}
              busy={busy}
              timeZone={timeZone}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ),
        )}
      </ol>

      <form
        className="mx-4 mb-4 flex items-end gap-2 rounded-panel bg-background-subtle py-2 pl-3.5 pr-2 shadow-[inset_0_0_0_1px_rgb(var(--color-border))] transition-shadow focus-within:shadow-[inset_0_0_0_1px_rgb(var(--color-primary))]"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <AutoGrowTextarea
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          placeholder="Написать комментарий"
          ariaLabel="Новый комментарий"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          aria-label="Отправить комментарий"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary text-text-inverse transition active:scale-95 disabled:cursor-default disabled:opacity-30 disabled:active:scale-100"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </aside>
  )
}

function FeedEvent({ entry, timeZone }: { entry: HistoryEntry; timeZone: string }) {
  const rest = entry.text.startsWith(entry.actorName) ? entry.text.slice(entry.actorName.length) : null
  return (
    <li className="flex items-baseline gap-2.5 py-1 text-body-sm text-text-muted">
      <span className="mx-[11px] h-[5px] w-[5px] shrink-0 -translate-y-0.5 rounded-full bg-text-muted/50" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {rest != null ? (
          <>
            <span className="font-medium text-text">{entry.actorName}</span>
            {rest}
          </>
        ) : (
          entry.text
        )}
      </span>
      <time dateTime={entry.createdAt} className="shrink-0 tabular-nums text-text-muted/70">
        {formatWhen(entry.createdAt, timeZone, false)}
      </time>
    </li>
  )
}

function FeedComment({
  comment,
  busy,
  timeZone,
  onUpdate,
  onDelete,
}: {
  comment: CardComment
  busy: boolean
  timeZone: string
  onUpdate: (commentId: number, text: string) => void
  onDelete: (commentId: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editingText, setEditingText] = useState(comment.text)

  const saveEdit = () => {
    const text = editingText.trim()
    if (!text) return
    onUpdate(comment.id, text)
    setEditing(false)
  }

  return (
    <li className="group flex gap-2.5 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-caption font-bold text-primary" aria-hidden="true">
        {(comment.author_name || comment.author_username || '?')[0]?.toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-body-sm font-semibold text-text">{comment.author_name || comment.author_username}</span>
          <time dateTime={comment.created_at} className="shrink-0 text-caption font-normal tabular-nums text-text-muted/70">
            {formatWhen(comment.created_at, timeZone, true)}
            {comment.edited_at ? ' · изменено' : ''}
          </time>
          {comment.can_edit && !editing ? (
            <span className="ml-auto flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => {
                  setEditingText(comment.text)
                  setEditing(true)
                }}
                disabled={busy}
                aria-label="Изменить комментарий"
                className="rounded-sm p-1 text-text-muted hover:text-text"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                disabled={busy}
                aria-label="Удалить комментарий"
                className="rounded-sm p-1 text-text-muted hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-1.5 space-y-2">
            <Textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} className="min-h-16" autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Отмена
              </Button>
              <Button type="button" size="sm" onClick={saveEdit} loading={busy} disabled={!editingText.trim()}>
                Сохранить
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-0.5 space-y-2 text-body text-text [overflow-wrap:anywhere]">{renderMarkdown(comment.text)}</div>
        )}
      </div>
    </li>
  )
}

function AutoGrowTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  ariaLabel: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault()
          onSubmit()
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-body text-text outline-none placeholder:text-text-muted/70 focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  )
}

function formatWhen(value: string, timeZone: string, withTime: boolean): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const dayKey = (d: Date) => d.toLocaleDateString('ru-RU', { timeZone })
  const time = date.toLocaleTimeString('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' })
  if (dayKey(date) === dayKey(new Date())) return time
  const sameYear = date.toLocaleDateString('ru-RU', { timeZone, year: 'numeric' }) === new Date().toLocaleDateString('ru-RU', { timeZone, year: 'numeric' })
  const day = date
    .toLocaleDateString('ru-RU', { timeZone, day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
    .replace(/\s?г\.$/, '')
  return withTime ? `${day}, ${time}` : day
}

function renderMarkdown(text: string) {
  return text.split(/\n{2,}/).map((paragraph, index) => {
    const trimmed = paragraph.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('>')) {
      return (
        <blockquote key={index} className="border-l-2 border-primary/40 pl-3 text-text-muted">
          {renderInline(trimmed.replace(/^>\s?/, ''))}
        </blockquote>
      )
    }
    return (
      <p key={index} className="whitespace-pre-wrap">
        {renderInline(trimmed)}
      </p>
    )
  })
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|@[\w.@+-]+)/g)
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-background-subtle px-1 py-0.5 text-caption">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('@')) return <span key={index} className="font-semibold text-primary">{part}</span>
    return part
  })
}
