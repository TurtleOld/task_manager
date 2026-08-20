const BOARD_ROUTE = /^\/boards\/(\d+)$/
const BOARD_CARD_ROUTE = /^\/boards\/(\d+)\/cards\/(\d+)$/
const AGENDA_LIST_ROUTE = /^\/agenda\/(\d+)$/
const CARD_FRAGMENT_ROUTE = /^#card-(\d+)$/

export function resolveLegacyRedirect(pathname: string, hash = ''): string | null {
  const boardMatch = BOARD_ROUTE.exec(pathname)
  if (boardMatch) {
    const cardFragment = CARD_FRAGMENT_ROUTE.exec(hash)
    if (cardFragment) return `/lists/${boardMatch[1]}/tasks/${cardFragment[1]}`
    return `/lists/${boardMatch[1]}`
  }

  const boardCardMatch = BOARD_CARD_ROUTE.exec(pathname)
  if (boardCardMatch) return `/lists/${boardCardMatch[1]}/tasks/${boardCardMatch[2]}`

  if (pathname === '/agenda' || pathname === '/today') return '/'

  const agendaListMatch = AGENDA_LIST_ROUTE.exec(pathname)
  if (agendaListMatch) return `/lists/${agendaListMatch[1]}`

  return null
}
