import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000'
  const allowedHost = (() => {
    const raw = (env.FRONTEND_BASE_URL || '').trim()
    if (!raw) return null
    try {
      return new URL(raw).hostname
    } catch {
      return raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0] || null
    }
  })()
  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      allowedHosts: allowedHost ? [allowedHost] : undefined,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})

