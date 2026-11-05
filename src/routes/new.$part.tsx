import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { z } from 'zod'
import { BackToReading, Shell } from '../components/Shell'
import { Icon } from '../components/Icon'
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

function Setup() {
  const { part } = Route.useParams()
  const { ready, ai } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const index = part === 'all' ? 'all' : (Number(part) - 1) as PartIndex
  const meta = index === 'all' ? null : PARTS[index]
  const [source, setSource] = useState('starter')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
    await navigate({ to: '/attempt/$id', params: { id } })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const timed = form.get('mode') === 'timed'
    const difficulty = form.get('difficulty') === 'challenge' ? 'challenge' : 'standard'
    void run(async () => {
      if (source === 'starter') return begin(timed)
      const response = await newExam({ data: { part: index, difficulty } })
      if (!response.id) throw new Error(response.error)
      await navigate({ search: { ready: response.id, mode: timed ? 'timed' : 'untimed' }, replace: true })
    })
  }

  return <Shell title="Set up a test">
    <div className="section-heading"><div><p className="eyebrow">Reading practice</p><h1>{meta?.name || 'Full Reading mock'}</h1>
      <p>{meta ? `${meta.count} questions · ${meta.minutes} minutes` : '4 parts · 38 questions · 43 minutes'}</p></div><BackToReading /></div>
    <section className="card setup-card">
      {ready ? <>
        <h2>{ready.title} is ready</h2><p>The clock starts when you begin.</p>
        <div className="dialog-actions">
          <Link to="/new/$part" params={{ part }} search={{}} className="button secondary">Choose another test</Link>
          <button className="button dark" disabled={busy} onClick={() => void run(() => begin(search.mode !== 'untimed', ready.id))}>Begin test</button>
        </div>
      </> : <form onSubmit={submit}>
        <fieldset disabled={busy}><legend>Choose a test</legend>
          <label className="choice"><input type="radio" name="source" checked={source === 'starter'} onChange={() => setSource('starter')} /><span><strong>Starter test</strong><small>Original questions, ready now.</small></span></label>
          <label className="choice"><input type="radio" name="source" disabled={!ai} checked={source === 'generated'} onChange={() => setSource('generated')} /><span><strong>Generate a fresh test</strong><small>{ai ? 'New passages and questions from Codex.' : 'A signed-in Codex CLI enables new tests.'}</small></span></label>
        </fieldset>
        {source === 'generated' && <label className="difficulty">Difficulty<select name="difficulty" disabled={busy}><option value="standard">Standard</option><option value="challenge">Challenge</option></select></label>}
        <fieldset disabled={busy}><legend>Choose a mode</legend>
          <label className="choice"><input type="radio" name="mode" value="timed" defaultChecked /><span><strong>Timed</strong><small>Each part locks when its timer runs out.</small></span></label>
          <label className="choice"><input type="radio" name="mode" value="untimed" /><span><strong>Untimed</strong><small>Take as long as you need on each part.</small></span></label>
        </fieldset>
        <div className="dialog-actions"><button type="submit" className="button dark" disabled={busy}><Icon name="arrow" size={17} />{source === 'starter' ? 'Begin test' : 'Generate test'}</button></div>
        {busy && source === 'generated' && <p role="status">Creating the passages and checking the answers. The timer is off.</p>}
      </form>}
      {error && <p role="alert" className="inline-error">{error}</p>}
    </section>
  </Shell>
}
