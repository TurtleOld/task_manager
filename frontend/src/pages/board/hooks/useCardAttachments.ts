import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { BoardCardDraft } from '../types'

export interface PendingAttachmentCreate {
  id: string
  name: string
  type: 'link' | 'photo'
  url: string
}

interface UseCardAttachmentsOptions {
  selectedCardId: number | null
  draft: BoardCardDraft | null
  setDraft: Dispatch<SetStateAction<BoardCardDraft | null>>
}

export function useCardAttachments({ selectedCardId, draft, setDraft }: UseCardAttachmentsOptions) {
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([])
  const [pendingUploadType, setPendingUploadType] = useState<'file' | 'photo'>('file')
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
    setPendingUploadType('file')
    setPendingCreateAttachments([])
    setPendingDeleteAttachmentIds([])
  }, [selectedCardId])

  const addAttachment = async () => {
    if (!selectedCardId || !draft) return

    if (newAttachmentType === 'file' || newAttachmentType === 'photo') {
      if (newAttachmentFiles.length === 0) return
      setPendingUploadFiles((prev) => [...prev, ...newAttachmentFiles])
      setPendingUploadType(newAttachmentType)
      setNewAttachmentFiles([])
      setAttachmentFileInputKey((key) => key + 1)
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
  }

  const removeAttachment = async (item: { id: string; type: 'file' | 'link' | 'photo' }) => {
    if (!selectedCardId || !draft) return

    setPendingCreateAttachments((prev) => prev.filter((attachment) => attachment.id !== item.id))
    if (!item.id.startsWith('pending-')) {
      setPendingDeleteAttachmentIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
    }
    setDraft((prev) => (prev ? { ...prev, attachments: (prev.attachments ?? []).filter((attachment) => attachment.id !== item.id) } : prev))
  }

  return {
    pendingUploadFiles,
    setPendingUploadFiles,
    pendingUploadType,
    setPendingUploadType,
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
