const THEME_KEY = 'theme'

export function persistTheme(isDark: boolean) {
  try {
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light')
  } catch {
    // ignore
  }
}

export function toggleTheme() {
  const nextIsDark = !document.documentElement.classList.contains('dark')
  document.documentElement.classList.toggle('dark', nextIsDark)
  persistTheme(nextIsDark)
}
