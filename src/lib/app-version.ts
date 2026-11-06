export const APP_VERSION_HEADER = 'x-pipprep-version'
export const APP_RELOAD_HEADER = 'x-pipprep-reload'
export const APP_CHANGED_EVENT = 'pipprep:app-changed'
export const APP_CHANGED_MESSAGE = 'PipPrep switched server versions. Copy any unsaved writing, then reload this page to reconnect.'

let outdated = false
export const isAppOutdated = () => outdated
export function markAppOutdated() {
  if (outdated) return
  outdated = true
  window.dispatchEvent(new Event(APP_CHANGED_EVENT))
}
