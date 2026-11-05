// Move backups from older versions into this tab before using them.
export function readWritingBackup(key: string) {
  const current = sessionStorage.getItem(key)
  if (current !== null) return current
  let legacy: string | null
  try { legacy = localStorage.getItem(key) } catch { return null }
  if (legacy !== null) {
    sessionStorage.setItem(key, legacy)
    localStorage.removeItem(key)
  }
  return legacy
}
