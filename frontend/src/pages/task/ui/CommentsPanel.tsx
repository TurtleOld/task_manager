import { useState } from 'react'
import { Badge, Button, Card as SurfaceCard, EmptyState, Skeleton, Textarea } from '@/components/ui'
import type { CardComment } from '../../../api/types'

interface CommentsPanelProps {
  comments: CardComment[]
  isLoading: boolean
  busy: boolean
  onAdd: (text: string) => void
  onUpdate: (commentId: number, text: string) => void
  onDelete: (commentId: number) => void
}

export function CommentsPanel({ comments, isLoading, busy, onAdd, onUpdate, onDelete }: CommentsPanelProps) {
  const [newComment, setNewComment] = useState('')

  const submit = () => {
    const text = newComment.trim()
    if (!text) return
    onAdd(text)
    setNewComment('')
  }

  return (
    <SurfaceCard as="section" className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">Обсуждение</Badge>
        <Badge variant="neutral">{comments.length}</Badge>
      </div>

      <div className="space-y-2">
        <Textarea
          value={newComment}
          onChange={(event) => setNewComment(event.target.value)}
          placeholder="Написать комментарий..."
          className="min-h-16"
        />
        <div className="flex justify-end">
          <Button type="button" onClick={submit} loading={busy} disabled={!newComment.trim()} size="sm">
            Отправить
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {!isLoading && comments.length === 0 ? (
          <EmptyState title="Комментариев пока нет" className="p-4">
            Добавьте первый комментарий, чтобы сохранить контекст задачи.
          </EmptyState>
        ) : null}
        {comments.map((comment) => (
          <CommentItem key={comment.id} comment={comment} busy={busy} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </SurfaceCard>
  )
}

function CommentItem({
  comment,
  busy,
  onUpdate,
  onDelete,
}: {
  comment: CardComment
  busy: boolean
  onUpdate: (commentId: number, text: string) => void
  onDelete: (commentId: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editingText, setEditingText] = useState(comment.text)

  const startEdit = () => {
    setEditingText(comment.text)
    setEditing(true)
  }

  const saveEdit = () => {
    const text = editingText.trim()
    if (!text) return
    onUpdate(comment.id, text)
    setEditing(false)
  }

  return (
    <article className="rounded-panel border border-border/70 bg-background-subtle/45 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-body-sm font-semibold text-text">{comment.author_name}</p>
          <p className="text-caption text-text-muted">
            {formatDateTime(comment.created_at)}
            {comment.edited_at ? ' · изменено' : ''}
          </p>
        </div>
        {comment.can_edit ? (
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button type="button" size="sm" onClick={saveEdit} loading={busy} disabled={!editingText.trim()}>
                  Сохранить
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
                  Отмена
                </Button>
              </>
            ) : (
              <>
                <Button type="button" size="sm" variant="secondary" onClick={startEdit} disabled={busy}>
                  Изменить
                </Button>
                <Button type="button" size="sm" variant="danger" onClick={() => onDelete(comment.id)} disabled={busy}>
                  Удалить
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
      {editing ? (
        <Textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} className="mt-3 min-h-16" />
      ) : (
        <div className="mt-3 space-y-2 text-body-sm text-text">{renderMarkdown(comment.text)}</div>
      )}
    </article>
  )
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
