import { useAiProvider } from '../components/AiProvider'
import { PROVIDER_LABELS } from '../lib/providers'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { z } from 'zod'
import { Shell } from '../components/Shell'
import { JobProgress } from '../components/JobProgress'
import { useBackgroundJobs } from '../components/BackgroundJobs'
import { WRITING_TASKS } from '../lib/writing'
import type { WritingScope } from '../lib/writing'
import { beginWritingAttempt, newWritingExam, readWritingSetup } from '../server/actions'

export const Route = createFileRoute('/writing/new/$task')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  validateSearch: z.object({ ready: z.uuid().optional().catch(undefined), mode: z.enum(['timed', 'untimed']).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ ready: search.ready }),
  loader: ({ params, deps }) => { if (!['all', '1', '2'].includes(params.task)) throw notFound(); return readWritingSetup({ data: deps }) },
  component: Setup,
})
function Setup() {
  const { settings, busy: providerBusy } = useAiProvider()
  const providerName = settings ? PROVIDER_LABELS[settings.selected] : 'your selected CLI'
  const { task } = Route.useParams()
  const { ready: loadedReady, ai } = Route.useLoaderData()
  const { jobs, remember, dismiss } = useBackgroundJobs()
  const job = jobs.find(job => job.kind === 'writing' && job.target === task)
  const ready = loadedReady || (job?.state === 'ready' ? { id: String(job.result), title: 'Your writing test' } : null)
  const generating = job?.state === 'running' && !ready
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const scope: WritingScope = task === 'all' ? 'all' : task === '1' ? 0 : 1
  const meta = scope === 'all' ? null : WRITING_TASKS[scope]
  const [source, setSource] = useState(ai ? 'generated' : 'starter')
  useEffect(() => { if (!ai) setSource('starter') }, [ai])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(work: () => Promise<void>) {
    setBusy(true); setError('')
    try { await work() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.') }
    finally { setBusy(false) }
  }
  async function begin(timed: boolean, examId?: string) {
    const id = await beginWritingAttempt({ data: { task: scope, timed, examId } })
    if (!id) throw new Error('These writing prompts could not be found.')
    if (job?.state === 'ready' && job.result === examId) await dismiss(job.id)
    await navigate({ to: '/writing/attempt/$id', params: { id } })
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (providerBusy) return
    const timed = new FormData(event.currentTarget).get('mode') === 'timed'
    void run(async () => {
      if (source === 'starter') return begin(timed)
      const result = await newWritingExam({ data: { task: scope, mode: timed ? 'timed' : 'untimed' } })
      remember(result)
    })
  }
  return <Shell title="Set up writing">
    <div className="section-heading"><div><p className="eyebrow">Writing practice</p><h1>{meta?.name || 'Full Writing mock'}</h1><p>{meta ? `Task ${Number(task)} · ${meta.minutes} minutes` : '2 tasks · 53 minutes'} · about 150–200 words per response</p></div><Link to="/writing" className="button secondary">Back to Writing</Link></div>
    <section className="card setup-card">{ready ? <><h2>{ready.title} is ready</h2><p>The clock starts when you begin.</p><div className="dialog-actions">
      <Link to="/writing/new/$task" params={{ task }} search={{}} className="button secondary" onClick={() => { if (job?.state === 'ready') void dismiss(job.id).catch(() => setError('Could not clear this test. Please retry.')) }}>Choose another test</Link><button className="button dark" disabled={busy} onClick={() => void run(() => begin((loadedReady ? search.mode : job?.mode ?? search.mode) !== 'untimed', ready.id))}>Begin writing</button>
    </div></> : <form onSubmit={submit} hidden={generating}>
      <fieldset disabled={busy || providerBusy}><legend>Choose prompts</legend>
        <label className="choice"><input type="radio" name="source" checked={source === 'starter'} onChange={() => setSource('starter')} /><span><strong>Starter prompts</strong><small>Original tasks, ready now.</small></span></label>
        <label className="choice"><input type="radio" name="source" disabled={!ai} checked={source === 'generated'} onChange={() => setSource('generated')} /><span><strong>Generate fresh prompts</strong><small>{ai ? `New situations from ${providerName}.` : 'Select a signed-in CLI in the sidebar to generate prompts.'}</small></span></label>
      </fieldset>
      <fieldset disabled={busy || providerBusy}><legend>Choose a mode</legend>
        <label className="choice"><input type="radio" name="mode" value="timed" defaultChecked /><span><strong>Timed</strong><small>Each task locks at its deadline. Moving on locks your response.</small></span></label>
        <label className="choice"><input type="radio" name="mode" value="untimed" /><span><strong>Untimed</strong><small>Take your time to plan, write, and revise.</small></span></label>
      </fieldset>
      <p className="setup-note">Your writing is saved as you type. After submission, {providerName} can estimate your practice level and explain how to improve. {ai ? `Submitted prompts and responses are sent to ${providerName} for feedback.` : 'Select a signed-in CLI in the sidebar for AI feedback. You can still practice and review your responses.'}</p>
      <div className="dialog-actions"><button type="submit" className="button dark" disabled={busy || providerBusy}>{busy ? 'Preparing…' : source === 'starter' ? 'Begin writing' : 'Generate prompts'}</button></div>
    </form>}{generating && <JobProgress title="Building your writing test" detail="You can leave this page and return. The timer starts when you begin writing." startedAt={job.startedAt} steps={[{ label: 'Writing prompts', status: job.updates.prompts || 'Starting' }]} />}
    {job?.state === 'failed' && <p role="alert" className="inline-error">{job.error}</p>}{error && <p role="alert" className="inline-error">{error}</p>}</section>
  </Shell>
}
