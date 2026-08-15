/**
 * Reduce a post-login redirect target to a path inside this app.
 *
 * Anything a browser may read as an absolute URL is rejected: `//evil.com` and
 * `/\evil.com` are protocol-relative, and a scheme (`javascript:`, `https:`)
 * navigates away entirely. Returns null when the value cannot be trusted, so
 * the caller falls back to its own default.
 */
export function safeRedirectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null

  // Browsers strip control characters (including \t, \n, \r) while resolving a
  // URL, so `/\t/evil.com` would otherwise pass the checks below and only then
  // collapse into the protocol-relative `//evil.com`.
  // eslint-disable-next-line no-control-regex
  const path = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()

  if (!path.startsWith('/')) return null
  if (path.startsWith('//') || path.startsWith('/\\')) return null

  return path
}
