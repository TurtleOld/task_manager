import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Chip, TextInput } from '@/components/ui'
import { cn } from '@/lib/utils'
import { matchBoardByTag, parseQuickAdd } from '../lib/quickAdd'
import type { QuickAddBoard, QuickAddPerson } from '../lib/quickAdd'

export interface QuickAddResult {
  title: string
  deadline: string | null
  assigneeId: number | null
  assigneeName: string
  tag: string | null
  listId: number | null
}

interface QuickAddDismissed {
  deadline: boolean
  assignee: boolean
  tag: boolean
}

const NOTHING_DISMISSED: QuickAddDismissed = { deadline: false, assignee: false, tag: false }
const OPEN_TAG_RE = /#([\p{L}\p{N}_-]*)$/u

interface QuickAddBarProps {
  /** Список, в который упадёт новая задача, уже выбран — обычная страница списка. */
  busy?: boolean
  onSubmit: (result: QuickAddResult) => void
  people: QuickAddPerson[]
  timeZone?: string | null
  /**
   * Передаётся только в «Мой день», где список не выбран заранее: `#тег`
   * перестаёт быть меткой и обязан указывать на реальный список — иначе
   * задаче некуда падать.
   */
  boards?: QuickAddBoard[]
}

export function QuickAddBar({ busy = false, onSubmit, people, timeZone, boards }: QuickAddBarProps) {
  const [value, setValue] = useState('')
  const [dismissed, setDismissed] = useState<QuickAddDismissed>(NOTHING_DISMISSED)
  const [showError, setShowError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const boardMode = boards != null
  const parsed = value.trim() ? parseQuickAdd(value, { people, timeZone }) : null
  const matchedBoard = boardMode ? matchBoardByTag(parsed?.tag ?? null, boards) : null

  const openTagMatch = boardMode ? value.match(OPEN_TAG_RE) : null
  const openTagQuery = openTagMatch?.[1]
  const suggestions =
    boardMode && openTagQuery != null
      ? boards.filter((board) => board.name.toLowerCase().startsWith(openTagQuery.toLowerCase())).slice(0, 5)
      : []

  const handleChange = (next: string) => {
    setValue(next)
    setDismissed(NOTHING_DISMISSED)
    setShowError(false)
  }

  const applySuggestion = (board: QuickAddBoard) => {
    if (!openTagMatch) return
    const start = value.length - openTagMatch[0].length
    handleChange(`${value.slice(0, start)}#${board.name} `)
    inputRef.current?.focus()
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!parsed || !parsed.title || busy) return
    if (boardMode && !matchedBoard) {
      setShowError(true)
      inputRef.current?.focus()
      return
    }
    onSubmit({
      title: parsed.title,
      deadline: dismissed.deadline ? null : parsed.deadline,
      assigneeId: dismissed.assignee ? null : parsed.assigneeId,
      assigneeName: dismissed.assignee ? '' : parsed.assigneeName,
      tag: boardMode ? null : dismissed.tag ? null : parsed.tag,
      listId: matchedBoard?.id ?? null,
    })
    setValue('')
    setDismissed(NOTHING_DISMISSED)
    setShowError(false)
  }

  return (
    <div className="relative min-w-0 flex-1">
      <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-1.5">
        <TextInput
          ref={inputRef}
          aria-label="Быстрое добавление задачи"
          aria-invalid={showError || undefined}
          className="h-9 min-w-[7rem] flex-1"
          disabled={busy}
          fullWidth={false}
          invalid={showError}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={
            boardMode
              ? 'Добавить задачу: «полить цветы завтра в 8 @лиза #мурчляндия»'
              : 'Добавить задачу: «полить цветы завтра в 8 @лиза #дом»'
          }
          role={suggestions.length > 0 ? 'combobox' : undefined}
          aria-expanded={suggestions.length > 0 || undefined}
          aria-controls={suggestions.length > 0 ? listboxId : undefined}
          value={value}
        />
        {parsed?.deadlineText && !dismissed.deadline ? (
          <RemovableChip
            label={parsed.deadlineText}
            onRemove={() => setDismissed((state) => ({ ...state, deadline: true }))}
          />
        ) : null}
        {parsed?.assigneeName && !dismissed.assignee ? (
          <RemovableChip
            label={`@${parsed.assigneeName}`}
            onRemove={() => setDismissed((state) => ({ ...state, assignee: true }))}
          />
        ) : null}
        {boardMode ? (
          parsed?.tag ? (
            <Chip className="shrink-0" active tone={matchedBoard ? 'primary' : 'danger'}>
              <span className="max-w-[8rem] truncate">#{matchedBoard ? matchedBoard.name : parsed.tag}</span>
            </Chip>
          ) : null
        ) : parsed?.tag && !dismissed.tag ? (
          <RemovableChip label={`#${parsed.tag}`} onRemove={() => setDismissed((state) => ({ ...state, tag: true }))} />
        ) : null}
      </form>

      {suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Списки, начинающиеся на введённый текст"
          className="absolute left-0 top-full z-dropdown mt-1 w-64 max-w-full overflow-hidden rounded-control border border-border/80 bg-surface shadow-elevated"
        >
          {suggestions.map((board) => (
            <li key={board.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applySuggestion(board)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-body-sm text-text transition hover:bg-surface-hover"
              >
                <span className="truncate">{board.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {boardMode && showError ? (
        <p className="absolute left-0 top-full mt-1 text-caption text-danger">
          Укажите список через #название, например «#мурчляндия»
        </p>
      ) : null}
    </div>
  )
}

function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Chip className={cn('shrink-0')} tone="primary">
      <span className="max-w-[8rem] truncate">{label}</span>
      <button
        aria-label={`Убрать «${label}»`}
        className="text-primary/70 hover:text-primary"
        onClick={onRemove}
        type="button"
      >
        ×
      </button>
    </Chip>
  )
}
