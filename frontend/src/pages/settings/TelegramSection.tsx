import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link2, RefreshCw, Send, Unlink } from 'lucide-react'
import { api } from '../../api/client'
import type { TelegramLinkResponse, TelegramStatus, TelegramTestResponse } from '../../api/types'
import { Button, Skeleton } from '@/components/ui'
import { SettingsRow, SettingsSection, StatusDot } from './ui'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ru-RU')
}

export function TelegramSection() {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [link, setLink] = useState<TelegramLinkResponse | null>(null)
  const [linking, setLinking] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TelegramTestResponse | null>(null)
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
      setStatus(await api.getTelegramStatus())
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
      const next = await api.createTelegramLink()
      setLink(next)
      // Poll until the bot confirms the Start, then stop. The link is
      // one-time and short-lived, so cap the polling instead of running forever.
      let attempts = 0
      const poll = setInterval(async () => {
        attempts += 1
        if (attempts > 300) {
          stopPolling()
          setLink(null)
          setError('Ссылка истекла. Попробуйте подключиться снова.')
          return
        }
        try {
          const current = await api.getTelegramStatus()
          setStatus(current)
          if (current.linked) {
            stopPolling()
            setLink(null)
            toast.success('Telegram подключён')
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
      setTestResult(await api.testTelegramMessage())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const onUnlink = async () => {
    setError('')
    try {
      await api.unlinkTelegram()
      stopPolling()
      setLink(null)
      setTestResult(null)
      await refresh()
      toast.success('Telegram отключён')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const linked = status?.linked ?? false

  return (
    <SettingsSection
      id="telegram"
      title="Telegram"
      description="Личный чат общего бота семьи. Ссылка одноразовая: откройте её и нажмите «Старт»."
    >
      {loading ? (
        <div className="space-y-2 px-5 py-4">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : status?.configured === false ? (
        <p className="px-5 py-4 text-body-sm text-text-muted">
          Telegram не настроен на сервере. Обратитесь к администратору.
        </p>
      ) : linked ? (
        <>
          <SettingsRow
            label="Личный чат"
            description={
              <span>
                <StatusDot tone="success">подключено</StatusDot>{' '}
                <span className="text-text-muted">
                  с {formatDate(status?.confirmed_at ?? null)}
                </span>
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
                  {testResult.delivered ? 'Отправлено. Проверьте личный чат.' : testResult.detail}
                </span>
              ) : (
                'Отправит тестовое сообщение в ваш личный чат бота.'
              )
            }
          >
            <Button type="button" variant="secondary" size="sm" onClick={() => void onTest()} loading={testing}>
              <Send className="size-4" aria-hidden />
              Отправить тест
            </Button>
          </SettingsRow>
        </>
      ) : link ? (
        <SettingsRow
          label="Подключение"
          description="Ссылка одноразовая. Нажмите «Открыть бота», затем «Старт» в Telegram — страница обновится сама."
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
              Открыть бота
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()} title="Проверить" aria-label="Проверить подключение">
              <RefreshCw className="size-4" aria-hidden />
            </Button>
          </div>
        </SettingsRow>
      ) : (
        <SettingsRow
          label="Подключение"
          description="Подключите личный чат, чтобы позже выбрать Telegram каналом доставки. Подключение само канал не меняет."
        >
          <Button type="button" size="sm" onClick={() => void onConnect()} loading={linking}>
            <Link2 className="size-4" aria-hidden />
            Подключить
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
