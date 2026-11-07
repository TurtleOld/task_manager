// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
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

function channelSelect(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Канал доставки' }) as HTMLSelectElement
}

describe('NotificationsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listPushDevices.mockResolvedValue([])
  })

  it('shows Telegram when linked and falls back to Push after unlink, without reload', async () => {
    apiMock.getNotificationProfile.mockResolvedValue(profile('telegram'))

    const { rerender } = render(<NotificationsSection telegramStatus={status(true)} />)

    await waitFor(() => expect(channelSelect().value).toBe('telegram'))
    expect(screen.getByText(/личный чат Telegram/)).toBeTruthy()

    // The server falls back to Push on unlink and the shared status flips to
    // unlinked; the selector must follow without a page reload.
    apiMock.getNotificationProfile.mockResolvedValue(profile('push'))
    rerender(<NotificationsSection telegramStatus={status(false)} />)

    await waitFor(() => expect(channelSelect().value).toBe('push'))
    expect(screen.getByText(/доставляются на все ваши устройства/)).toBeTruthy()
    expect(screen.getByText(/Подключённых устройств нет/)).toBeTruthy()
  })
})
