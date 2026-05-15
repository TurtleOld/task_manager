export const queryKeys = {
  boards: () => ['boards'] as const,
  boardTemplates: () => ['boardTemplates'] as const,
  columns: (boardId: number) => ['columns', boardId] as const,
  cards: (boardId: number) => ['cards', boardId] as const,
  calendarCards: () => ['cards', 'calendar'] as const,
  myToday: () => ['cards', 'my-today'] as const,
  inbox: () => ['inbox'] as const,
  notificationInbox: () => ['notificationInbox'] as const,
  archive: (boardId?: number) => ['archive', boardId ?? 'all'] as const,
  search: (query: string) => ['search', query] as const,
  card: (cardId: number) => ['card', cardId] as const,
  cardDeadlineReminder: (cardId: number) =>
    ['cardDeadlineReminder', cardId] as const,
  users: () => ['users'] as const,
  notificationProfile: () => ['notificationProfile'] as const,
}
