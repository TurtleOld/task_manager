export const queryKeys = {
  boards: () => ['boards'] as const,
  cards: (boardId: number) => ['cards', boardId] as const,
  calendarCards: () => ['cards', 'calendar'] as const,
  myToday: () => ['cards', 'my-today'] as const,
  agenda: (listId?: number) => ['agenda', listId ?? 'all'] as const,
  familyToday: () => ['agenda', 'family-today'] as const,
  notificationInbox: () => ['notificationInbox'] as const,
  archive: (boardId?: number) => ['archive', boardId ?? 'all'] as const,
  search: (query: string) => ['search', query] as const,
  card: (cardId: number) => ['card', cardId] as const,
  cardActivity: (cardId: number) => ['cardActivity', cardId] as const,
  cardComments: (cardId: number) => ['cardComments', cardId] as const,
  cardDeadlineReminder: (cardId: number) =>
    ['cardDeadlineReminder', cardId] as const,
  cardRecurrence: (cardId: number) => ['cardRecurrence', cardId] as const,
  users: () => ['users'] as const,
  notificationProfile: () => ['notificationProfile'] as const,
}
