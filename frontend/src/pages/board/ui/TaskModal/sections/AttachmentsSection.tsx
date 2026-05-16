import { Badge, Button, Card as SurfaceCard, EmptyState, Select, TextInput } from '@/components/ui'
import type { AttachmentsSectionProps } from '../TaskModal.types'

export function AttachmentsSection({
  selectedAttachments,
  newAttachmentType,
  setNewAttachmentType,
  attachmentFileInputKey,
  attachmentFileInputRef,
  setNewAttachmentFiles,
  newAttachmentFiles,
  newAttachmentName,
  setNewAttachmentName,
  newAttachmentUrl,
  setNewAttachmentUrl,
  addAttachment,
  removeAttachment,
}: AttachmentsSectionProps) {
  return (
    <SurfaceCard as="section" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="info">Attachments</Badge>
            <Badge variant="neutral">{selectedAttachments.length}</Badge>
          </div>
          <h3 className="mt-3 text-h3 text-text">Вложения, ссылки и фото</h3>
          <p className="mt-1 text-body-sm text-text-muted">Добавляйте файлы, фотографии чеков или ссылки на семейные документы.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Select value={newAttachmentType} onChange={(event) => setNewAttachmentType(event.target.value as 'file' | 'link' | 'photo')} className="sm:w-28">
            <option value="file">Файл</option>
            <option value="link">Ссылка</option>
            <option value="photo">Фото</option>
          </Select>

          {newAttachmentType === 'file' || newAttachmentType === 'photo' ? (
            <>
              <input
                key={attachmentFileInputKey}
                ref={attachmentFileInputRef}
                type="file"
                accept={newAttachmentType === 'photo' ? 'image/*' : undefined}
                multiple
                onChange={(event) => setNewAttachmentFiles(event.target.files ? Array.from(event.target.files) : [])}
                className="hidden"
              />
              <Button type="button" onClick={() => attachmentFileInputRef.current?.click()} variant="secondary" size="sm" className="justify-start sm:w-56">
                {newAttachmentFiles.length === 0 ? (newAttachmentType === 'photo' ? 'Фото не выбрано' : 'Файл не выбран') : newAttachmentFiles.length === 1 ? newAttachmentFiles[0]?.name : `Выбрано: ${newAttachmentFiles.length}`}
              </Button>
            </>
          ) : (
            <>
              <TextInput value={newAttachmentName} onChange={(event) => setNewAttachmentName(event.target.value)} placeholder="Название" className="sm:w-44" />
              <TextInput value={newAttachmentUrl} onChange={(event) => setNewAttachmentUrl(event.target.value)} placeholder="URL" className="sm:w-52" />
            </>
          )}
          <Button type="button" onClick={addAttachment} size="sm">Добавить</Button>
        </div>
      </div>
      <div className="grid gap-2 text-body-sm text-text-muted">
        {selectedAttachments.length === 0 ? (
          <EmptyState title="Вложения отсутствуют" className="p-4">Прикрепите файл или добавьте ссылку к задаче.</EmptyState>
        ) : (
          selectedAttachments.map((item) => {
            const isPending = item.id.startsWith('pending-')
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-panel border border-border/70 bg-background-subtle/45 px-3 py-3">
                <span className="inline-flex min-w-0 flex-col gap-1">
                  <span className="inline-flex items-center gap-2 break-all">{item.type === 'file' ? '📎' : item.type === 'photo' ? '🖼️' : '🔗'} {item.name}</span>
                  <span className="text-caption text-text-muted">
                    {item.type === 'link' ? 'Ссылка' : item.type === 'photo' ? 'Фото' : 'Файл'}{item.size ? ` · ${formatFileSize(item.size)}` : ''}{isPending ? ' · будет загружено после сохранения' : ''}
                  </span>
                </span>
                <div className="flex items-center gap-2 text-caption">
                  {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:text-primary-hover">Открыть</a> : null}
                  <Button type="button" variant="danger" size="sm" onClick={() => void removeAttachment(item)}>Удалить</Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </SurfaceCard>
  )
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} Б`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} КБ`
  return `${(size / 1024 / 1024).toFixed(1)} МБ`
}
