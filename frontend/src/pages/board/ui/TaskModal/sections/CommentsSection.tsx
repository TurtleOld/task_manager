import { Badge, Button, Card as SurfaceCard, EmptyState, Skeleton, Textarea } from '@/components/ui'
import type { CardComment } from '@/api/types'
import type { CommentsSectionProps } from '../TaskModal.types'

export function CommentsSection({
  comments,
  newComment,
  setNewComment,
  editingCommentId,
  editingCommentText,
  setEditingCommentText,
  commentsLoading,
  commentsBusy,
  commentsError,
  addComment,
  startEditComment,
  cancelEditComment,
  saveEditedComment,
  deleteComment,
}: CommentsSectionProps) {
  return (
    <SurfaceCard as="section" className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="info">Comments</Badge>
          <Badge variant="neutral">{comments.length}</Badge>
        </div>
        <h3 className="mt-3 text-h3 text-text">Комментарии</h3>
        <p className="mt-1 text-body-sm text-text-muted">Обсуждайте задачу прямо здесь. Можно упомянуть человека через @username.</p>
      </div>

      {commentsError ? <p className="text-caption text-danger" role="alert">{commentsError}</p> : null}

      <div className="space-y-2">
        <Textarea value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Написать комментарий..." className="min-h-24" />
        <div className="flex justify-end">
          <Button type="button" onClick={() => void addComment()} loading={commentsBusy} disabled={!newComment.trim()} size="sm">Отправить</Button>
        </div>
      </div>

      <div className="space-y-3">
        {commentsLoading ? <Skeleton className="h-24 w-full" /> : null}
        {!commentsLoading && comments.length === 0 ? (
          <EmptyState title="Комментариев пока нет" className="p-4">Добавьте первый комментарий, чтобы сохранить контекст задачи.</EmptyState>
        ) : null}
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            editing={editingCommentId === comment.id}
            editingText={editingCommentText}
            setEditingText={setEditingCommentText}
            busy={commentsBusy}
            startEdit={() => startEditComment(comment)}
            cancelEdit={cancelEditComment}
            saveEdit={() => void saveEditedComment(comment.id)}
            deleteItem={() => void deleteComment(comment.id)}
          />
        ))}
      </div>
    </SurfaceCard>
  )
}

function CommentItem({
  comment,
  editing,
  editingText,
  setEditingText,
  busy,
  startEdit,
  cancelEdit,
  saveEdit,
  deleteItem,
}: {
  comment: CardComment
  editing: boolean
  editingText: string
  setEditingText: (value: string) => void
  busy: boolean
  startEdit: () => void
  cancelEdit: () => void
  saveEdit: () => void
  deleteItem: () => void
}) {
  return (
    <article className="rounded-panel border border-border/70 bg-background-subtle/45 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-body-sm font-semibold text-text">{comment.author_name}</p>
          <p className="text-caption text-text-muted">{formatDateTime(comment.created_at)}{comment.edited_at ? ' · изменено' : ''}</p>
        </div>
        {comment.can_edit ? (
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button type="button" size="sm" onClick={saveEdit} loading={busy} disabled={!editingText.trim()}>Сохранить</Button>
                <Button type="button" size="sm" variant="secondary" onClick={cancelEdit} disabled={busy}>Отмена</Button>
              </>
            ) : (
              <>
                <Button type="button" size="sm" variant="secondary" onClick={startEdit} disabled={busy}>Изменить</Button>
                <Button type="button" size="sm" variant="danger" onClick={deleteItem} disabled={busy}>Удалить</Button>
              </>
            )}
          </div>
        ) : null}
      </div>
      {editing ? (
        <Textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} className="mt-3 min-h-24" />
      ) : (
        <div className="mt-3 space-y-2 text-body-sm text-text">
          {renderMarkdown(comment.text)}
        </div>
      )}
    </article>
  )
}

function renderMarkdown(text: string) {
  return text.split(/\n{2,}/).map((paragraph, index) => {
    const trimmed = paragraph.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('>')) {
      return <blockquote key={index} className="border-l-2 border-primary/40 pl-3 text-text-muted">{renderInline(trimmed.replace(/^>\s?/, ''))}</blockquote>
    }
    return <p key={index} className="whitespace-pre-wrap">{renderInline(trimmed)}</p>
  })
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|@[\w.@+-]+)/g)
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="rounded bg-background-subtle px-1 py-0.5 text-caption">{part.slice(1, -1)}</code>
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
