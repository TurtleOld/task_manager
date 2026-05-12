import { useEffect, useState } from 'react'
import { api } from '../../../api/client'
import type { CardActivity } from '../../../api/types'

interface UseCardActivityOptions {
  selectedCardId: number | null
  selectedCardIsPending: boolean
}

export function useCardActivity({ selectedCardId, selectedCardIsPending }: UseCardActivityOptions) {
  const [activities, setActivities] = useState<CardActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')

  const reloadActivity = async () => {
    if (!selectedCardId || selectedCardIsPending) return
    setActivityLoading(true)
    setActivityError('')
    try {
      setActivities(await api.listCardActivity(selectedCardId))
    } catch (error) {
      setActivityError((error as Error).message)
    } finally {
      setActivityLoading(false)
    }
  }

  useEffect(() => {
    setActivities([])
    setActivityError('')
    if (!selectedCardId || selectedCardIsPending) return
    void reloadActivity()
  }, [selectedCardId, selectedCardIsPending])

  return { activities, activityLoading, activityError, reloadActivity }
}
