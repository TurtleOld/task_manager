export const AUTH_FAILED_WS_CODE = 4001

type SessionExpiredHandler = () => void

let handler: SessionExpiredHandler | null = null

export function setSessionExpiredHandler(next: SessionExpiredHandler | null): void {
  handler = next
}

export function notifySessionExpired(): void {
  handler?.()
}

export function isAuthFailureCloseCode(code: number): boolean {
  return code === AUTH_FAILED_WS_CODE
}

/**
 * Decide whether a closed socket should be reopened. The server closes with
 * `AUTH_FAILED_WS_CODE` when the token no longer authenticates, and retrying
 * every few seconds can never fix that.
 */
export function shouldReconnectAfterClose(code: number): boolean {
  if (isAuthFailureCloseCode(code)) {
    notifySessionExpired()
    return false
  }
  return true
}
