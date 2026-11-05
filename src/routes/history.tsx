import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { BackToReading, Shell } from '../components/Shell'
import { Icon } from '../components/Icon'
import { Confirm } from '../components/Confirm'
import { deleteSavedAttempt, deleteWritingAttempt, readDashboard, readWritingDashboard } from '../server/actions'

export const Route = createFileRoute('/history')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: async () => {
    const [reading, writing] = await Promise.all([readDashboard(), readWritingDashboard()])
    return { ...reading, writing }
  },
  component: History,
})

function History() {
  const { entries, writing } = Route.useLoaderData()
  const [deleting, setDeleting] = useState<{ id: string; writing: boolean } | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()
  async function remove(target: { id: string; writing: boolean }) {
    try {
      await (target.writing ? deleteWritingAttempt : deleteSavedAttempt)({ data: target.id })
      await router.invalidate()
    } catch { setError('Could not delete this attempt. Please try again.') }
    setDeleting(null)
  }
  return <Shell title="Attempt history">
    <div className="section-heading"><div><p className="eyebrow">Study record</p><h1>Attempt history</h1><p>Revisit Reading answers and Writing feedback.</p></div><BackToReading /></div>
    {error && <p role="alert" className="inline-error">{error}</p>}
    <h2>Reading attempts</h2>
    {entries.length ? <div className="history-list">{entries.map(entry => <article className="history-row" key={entry.id}>
      <span className="icon-tile"><Icon name={entry.origin === 'generated' ? 'sparkle' : 'book'} /></span>
      <div><h2>{entry.title}</h2><p><LocalDate timestamp={entry.finishedAt} /> · {entry.timed ? 'Timed' : 'Untimed'}</p></div>
      <strong className="history-score">{entry.score}<small>/{entry.total}</small></strong>
      <Link className="button secondary" to="/results/$id" params={{ id: entry.id }}>Review</Link>
      <button type="button" className="icon-button" aria-label="Delete attempt" onClick={() => setDeleting({ id: entry.id, writing: false })}><Icon name="x" size={18} /></button>
    </article>)}</div> : <div className="card empty"><h2>Your first attempt will appear here.</h2><p>Finish a part or a full mock to see its results.</p></div>}
    <h2 className="writing-history">Writing attempts</h2>
    {writing.entries.length ? <div className="history-list">{writing.entries.map(entry => <article className="history-row" key={entry.id}>
      <span className="icon-tile"><Icon name="pen" /></span><div><h2>{entry.title}</h2><p><LocalDate timestamp={entry.finishedAt} /> · {entry.timed ? 'Timed' : 'Untimed'} · {entry.taskCount} {entry.taskCount === 1 ? 'task' : 'tasks'}</p></div>
      <strong className="history-score" aria-label={entry.estimate ? `Estimated ${entry.taskCount === 1 ? 'task' : 'Writing'} score` : undefined}>{entry.estimate ? entry.estimate.low === entry.estimate.high ? entry.estimate.low : `${entry.estimate.low}–${entry.estimate.high}` : entry.reviewed ? 'Reviewed' : 'Unscored'}{entry.estimate && <small>/12</small>}</strong>
      <Link className="button secondary" to="/writing/results/$id" params={{ id: entry.id }}>Review writing</Link><button type="button" className="icon-button" aria-label="Delete writing attempt" onClick={() => setDeleting({ id: entry.id, writing: true })}><Icon name="x" size={18} /></button>
    </article>)}</div> : <div className="card empty"><p>Finish a writing task or mock to save your responses here.</p><Link to="/writing" className="button secondary">Practice writing</Link></div>}
    {deleting && <Confirm title="Delete this attempt?" text="This removes the saved responses and feedback from your study record." onClose={() => setDeleting(null)}>
      <button className="button dark" onClick={() => void remove(deleting)}>Delete attempt</button>
    </Confirm>}
  </Shell>
}

function LocalDate({ timestamp }: { timestamp: number }) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    setLabel(new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }))
  }, [timestamp])
  return <time dateTime={new Date(timestamp).toISOString()}>{label}</time>
}
