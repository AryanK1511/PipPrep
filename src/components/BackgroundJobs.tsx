import { PROVIDER_LABELS } from '../lib/providers'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { BackgroundJob } from '../lib/jobs'
import { dismissBackgroundJob, readBackgroundJobs } from '../server/actions'

const Context = createContext<{ jobs: BackgroundJob[]; connected: boolean; loaded: boolean; remember: (job: BackgroundJob) => void; dismiss: (id: string) => Promise<void> }>({ jobs: [], connected: true, loaded: false, remember: () => {}, dismiss: async () => {} })
export const useBackgroundJobs = () => useContext(Context)
export function BackgroundJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<BackgroundJob[]>([])
  const [connected, setConnected] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const revision = useRef(0)
  const running = jobs.some(job => job.state === 'running')
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let sequence = 0
    async function refresh() {
      if (document.visibilityState === 'hidden') return
      const request = ++sequence
      const version = revision.current
      try {
        const latest = await readBackgroundJobs()
        if (!disposed && request === sequence) { if (version === revision.current) setJobs(latest); setConnected(true); setLoaded(true) }
      } catch { if (!disposed && request === sequence) setConnected(false) }
      finally { if (!disposed && request === sequence) timer = setTimeout(refresh, running ? 1500 : 30_000) }
    }
    function resume() { clearTimeout(timer); sequence++; void refresh() }
    void refresh()
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => { disposed = true; clearTimeout(timer); window.removeEventListener('focus', resume); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume) }
  }, [running])
  function remember(job: BackgroundJob) { revision.current++; setJobs(current => [job, ...current.filter(item => item.id !== job.id)]) }
  async function dismiss(id: string) {
    await dismissBackgroundJob({ data: id })
    revision.current++
    setJobs(current => current.filter(job => job.id !== id))
  }
  return <Context.Provider value={{ jobs, connected, loaded, remember, dismiss }}>{children}</Context.Provider>
}
export function BackgroundJobs() {
  const { jobs, connected, dismiss } = useBackgroundJobs()
  const [error, setError] = useState('')
  return <>{jobs.length > 0 && <aside className="background-jobs" aria-label="Background activity">
    {!connected && <p role="status">Reconnecting to check progress. Your work continues on the server.</p>}
    {jobs.map(job => <div className="background-job" key={job.id}>
      <span className={job.state === 'running' ? 'activity-spinner' : 'status-dot'} aria-hidden="true" />
      <div><strong>{job.kind === 'room' ? 'Room test' : job.kind === 'feedback' ? 'Writing feedback' : job.kind === 'writing' ? 'Writing prompts' : 'Reading test'} · {job.state === 'ready' ? 'Ready' : job.state === 'failed' ? 'Needs attention' : 'In progress'}</strong>
        <small>{job.provider && <>{PROVIDER_LABELS[job.provider]} · </>}{job.error || (job.state === 'running' ? Object.values(job.updates).at(-1) || 'Starting' : 'Saved and ready to open.')}</small></div>
      {job.kind === 'room' ? <Link to="/rooms/$code" params={{ code: job.target.split(':')[0] }} className="button quiet">Open room</Link>
        : job.kind === 'feedback' ? <Link to="/writing/results/$id" params={{ id: job.target }} className="button quiet">View feedback</Link>
        : job.kind === 'writing' ? <Link to="/writing/new/$task" params={{ task: job.target }} search={job.state === 'ready' ? { ready: String(job.result), mode: job.mode } : {}} className="button quiet">{job.state === 'ready' ? 'Open prompts' : 'View progress'}</Link>
        : <Link to="/new/$part" params={{ part: job.target }} search={job.state === 'ready' ? { ready: String(job.result), mode: job.mode } : {}} className="button quiet">{job.state === 'ready' ? 'Open test' : 'View progress'}</Link>}
      {job.state !== 'running' && <button type="button" className="button quiet" aria-label="Dismiss activity" onClick={() => void dismiss(job.id).catch(() => setError('Could not dismiss this activity. Please retry.'))}>Dismiss</button>}
    </div>)}{error && <p role="alert">{error}</p>}
  </aside>}</>
}
