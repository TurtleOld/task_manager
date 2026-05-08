interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_ONESIGNAL_APP_ID?: string
  readonly VITE_WS_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
