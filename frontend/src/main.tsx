import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import OneSignal from 'react-onesignal'
import { applyAppFontSize, loadAppFontSize } from './app/preferences'
import App from './App'
import { Toaster } from '@/components/ui/sonner'
import './index.css'

// Инициализация темы должна происходить ДО render(), чтобы избежать "мигания"
// и чтобы `dark:` классы применились сразу.
const THEME_KEY = 'theme'
try {
  const saved = localStorage.getItem(THEME_KEY)
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  const shouldBeDark = saved === 'dark' || (!saved && prefersDark)
  document.documentElement.classList.toggle('dark', !!shouldBeDark)
  applyAppFontSize(loadAppFontSize())
} catch {
  // ignore: localStorage can be unavailable in private mode / blocked
}

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || ''

if (ONESIGNAL_APP_ID) {
  OneSignal.init({
    appId: ONESIGNAL_APP_ID,
    allowLocalhostAsSecureOrigin: true,
    serviceWorkerParam: { scope: '/' },
    path: '/OneSignalSDKWorker.js',
  }).catch((err: unknown) => {
    console.warn('OneSignal init failed:', err)
  })
}

export { OneSignal }

const container = document.getElementById('root')!
const root = createRoot(container)
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>
)
