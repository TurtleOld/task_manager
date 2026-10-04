import { useEffect, useRef, useState } from 'react'
import { FileText, Image, Link2, Paperclip, X } from 'lucide-react'
import { Button, TextInput } from '@/components/ui'
import type { UploadKind } from '../../../api/client'
import type { Card } from '../../../api/types'
import { ATTACHMENT_MAX_MB, type UploadProgress } from '../../../lib/attachmentUpload'
import { SectionHeading } from './section'

type Attachment = Card['attachments'][number]

interface AttachmentsPanelProps {
  attachments: Attachment[]
  busy: boolean
  uploadProgress: UploadProgress | null
  /** Открыть сразу выбор файла — раздел появился по кнопке «Вложение». */
  autoPick?: boolean
  onAddLink: (payload: { name: string; type: 'link' | 'photo'; url: string }) => void
  onUpload: (files: File[], type: UploadKind) => void
  onDelete: (attachmentId: string) => void
}

const ATTACHMENT_ICON = { file: FileText, photo: Image, link: Link2 } as const

export function AttachmentsPanel({ attachments, busy, uploadProgress, autoPick = false, onAddLink, onUpload, onDelete }: AttachmentsPanelProps) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (autoPick) fileInputRef.current?.click()
  }, [autoPick])

  const submitLink = () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return
    onAddLink({ name: name.trim() || trimmedUrl, type: 'link', url: trimmedUrl })
    setName('')
    setUrl('')
    setLinkOpen(false)
  }

  const pickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    // Фото сжимается при загрузке, поэтому снимки идут отдельным типом.
    const allImages = list.every((file) => file.type.startsWith('image/'))
    onUpload(list, allImages ? 'photo' : 'file')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const tileClass =
    'flex min-w-0 items-center gap-3 rounded-panel bg-surface-elevated py-2 pl-2 pr-3 text-left shadow-surface transition'

  return (
    <section aria-label="Вложения">
      <SectionHeading count={attachments.length > 0 ? attachments.length : null}>Вложения</SectionHeading>
      <ul className="flex flex-wrap gap-2">
        {attachments.map((item) => {
          const Icon = ATTACHMENT_ICON[item.type] ?? Paperclip
          const meta = item.type === 'link' ? 'Ссылка' : item.size ? formatSize(item.size) : item.type === 'photo' ? 'Фото' : 'Файл'
          return (
            <li key={item.id} className={`group relative ${tileClass} max-w-full`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-background-subtle text-text-muted">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block max-w-[14rem] truncate text-body-sm font-medium text-text hover:text-primary"
                    title={item.name}
                  >
                    {item.name}
                  </a>
                ) : (
                  <span className="block max-w-[14rem] truncate text-body-sm font-medium text-text" title={item.name}>
                    {item.name}
                  </span>
                )}
                <span className="block text-caption font-normal text-text-muted">{meta}</span>
              </span>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                aria-label={`Удалить вложение «${item.name}»`}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-elevated text-text-muted opacity-0 shadow-surface transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className={`${tileClass} text-text-muted hover:text-text disabled:cursor-wait disabled:opacity-70`}
            title={`До ${ATTACHMENT_MAX_MB} МБ на файл, фото сжимается`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-background-subtle">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-body-sm">
              {uploadProgress ? `Загрузка ${uploadProgress.current} из ${uploadProgress.total}…` : 'Файл или фото'}
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setLinkOpen((open) => !open)}
            aria-expanded={linkOpen}
            className={`${tileClass} text-text-muted hover:text-text`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-background-subtle">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-body-sm">Ссылка</span>
          </button>
        </li>
      </ul>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Выбрать файлы для вложения"
        onChange={(event) => pickFiles(event.target.files)}
      />
      {linkOpen ? (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submitLink()
          }}
        >
          <TextInput value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" aria-label="Адрес ссылки" className="min-w-0 flex-[2_1_14rem]" autoFocus />
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Название, если нужно" aria-label="Название ссылки" className="min-w-0 flex-[1_1_10rem]" />
          <Button type="submit" size="sm" disabled={!url.trim() || busy}>
            Прикрепить
          </Button>
        </form>
      ) : null}
    </section>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`
}
