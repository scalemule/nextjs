/** URLs in analytics/referrers must never carry authentication proof. */
export function withoutAuthSecrets(value: string | undefined): string | undefined {
  if (!value) return value
  try {
    const url = new URL(value)
    let changed = false
    for (const name of [...url.searchParams.keys()]) {
      if (/^(token|code|state|password|new_password|access_token|refresh_token|id_token|api_key|client_secret|challenge_token|challenge_code)$/i.test(name)) { url.searchParams.delete(name); changed = true }
    }
    if (url.hash) { url.hash = ''; changed = true }
    return changed ? url.toString() : value
  } catch { return undefined }
}
