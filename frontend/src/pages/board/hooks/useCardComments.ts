import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import type { CardComment } from '../../../api/types'

type CommentEvent =
  | { type: 'comment.created'; card_id: number; comment: CardComment }
  | { type: 'comment.updated'; card_id: number; comment: CardComment }
  | { type: 'comment.deleted'; card_id: number; comment_id: number }

interface UseCardCommentsOptions {
  selectedCardId: number | null
  selectedCardIsPending: boolean
}

export function useCardComments({ selectedCardId, selectedCardIsPending }: UseCardCommentsOptions) {
  const [comments, setComments] = useState<CardComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsBusy, setCommentsBusy] = useState(false)
  const [commentsError, setCommentsError] = useState('')

  useEffect(() => {
    let mounted = true
    setComments([])
    setNewComment('')
    setEditingCommentId(null)
    setEditingCommentText('')
    setCommentsError('')
    if (!selectedCardId || selectedCardIsPending) return

    setCommentsLoading(true)
    api.listCardComments(selectedCardId)
      .then((items) => {
        if (mounted) setComments(items)
      })
      .catch((error: Error) => {
        if (mounted) setCommentsError(error.message)
      })
      .finally(() => {
        if (mounted) setCommentsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [selectedCardId, selectedCardIsPending])

  useEffect(() => {
    const onCommentEvent = (event: Event) => {
      const detail = (event as CustomEvent<CommentEvent>).detail
      if (!selectedCardId || detail.card_id !== selectedCardId) return
      if (detail.type === 'comment.created') {
        setComments((prev) => (prev.some((item) => item.id === detail.comment.id) ? prev : [...prev, detail.comment]))
      } else if (detail.type === 'comment.updated') {
        setComments((prev) => prev.map((item) => (item.id === detail.comment.id ? detail.comment : item)))
      } else if (detail.type === 'comment.deleted') {
        setComments((prev) => prev.filter((item) => item.id !== detail.comment_id))
      }
    }
    window.addEventListener('board-comment-event', onCommentEvent)
    return () => window.removeEventListener('board-comment-event', onCommentEvent)
  }, [selectedCardId])

  const addComment = async () => {
    const text = newComment.trim()
    if (!selectedCardId || selectedCardIsPending || !text || commentsBusy) return
    setCommentsBusy(true)
    setCommentsError('')
    try {
      const created = await api.addCardComment(selectedCardId, { text })
      setComments((prev) => (prev.some((item) => item.id === created.id) ? prev : [...prev, created]))
      setNewComment('')
    } catch (error) {
      setCommentsError((error as Error).message)
    } finally {
      setCommentsBusy(false)
    }
  }

  const startEditComment = (comment: CardComment) => {
    setEditingCommentId(comment.id)
    setEditingCommentText(comment.text)
  }

  const cancelEditComment = () => {
    setEditingCommentId(null)
    setEditingCommentText('')
  }

  const saveEditedComment = async (commentId: number) => {
    const text = editingCommentText.trim()
    if (!selectedCardId || !text || commentsBusy) return
    setCommentsBusy(true)
    setCommentsError('')
    try {
      const updated = await api.updateCardComment(selectedCardId, commentId, { text })
      setComments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      cancelEditComment()
    } catch (error) {
      setCommentsError((error as Error).message)
    } finally {
      setCommentsBusy(false)
    }
  }

  const deleteComment = async (commentId: number) => {
    if (!selectedCardId || commentsBusy) return
    setCommentsBusy(true)
    setCommentsError('')
    try {
      await api.deleteCardComment(selectedCardId, commentId)
      setComments((prev) => prev.filter((item) => item.id !== commentId))
    } catch (error) {
      setCommentsError((error as Error).message)
    } finally {
      setCommentsBusy(false)
    }
  }

  return {
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
  }
}
