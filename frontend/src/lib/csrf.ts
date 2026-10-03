const CSRF_COOKIE = 'csrftoken'

export function readCsrfToken(): string {
  for (const part of document.cookie.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === CSRF_COOKIE) return decodeURIComponent(value.join('='))
  }
  return ''
}
