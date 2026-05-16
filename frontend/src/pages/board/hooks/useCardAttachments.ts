import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { BoardCardDraft } from '../types'

export interface PendingAttachmentCreate {
  id: string
  name: string
  type: 'link' | 'photo'
  url: string
}

export interface PendingAttachmentUpload {
  id: string
  file: File
  type: 'file' | 'photo'
}

interface UseCardAttachmentsOptions {
  selectedCardId: number | null
  draft: BoardCardDraft | null
  setDraft: Dispatch<SetStateAction<BoardCardDraft | null>>
}

export function useCardAttachments({ selectedCardId, draft, setDraft }: UseCardAttachmentsOptions) {
  const [pendingUploadFiles, setPendingUploadFiles] = useState<PendingAttachmentUpload[]>([])
  const [pendingCreateAttachments, setPendingCreateAttachments] = useState<PendingAttachmentCreate[]>([])
  const [pendingDeleteAttachmentIds, setPendingDeleteAttachmentIds] = useState<string[]>([])
  const [newAttachmentName, setNewAttachmentName] = useState('')
  const [newAttachmentType, setNewAttachmentType] = useState<'file' | 'link' | 'photo'>('file')
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('')
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([])
  const [attachmentFileInputKey, setAttachmentFileInputKey] = useState(0)
  const attachmentFileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setNewAttachmentName('')
    setNewAttachmentUrl('')
    setNewAttachmentType('file')
    setNewAttachmentFiles([])
    setAttachmentFileInputKey((key) => key + 1)
    setPendingUploadFiles([])
    setPendingCreateAttachments([])
    setPendingDeleteAttachmentIds([])
  }, [selectedCardId])

  const addAttachment = async () => {
    if (!selectedCardId || !draft) return

    if (newAttachmentType === 'file' || newAttachmentType === 'photo') {
      if (newAttachmentFiles.length === 0) return
      const pending = newAttachmentFiles.map((file) => {
        const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
        return {
          upload: { id, file, type: newAttachmentType },
          attachment: {
            id,
            name: file.name,
            type: newAttachmentType,
            url: '',
            mime: file.type,
            mimeType: file.type,
            size: file.size,
          },
        }
      })
      setPendingUploadFiles((prev) => [...prev, ...pending.map((item) => item.upload)])
      setDraft((prev) => (prev ? { ...prev, attachments: [...(prev.attachments ?? []), ...pending.map((item) => item.attachment)] } : prev))
      setNewAttachmentFiles([])
      setAttachmentFileInputKey((key) => key + 1)
      toast.success(newAttachmentFiles.length === 1 ? 'Файл добавлен в очередь загрузки' : `Файлы добавлены в очередь: ${newAttachmentFiles.length}`)
      return
    }

    const name = newAttachmentName.trim()
    if (!name) return
    const attachment = {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      type: newAttachmentType,
      url: newAttachmentUrl.trim(),
    }
    if (!attachment.url) return
    setPendingCreateAttachments((prev) => [...prev, attachment])
    setDraft((prev) => (prev ? { ...prev, attachments: [...(prev.attachments ?? []), attachment] } : prev))
    setNewAttachmentName('')
    setNewAttachmentUrl('')
    toast.success('Ссылка добавлена к вложениям')
  }

  const removeAttachment = async (item: { id: string; type: 'file' | 'link' | 'photo' }) => {
    if (!selectedCardId || !draft) return

    setPendingCreateAttachments((prev) => prev.filter((attachment) => attachment.id !== item.id))
    setPendingUploadFiles((prev) => prev.filter((attachment) => attachment.id !== item.id))
    if (!item.id.startsWith('pending-')) {
      setPendingDeleteAttachmentIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
    }
    setDraft((prev) => (prev ? { ...prev, attachments: (prev.attachments ?? []).filter((attachment) => attachment.id !== item.id) } : prev))
    toast.success(item.id.startsWith('pending-') ? 'Вложение убрано' : 'Вложение будет удалено после сохранения')
  }

  return {
    pendingUploadFiles,
    setPendingUploadFiles,
    pendingCreateAttachments,
    setPendingCreateAttachments,
    pendingDeleteAttachmentIds,
    setPendingDeleteAttachmentIds,
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
  }
}
