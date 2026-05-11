import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Moon, Plus, Search, Settings, SunMedium } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import type { Board } from '../api/types'
import { api } from '../api/client'
import { queryKeys } from '../api/queries/keys'
import { useCreateInboxCard } from '../api/queries/cards'
import { toggleTheme } from './theme'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

interface CommandPaletteProps {
  boards: Board[]
  onLogout: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function CommandPalette({ boards, onLogout, onOpenChange, open }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query.trim(), 200)
  const createInboxCard = useCreateInboxCard()
  const shouldSearch = debouncedQuery.length >= 2
  const { data: searchResults, isFetching } = useQuery({
    queryKey: queryKeys.search(debouncedQuery),
    queryFn: () => api.search(debouncedQuery),
    enabled: open && shouldSearch,
    staleTime: 15_000,
  })

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const matchingBoards = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return boards.slice(0, 8)
    return boards.filter((board) => board.name.toLowerCase().includes(normalized)).slice(0, 8)
  }, [boards, query])

  const close = () => onOpenChange(false)

  const runCommand = (action: () => void) => {
    action()
    close()
  }

  const createTask = async () => {
    const title = query.trim()
    if (!title || createInboxCard.isPending) return

    try {
      await createInboxCard.mutateAsync({ title })
      toast.success('Задача добавлена в Inbox')
      close()
    } catch {
      toast.error('Не удалось создать задачу')
    }
  }

  const cards = searchResults?.cards ?? []
  const serverBoards = searchResults?.boards ?? []
  const hasQuery = query.trim().length > 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Командная палитра"
      description="Создавайте задачи, переходите к доскам и ищите карточки"
      className="max-w-2xl border-border bg-[image:var(--gradient-surface)] text-text shadow-overlay"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Введите команду, название доски или задачу..."
      />
      <CommandList className="max-h-[32rem]">
        <CommandEmpty>{isFetching ? 'Идёт поиск...' : 'Ничего не найдено'}</CommandEmpty>

        <CommandGroup heading="Создать задачу">
          <CommandItem
            value={`create-task-${query}`}
            disabled={!query.trim() || createInboxCard.isPending}
            onSelect={() => void createTask()}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">
              {hasQuery ? `Создать в Inbox: ${query.trim()}` : 'Введите название задачи'}
            </span>
            <CommandShortcut>Enter</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Перейти к доске">
          {matchingBoards.map((board) => (
            <CommandItem
              key={board.id}
              value={`board-${board.name}`}
              onSelect={() => runCommand(() => navigate(`/boards/${board.id}`))}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
              <span className="truncate">{board.name}</span>
              <CommandShortcut>Board</CommandShortcut>
            </CommandItem>
          ))}
          {serverBoards
            .filter((board) => !matchingBoards.some((item) => item.id === board.id))
            .map((board) => (
              <CommandItem
                key={board.id}
                value={`server-board-${board.name}`}
                onSelect={() => runCommand(() => navigate(`/boards/${board.id}`))}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                <span className="truncate">{board.name}</span>
                <CommandShortcut>Board</CommandShortcut>
              </CommandItem>
            ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Найти задачу">
          {!shouldSearch ? (
            <CommandItem value="search-hint" disabled>
              <Search className="h-4 w-4" aria-hidden="true" />
              <span>Введите минимум 2 символа для поиска задач</span>
            </CommandItem>
          ) : null}
          {cards.map((card) => (
            <CommandItem
              key={card.id}
              value={`card-${card.title}-${card.board_name}-${card.column_name}`}
              onSelect={() => runCommand(() => navigate(`/boards/${card.board}/cards/${card.id}`))}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{card.title}</span>
                <span className="block truncate text-caption text-text-muted">
                  {card.board_name} / {card.column_name}
                </span>
              </span>
              <CommandShortcut>Card</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Действия">
          <CommandItem value="open-today" onSelect={() => runCommand(() => navigate('/today'))}>
            <SunMedium className="h-4 w-4" aria-hidden="true" />
            <span>Открыть Мой день</span>
          </CommandItem>
          <CommandItem value="toggle-theme" onSelect={() => runCommand(toggleTheme)}>
            <Moon className="h-4 w-4" aria-hidden="true" />
            <span>Переключить тему</span>
          </CommandItem>
          <CommandItem value="settings" onSelect={() => runCommand(() => navigate('/settings'))}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>Открыть настройки</span>
          </CommandItem>
          <CommandItem value="logout" onSelect={() => runCommand(onLogout)}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Выйти</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [delayMs, value])

  return debounced
}
