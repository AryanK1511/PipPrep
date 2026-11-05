import { useEffect, useState } from 'react'
import { Icon } from './Icon'

const storageKey = 'pipprep-theme'

// Run before the stylesheet loads so returning night-time readers never see a light flash.
export const themeScript = `(() => {
  let theme;
  try { theme = localStorage.getItem('${storageKey}'); } catch {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();`

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark')
  }, [])

  function toggle() {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    setDark(theme === 'dark')
    try { localStorage.setItem(storageKey, theme) } catch { /* Theme still works when storage is unavailable. */ }
  }

  const label = dark ? 'Switch to light theme' : 'Switch to dark theme'
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
    <Icon name={dark ? 'sun' : 'moon'} size={18} /><span>{dark ? 'Light mode' : 'Dark mode'}</span>
  </button>
}
