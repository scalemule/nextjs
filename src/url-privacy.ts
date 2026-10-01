/** URLs in analytics/referrers must never carry authentication proof. */
export function withoutAuthSecrets(value: string | undefined): string | undefined {
  if (!value) return value
  try {
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(value)
    const protocolRelative = value.startsWith('//')
    const url = new URL(value, 'https://relative.invalid')
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    let changed = false
    for (const name of [...url.searchParams.keys()]) {
      if (/^(token|code|state|password|new_password|access_token|refresh_token|id_token|api_key|client_secret|challenge_token|challenge_code)$/i.test(name)) { url.searchParams.delete(name); changed = true }
    }
    if (url.hash) { url.hash = ''; changed = true }
    if (!changed) return value
    if (absolute) return url.toString()
    if (protocolRelative) return url.toString().replace(/^https:/, '')
    return value.split(/[?#]/, 1)[0] + url.search
  } catch { return undefined }
}
