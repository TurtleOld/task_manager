import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link2, RefreshCw, Send, Users, Unlink } from 'lucide-react'
import { api } from '../../api/client'
import type { FamilyChatStatus, FamilyChatTestResponse, TelegramLinkResponse } from '../../api/types'
import { Button, Skeleton } from '@/components/ui'
import { SettingsRow, SettingsSection, StatusDot } from './ui'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ru-RU')
}

export function FamilyChatSection() {
  const [status, setStatus] = useState<FamilyChatStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [link, setLink] = useState<TelegramLinkResponse | null>(null)
  const [linking, setLinking] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<FamilyChatTestResponse | null>(null)
  const [error, setError] = useState('')
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const refresh = useCallback(async () => {
    setError('')
    try {
      setStatus(await api.getFamilyChatStatus())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onConnect = async () => {
    setLinking(true)
    setError('')
    setTestResult(null)
    try {
      const next = await api.createFamilyChatLink()
      setLink(next)
      // Poll until the bot confirms the group, then stop. The link is
      // one-time and short-lived, so cap the polling instead of running forever.
      let attempts = 0
      const poll = setInterval(async () => {
        attempts += 1
        if (attempts > 300) {
          stopPolling()
          setLink(null)
          setError('Ссылка истекла. Попробуйте подключить чат снова.')
          return
        }
        try {
          const current = await api.getFamilyChatStatus()
          setStatus(current)
          if (current.linked) {
            stopPolling()
            setLink(null)
            toast.success('Семейный чат подключён')
          }
        } catch {
          // Keep polling; the next refresh surfaces the error if it persists.
        }
      }, 3000)
      pollingRef.current = poll
    } catch (e) {
      setError((e as Error).message)
      toast.error('Не удалось создать ссылку')
    } finally {
      setLinking(false)
    }
  }

  const onTest = async () => {
    setTesting(true)
    setTestResult(null)
    setError('')
    try {
      setTestResult(await api.testFamilyChatMessage())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const onUnlink = async () => {
    setError('')
    try {
      await api.unlinkFamilyChat()
      stopPolling()
      setLink(null)
      setTestResult(null)
      await refresh()
      toast.success('Семейный чат отключён')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const linked = status?.linked ?? false

  return (
    <SettingsSection
      id="family-chat"
      title="Семейный чат"
      description="Общая группа Telegram для событий семьи. Подключает и отключает только администратор."
    >
      {loading ? (
        <div className="space-y-2 px-5 py-4">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : status?.configured === false ? (
        <p className="px-5 py-4 text-body-sm text-text-muted">
          Telegram не настроен на сервере.
        </p>
      ) : linked ? (
        <>
          <SettingsRow
            label={status?.title || 'Группа'}
            description={
              <span>
                <StatusDot tone="success">подключено</StatusDot>{' '}
                <span className="text-text-muted">с {formatDate(status?.confirmed_at ?? null)}</span>
              </span>
            }
          >
            <Button type="button" variant="ghost" size="sm" onClick={() => void onUnlink()} className="hover:text-danger">
              <Unlink className="size-4" aria-hidden />
              Отключить
            </Button>
          </SettingsRow>
          <SettingsRow
            label="Проверка доставки"
            description={
              testResult ? (
                <span className={testResult.delivered ? 'text-success' : 'text-danger'}>
                  {testResult.delivered ? 'Отправлено. Проверьте семейный чат.' : testResult.detail}
                </span>
              ) : (
                'Отправит тестовое сообщение в семейный чат.'
              )
            }
          >
            <Button type="button" variant="secondary" size="sm" onClick={() => void onTest()} loading={testing}>
              <Send className="size-4" aria-hidden />
              Отправить тест
            </Button>
          </SettingsRow>
          <p className="px-5 py-3 text-caption text-text-muted">
            Подключение чата не включает рассылку: каждый участник сам выбирает его своим каналом доставки.
          </p>
        </>
      ) : link ? (
        <SettingsRow
          label="Подключение"
          description="Ссылка одноразовая. Нажмите «Добавить бота в группу», выберите семейную группу — страница обновится сама."
          stacked
        >
          <div className="flex gap-2">
            <a
              href={link.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primary px-3.5 py-2 text-caption font-semibold text-text-inverse shadow-surface transition hover:bg-primary-hover"
            >
              <Link2 className="size-4" aria-hidden />
              Добавить бота в группу
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()} title="Проверить" aria-label="Проверить подключение чата">
              <RefreshCw className="size-4" aria-hidden />
            </Button>
          </div>
        </SettingsRow>
      ) : (
        <SettingsRow
          label="Подключение"
          description="Подключите общую группу Telegram. Участники смогут выбрать её для уведомлений о семейных событиях."
        >
          <Button type="button" size="sm" onClick={() => void onConnect()} loading={linking}>
            <Users className="size-4" aria-hidden />
            Подключить чат
          </Button>
        </SettingsRow>
      )}

      {error ? (
        <p className="px-5 py-3 text-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  )
}
