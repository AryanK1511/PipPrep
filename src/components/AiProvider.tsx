import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { PROVIDERS, PROVIDER_LABELS } from '../lib/providers'
import type { AiProvider, CliStatus, ProviderSettings } from '../lib/providers'
import { readProviderSettings, selectProvider } from '../server/actions'

const Context = createContext<{
  settings: ProviderSettings | null
  busy: boolean
  error: string
  refresh: () => Promise<void>
  select: (provider: AiProvider) => Promise<void>
}>({ settings: null, busy: false, error: '', refresh: async () => {}, select: async () => {} })
export const useAiProvider = () => useContext(Context)

export function AiProviderContext({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const current = useRef(settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const saving = useRef(false)
  const channel = useRef<BroadcastChannel | null>(null)
  const apply = useCallback(async (next: ProviderSettings) => {
    const previous = current.current
    current.current = next
    setSettings(next)
    if (previous && JSON.stringify(previous) !== JSON.stringify(next)) await router.invalidate()
  }, [router])
  const check = useCallback(async (refresh = false) => {
    if (saving.current) return
    const request = ++sequence.current
    try {
      const next = await readProviderSettings({ data: { refresh } })
      if (request === sequence.current) { setError(''); await apply(next) }
    } catch { if (request === sequence.current) setError('Could not check CLI status. Try refreshing.') }
  }, [apply])
  useEffect(() => {
    void check()
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('pipprep-provider')
      channel.current.onmessage = () => { void check() }
    }
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void check() }, 30_000)
    const resume = () => { void check() }
    window.addEventListener('focus', resume)
    return () => { sequence.current++; channel.current?.close(); channel.current = null; clearInterval(timer); window.removeEventListener('focus', resume) }
  }, [check])
  async function refresh() { setBusy(true); try { await check(true) } finally { setBusy(false) } }
  async function select(provider: AiProvider) {
    if (busy || saving.current) return
    saving.current = true
    setBusy(true); setError(''); sequence.current++
    if (current.current) setSettings({ ...current.current, selected: provider })
    try {
      await apply(await selectProvider({ data: provider }))
      channel.current?.postMessage('changed')
    }
    catch { setSettings(current.current); setError('Could not save your CLI choice. Please try again.') }
    finally { saving.current = false; setBusy(false) }
  }
  return <Context.Provider value={{ settings, busy, error, refresh, select }}>{children}</Context.Provider>
}

const STATUS: Record<CliStatus, string> = { online: 'Online', 'signed-out': 'Sign in', missing: 'Not installed', error: 'Unavailable' }
export function AiProviderToggle() {
  const { settings, busy, error, refresh, select } = useAiProvider()
  const selectedStatus = settings && settings.providers[settings.selected]
  return <section className="cli-picker" aria-label="AI provider" aria-busy={busy}>
    <div className="cli-heading"><span>Use AI with</span><button type="button" onClick={() => void refresh()} disabled={busy} aria-label="Refresh CLI status">{busy ? 'Checking…' : 'Refresh'}</button></div>
    <fieldset disabled={busy || !settings} aria-describedby="cli-help">
      <legend className="sr-only">AI provider</legend>
      {PROVIDERS.map(provider => <label className={`cli-option${settings?.selected === provider ? ' active' : ''}`} key={provider}>
        <input type="radio" name="ai-provider" value={provider} checked={settings?.selected === provider} onChange={() => void select(provider)} />
        <span className="cli-label">{PROVIDER_LABELS[provider]}<small><span className={`cli-dot ${settings?.providers[provider] || ''}`} aria-hidden="true" />{settings ? STATUS[settings.providers[provider]] : 'Checking…'}</small></span>
      </label>)}
    </fieldset>
    <p id="cli-help" className="cli-help" aria-live="polite">{!settings ? 'Checking CLIs on the app’s computer.' : !settings.enabled ? 'AI is switched off on this server.' : selectedStatus === 'signed-out' ? `Run ${settings.selected === 'codex' ? 'codex login' : 'claude auth login'}, then refresh.` : selectedStatus === 'missing' ? `Install ${PROVIDER_LABELS[settings.selected]} on the app’s computer, then refresh.` : selectedStatus === 'error' ? 'Could not check this CLI. Check it in your terminal, then refresh.' : 'Online means installed and signed in. New requests use your choice; running jobs keep their CLI.'}</p>
    {error && <p className="cli-error" role="alert">{error}</p>}
  </section>
}
