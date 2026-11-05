import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { BackToReading, Shell } from '../components/Shell'
import { Icon } from '../components/Icon'
import { Confirm } from '../components/Confirm'
import { deleteSavedAttempt, readDashboard } from '../server/actions'

export const Route = createFileRoute('/history')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: () => readDashboard(),
  component: History,
})

function History() {
  const { entries } = Route.useLoaderData()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()
  async function remove(id: string) {
    try {
      await deleteSavedAttempt({ data: id })
      await router.invalidate()
    } catch { setError('Could not delete this attempt. Please try again.') }
    setDeleting(null)
  }
  return <Shell title="Attempt history">
    <div className="section-heading"><div><p className="eyebrow">Study record</p><h1>Attempt history</h1><p>Revisit answers and track your raw scores.</p></div><BackToReading /></div>
    {error && <p role="alert" className="inline-error">{error}</p>}
    {entries.length ? <div className="history-list">{entries.map(entry => <article className="history-row" key={entry.id}>
      <span className="icon-tile"><Icon name={entry.origin === 'generated' ? 'sparkle' : 'book'} /></span>
      <div><h2>{entry.title}</h2><p><time dateTime={new Date(entry.finishedAt).toISOString()}>{new Date(entry.finishedAt).toISOString().slice(0, 10)}</time> · {entry.timed ? 'Timed' : 'Untimed'}</p></div>
      <strong className="history-score">{entry.score}<small>/{entry.total}</small></strong>
      <Link className="button secondary" to="/results/$id" params={{ id: entry.id }}>Review</Link>
      <button type="button" className="icon-button" aria-label="Delete attempt" onClick={() => setDeleting(entry.id)}><Icon name="x" size={18} /></button>
    </article>)}</div> : <div className="card empty"><h2>Your first attempt will appear here.</h2><p>Finish a part or a full mock to see its results.</p></div>}
    {deleting && <Confirm title="Delete this attempt?" text="This removes the saved answers, score, and coaching from your study record." onClose={() => setDeleting(null)}>
      <button className="button dark" onClick={() => void remove(deleting)}>Delete attempt</button>
    </Confirm>}
  </Shell>
}
