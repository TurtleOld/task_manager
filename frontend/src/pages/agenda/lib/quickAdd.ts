import { parseTaskInput } from '../../../shared/lib/parseTaskInput'

export interface QuickAddPerson {
  id: number
  name: string
}

export interface ParsedQuickAdd {
  title: string
  deadline: string | null
  deadlineText: string
  assigneeId: number | null
  assigneeName: string
  tag: string | null
}

interface ParseQuickAddOptions {
  now?: Date
  timeZone?: string | null
  people: QuickAddPerson[]
}

const TAG_RE = /#(\p{L}[\p{L}\p{N}_-]*)/u
const MENTION_RE = /@(\p{L}[\p{L}\p{N}_-]*)/gu

export function parseQuickAdd(input: string, options: ParseQuickAddOptions): ParsedQuickAdd {
  const raw = input.trim()
  if (!raw) {
    return { title: '', deadline: null, deadlineText: '', assigneeId: null, assigneeName: '', tag: null }
  }

  const { text: afterTag, tag } = extractTag(raw)
  const { text: afterMention, assigneeId, assigneeName } = extractMention(afterTag, options.people)
  const parsedDate = parseTaskInput(afterMention, { now: options.now, timeZone: options.timeZone })

  return {
    title: normalizeSpaces(parsedDate.title),
    deadline: parsedDate.deadline,
    deadlineText: parsedDate.deadlineText,
    assigneeId,
    assigneeName,
    tag,
  }
}

function extractTag(raw: string): { text: string; tag: string | null } {
  const match = raw.match(TAG_RE)
  if (!match || match.index == null || match[1] == null) return { text: raw, tag: null }
  const tag = match[1]
  const text = raw.slice(0, match.index) + ' ' + raw.slice(match.index + match[0].length)
  return { text, tag }
}

function extractMention(
  raw: string,
  people: QuickAddPerson[],
): { text: string; assigneeId: number | null; assigneeName: string } {
  const re = new RegExp(MENTION_RE)
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    if (match[1] == null) continue
    const token = match[1].toLowerCase()
    const person = people.find((candidate) => candidate.name.toLowerCase().startsWith(token))
    if (person) {
      const text = raw.slice(0, match.index) + ' ' + raw.slice(match.index + match[0].length)
      return { text, assigneeId: person.id, assigneeName: person.name }
    }
  }
  return { text: raw, assigneeId: null, assigneeName: '' }
}

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export interface QuickAddBoard {
  id: number
  name: string
}

/**
 * В «Мой день» (без привязки к списку) `#тег` быстрого добавления означает
 * не метку, а список назначения — задача не может остаться без списка.
 * Сопоставление по префиксу имени, без учёта регистра, как у `@исполнитель`.
 */
export function matchBoardByTag(tag: string | null, boards: QuickAddBoard[]): QuickAddBoard | null {
  if (!tag) return null
  const lower = tag.toLowerCase()
  return boards.find((board) => board.name.toLowerCase().startsWith(lower)) ?? null
}
