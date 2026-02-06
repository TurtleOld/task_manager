import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Инициализация темы должна происходить ДО render(), чтобы избежать "мигания"
// и чтобы `dark:` классы применились сразу.
const THEME_KEY = 'theme'
try {
  const saved = localStorage.getItem(THEME_KEY)
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  const shouldBeDark = saved === 'dark' || (!saved && prefersDark)
  document.documentElement.classList.toggle('dark', !!shouldBeDark)
} catch {
  // ignore: localStorage can be unavailable in private mode / blocked
}

const container = document.getElementById('root')!
const root = createRoot(container)
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

