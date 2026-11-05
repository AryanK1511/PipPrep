import { useAiProvider } from '../components/AiProvider'
import { PROVIDER_LABELS } from '../lib/providers'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { z } from 'zod'
import { BackToReading, Shell } from '../components/Shell'
import { Icon } from '../components/Icon'
import { Dropdown } from '../components/Dropdown'
import { JobProgress } from '../components/JobProgress'
import { useBackgroundJobs } from '../components/BackgroundJobs'
import type { PartStage } from '../lib/progress'
import { PARTS } from '../lib/reading'
import type { PartIndex } from '../lib/types'
import { beginAttempt, newExam, readSetup } from '../server/actions'

export const Route = createFileRoute('/new/$part')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  validateSearch: z.object({ ready: z.uuid().optional().catch(undefined), mode: z.enum(['timed', 'untimed']).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ ready: search.ready }),
  loader: ({ params, deps }) => {
    if (!['all', '1', '2', '3', '4'].includes(params.part)) throw notFound()
    return readSetup({ data: deps })
  },
  component: Setup,
})

const PART_STATUS = {
  queued: 'Queued',
  writing: 'Writing questions',
  checking: 'Checking format and evidence',
  revising: 'Revising after checks',
  ready: 'Ready',
}

function Setup() {
  const { settings, busy: providerBusy } = useAiProvider()
  const providerName = settings ? PROVIDER_LABELS[settings.selected] : 'your selected CLI'
  const { part } = Route.useParams()
  const { ready: loadedReady, ai } = Route.useLoaderData()
  const { jobs, remember, dismiss } = useBackgroundJobs()
  const job = jobs.find(job => job.kind === 'reading' && job.target === part)
  const ready = loadedReady || (job?.state === 'ready' ? { id: String(job.result), title: 'Your reading test' } : null)
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const index = part === 'all' ? 'all' : (Number(part) - 1) as PartIndex
  const meta = index === 'all' ? null : PARTS[index]
  const [source, setSource] = useState(ai ? 'generated' : 'starter')
  useEffect(() => { if (!ai) setSource('starter') }, [ai])
  const [busy, setBusy] = useState(false)
  const [difficulty, setDifficulty] = useState(0)
  const stages = (job?.updates ?? {}) as Partial<Record<PartIndex, PartStage>>
  const indices: PartIndex[] = index === 'all' ? [0, 1, 2, 3] : [index]
  const finished = indices.filter(i => stages[i] === 'ready').length
  const [error, setError] = useState('')
  const generating = job?.state === 'running' && !ready

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.') }
    finally { setBusy(false) }
  }

  async function begin(timed: boolean, examId?: string) {
    const id = await beginAttempt({ data: { part: index, timed, examId } })
    if (!id) throw new Error('This generated test could not be found.')
    if (job?.state === 'ready' && job.result === examId) await dismiss(job.id)
    await navigate({ to: '/attempt/$id', params: { id } })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (providerBusy) return
    const form = new FormData(event.currentTarget)
    const timed = form.get('mode') === 'timed'
    void run(async () => {
      if (source === 'starter') return begin(timed)
      const response = await newExam({ data: { part: index, difficulty: difficulty === 1 ? 'challenge' : 'standard', mode: timed ? 'timed' : 'untimed' } })
      remember(response)
    })
  }

  return <Shell title="Set up a test">
    <div className="section-heading"><div><p className="eyebrow">Reading practice</p><h1>{meta?.name || 'Full Reading mock'}</h1>
      <p>{meta ? `${meta.count} questions · ${meta.minutes} minutes` : '4 parts · 38 questions · 43 minutes'}</p></div><BackToReading /></div>
    <section className="card setup-card">
      {ready ? <>
        <h2>{ready.title} is ready</h2><p>{search.mode === 'untimed' ? 'Take as long as you need on each part.' : 'The clock starts when you begin.'}</p>
        <div className="dialog-actions">
          <Link to="/new/$part" params={{ part }} search={{}} className="button secondary" onClick={() => { if (job?.state === 'ready') void dismiss(job.id).catch(() => setError('Could not clear this test. Please retry.')) }}>Choose another test</Link>
          <button className="button dark" disabled={busy} onClick={() => void run(() => begin((loadedReady ? search.mode : job?.mode ?? search.mode) !== 'untimed', ready.id))}>Begin test</button>
        </div>
      </> : <form onSubmit={submit} hidden={generating}>
        <fieldset disabled={busy || providerBusy}><legend>Choose a test</legend>
          <label className="choice"><input type="radio" name="source" checked={source === 'starter'} onChange={() => setSource('starter')} /><span><strong>Starter test</strong><small>Original questions, ready now.</small></span></label>
          <label className="choice"><input type="radio" name="source" disabled={!ai} checked={source === 'generated'} onChange={() => setSource('generated')} /><span><strong>Generate a fresh test</strong><small>{ai ? `New passages and questions from ${providerName}.` : 'Select a signed-in CLI in the sidebar to generate tests.'}</small></span></label>
        </fieldset>
        {source === 'generated' && <div className="difficulty"><label htmlFor="difficulty">Difficulty</label>
          <Dropdown id="difficulty" label="Difficulty" options={['Standard', 'Challenge']} value={difficulty} onChange={setDifficulty} disabled={busy} />
        </div>}
        <fieldset disabled={busy || providerBusy}><legend>Choose a mode</legend>
          <label className="choice"><input type="radio" name="mode" value="timed" defaultChecked /><span><strong>Timed</strong><small>Each part locks when its timer runs out.</small></span></label>
          <label className="choice"><input type="radio" name="mode" value="untimed" /><span><strong>Untimed</strong><small>Take as long as you need on each part.</small></span></label>
        </fieldset>
        <div className="dialog-actions"><button type="submit" className="button dark" disabled={busy || providerBusy}><Icon name="arrow" size={17} />{source === 'starter' ? 'Begin test' : 'Generate test'}</button></div>
      </form>}
      {job?.state === 'failed' && <p role="alert" className="inline-error">{job.error}</p>}
      {generating && <JobProgress
        startedAt={job.startedAt}
        title={finished === indices.length ? 'Saving your test' : 'Building your test'}
        detail={`${finished} of ${indices.length} ${indices.length === 1 ? 'part' : 'parts'} ready. You can leave this page and return.`}
        steps={indices.map(i => ({ label: PARTS[i].short, status: PART_STATUS[stages[i] ?? 'queued'], done: stages[i] === 'ready' }))}
      />}
      {error && <p role="alert" className="inline-error">{error}</p>}
    </section>
  </Shell>
}
