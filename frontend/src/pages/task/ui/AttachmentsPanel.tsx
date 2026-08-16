import { useRef, useState } from 'react'
import { Badge, Button, Card as SurfaceCard, EmptyState, Select, TextInput } from '@/components/ui'
import type { Card } from '../../../api/types'

type Attachment = Card['attachments'][number]

interface AttachmentsPanelProps {
  attachments: Attachment[]
  busy: boolean
  onAddLink: (payload: { name: string; type: 'link' | 'photo'; url: string }) => void
  onUpload: (files: File[], type: 'file' | 'photo') => void
  onDelete: (attachmentId: string) => void
}

export function AttachmentsPanel({ attachments, busy, onAddLink, onUpload, onDelete }: AttachmentsPanelProps) {
  const [type, setType] = useState<'file' | 'link' | 'photo'>('link')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const submit = () => {
    if (type === 'link') {
      const trimmedUrl = url.trim()
      if (!trimmedUrl) return
      onAddLink({ name: name.trim() || trimmedUrl, type: 'link', url: trimmedUrl })
      setName('')
      setUrl('')
      return
    }
    const files = fileInputRef.current?.files
    if (files && files.length > 0) {
      onUpload(Array.from(files), type === 'photo' ? 'photo' : 'file')
      setFileInputKey((key) => key + 1)
    }
  }

  return (
    <SurfaceCard as="section" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="info">Вложения</Badge>
          <Badge variant="neutral">{attachments.length}</Badge>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Select value={type} onChange={(event) => setType(event.target.value as 'file' | 'link' | 'photo')} className="sm:w-28">
            <option value="link">Ссылка</option>
            <option value="file">Файл</option>
            <option value="photo">Фото</option>
          </Select>
          {type === 'link' ? (
            <>
              <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Название" className="sm:w-40" />
              <TextInput value={url} onChange={(event) => setUrl(event.target.value)} placeholder="URL" className="sm:w-48" />
            </>
          ) : (
            <input
              key={fileInputKey}
              ref={fileInputRef}
              type="file"
              accept={type === 'photo' ? 'image/*' : undefined}
              multiple
              className="text-caption text-text-muted file:mr-2 file:rounded-control file:border-0 file:bg-background-subtle file:px-3 file:py-2 file:text-caption"
            />
          )}
          <Button type="button" onClick={submit} loading={busy} size="sm">Добавить</Button>
        </div>
      </div>

      {attachments.length === 0 ? (
        <EmptyState title="Вложения отсутствуют" className="p-4">
          Прикрепите фото чека, документ или ссылку к задаче.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {attachments.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-panel border border-border/70 bg-background-subtle/45 px-3 py-2.5 text-body-sm">
              <span className="inline-flex min-w-0 items-center gap-2 truncate">
                {item.type === 'file' ? '📎' : item.type === 'photo' ? '🖼️' : '🔗'} {item.name}
              </span>
              <div className="flex shrink-0 items-center gap-2 text-caption">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:text-primary-hover">
                    Открыть
                  </a>
                ) : null}
                <button type="button" onClick={() => onDelete(item.id)} className="text-text-muted hover:text-danger">
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  )
}
