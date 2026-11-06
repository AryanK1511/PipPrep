import { useEffect, useState } from 'react'
import { APP_CHANGED_EVENT, isAppOutdated } from '../lib/app-version'

export function AppUpdateNotice() {
  const [outdated, setOutdated] = useState(false)
  useEffect(() => {
    const update = () => setOutdated(isAppOutdated())
    window.addEventListener(APP_CHANGED_EVENT, update)
    update()
    return () => window.removeEventListener(APP_CHANGED_EVENT, update)
  }, [])
  if (!outdated) return null
  return <aside className="app-update-notice" role="alert"><strong>Reload PipPrep to reconnect</strong><p>This tab is using a different app version. Copy any unsaved writing before reloading.</p><button className="button dark" onClick={() => window.location.reload()}>Reload app</button></aside>
}
