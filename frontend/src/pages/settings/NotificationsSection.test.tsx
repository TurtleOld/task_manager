// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationsSection } from './NotificationsSection'
import type { NotificationProfile, TelegramStatus } from '../../api/types'
import { api } from '../../api/client'

vi.mock('../../api/client', () => ({
  api: {
    listPushDevices: vi.fn(),
    getNotificationProfile: vi.fn(),
    updateNotificationProfile: vi.fn(),
    testPushDevice: vi.fn(),
    deletePushDevice: vi.fn(),
  },
}))

vi.mock('../../lib/pushManager', () => ({
  disableCurrentDevice: vi.fn(),
  enableNotifications: vi.fn(),
  getNotificationPermission: () => 'default',
  getSavedDeviceId: () => null,
  hasActiveSubscription: async () => false,
  resubscribe: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const apiMock = vi.mocked(api)

function profile(channel: NotificationProfile['delivery_channel']): NotificationProfile {
  return { timezone: 'UTC', timezone_configured: true, delivery_channel: channel }
}

function status(linked: boolean): TelegramStatus {
  return { configured: true, linked, confirmed_at: null, last_error: '' }
}

describe('NotificationsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listPushDevices.mockResolvedValue([])
    apiMock.getNotificationProfile.mockResolvedValue(profile('push'))
  })

  it('re-reads the profile when the Telegram link is unlinked', async () => {
    const { rerender } = render(<NotificationsSection telegramStatus={status(true)} />)
    await waitFor(() => expect(apiMock.getNotificationProfile).toHaveBeenCalledTimes(1))

    rerender(<NotificationsSection telegramStatus={status(false)} />)
    await waitFor(() => expect(apiMock.getNotificationProfile).toHaveBeenCalledTimes(2))
  })
})
