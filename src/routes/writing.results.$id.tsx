import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Shell } from '../components/Shell'
import { Icon } from '../components/Icon'
import { WritingPrompt } from '../components/WritingPrompt'
import { DIMENSIONS, wordCount, WRITING_TASKS } from '../lib/writing'
import type { WritingAttempt, WritingFeedback } from '../lib/writing'
import { readAiStatus, readWritingResult, requestWritingFeedback } from '../server/actions'

export const Route = createFileRoute('/writing/results/$id')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: async ({ params }) => {
    if (!z.uuid().safeParse(params.id).success) throw notFound()
    const [attempt, ai] = await Promise.all([readWritingResult({ data: params.id }), readAiStatus()])
    if (!attempt) throw notFound()
    return { attempt, ai }
  },
  component: () => { const { attempt, ai } = Route.useLoaderData(); return <Results key={attempt.id} attempt={attempt} enabled={ai} /> },
})
const band = (value: WritingFeedback['estimate']) => value ? value.low === value.high ? String(value.low) : `${value.low}–${value.high}` : '—'
const duration = (ms: number) => `${Math.floor(ms / 60_000)}m ${Math.floor(ms % 60_000 / 1000)}s`

function Results({ attempt, enabled }: { attempt: WritingAttempt; enabled: boolean }) {
  const [feedback, setFeedback] = useState(attempt.feedback)
  const hasText = attempt.exam.tasks.some(task => (attempt.responses[task.index] || '').trim())
  const [busy, setBusy] = useState(enabled && hasText && !feedback)
  const [error, setError] = useState('')
  const started = useRef(false)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  async function assess() {
    setBusy(true); setError('')
    try {
      const result = await requestWritingFeedback({ data: attempt.id })
      if (!result.feedback) throw new Error(result.error)
      setFeedback(result.feedback)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not assess your writing. Please retry.') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (enabled && hasText && !attempt.feedback && !started.current) { started.current = true; void assess() }
  }, [enabled, hasText, attempt.id])
  useEffect(() => {
    const recovered: Record<number, string> = {}
    for (const task of attempt.exam.tasks) {
      try {
        const key = `readline-writing:${attempt.id}:${task.index}`
        const draft = JSON.parse(localStorage.getItem(key) || 'null')
        if (typeof draft?.response === 'string' && draft.response !== (attempt.responses[task.index] || '')) recovered[task.index] = draft.response
        else localStorage.removeItem(key)
      } catch { /* Server responses remain available if browser storage is disabled. */ }
    }
    setDrafts(recovered)
  }, [attempt.id])
  const full = attempt.exam.tasks.length === 2
  const score = full ? feedback?.estimate : feedback?.tasks.find(task => task.index === attempt.exam.tasks[0].index)?.estimate
  return <Shell title="Writing review">
    <div className="section-heading"><div><p className="eyebrow">Attempt complete</p><h1>Writing results</h1><p>{attempt.exam.title} · {attempt.timed ? 'Timed' : 'Untimed'} · {duration(attempt.elapsed.reduce((sum, ms) => sum + ms, 0))} used</p></div><Link to="/writing" className="button secondary">Back to Writing</Link></div>
    <div className="result-top"><section className="score-card" aria-label="Writing score" aria-live="polite"><span className="eyebrow">{full ? 'Estimated Writing score' : 'Estimated task score'}</span><div><strong>{band(score ?? null)}</strong>{score && <span> / 12</span>}</div><p>{score ? full ? 'CELPIP Writing · AI practice estimate' : `Task ${attempt.exam.tasks[0].index + 1} · AI practice estimate` : busy ? 'Scoring your writing…' : !hasText ? 'Not enough writing to score' : !enabled && !feedback ? 'Enable AI to get your score' : full ? 'No component estimate' : 'No task estimate'}</p></section>
      <section className="card score-summary"><h2>Your writing snapshot</h2><p>AI estimates are uncertain practice feedback. CELPIP uses trained raters and its own score conversion. A single task cannot establish a Writing component level.</p>
        <div className="breakdown">{attempt.exam.tasks.map((task, i) => {
          const taskScore = feedback?.tasks.find(item => item.index === task.index)?.estimate
          return <div key={task.index}><span>Task {task.index + 1} · {WRITING_TASKS[task.index].short}<small className="writing-task-meta">{duration(attempt.elapsed[i])} · {wordCount(attempt.responses[task.index] || '')} words</small></span><strong>{taskScore ? `Estimated score ${band(taskScore)} / 12` : busy ? 'Scoring…' : 'No task score'}</strong></div>
        })}</div>
      </section></div>
    <section className="card coach-card"><div className="coach-heading"><span className="icon-tile"><Icon name="sparkle" /></span><div><h2>AI writing feedback</h2><p>Evidence, corrections, and your next steps</p></div></div>
      <div aria-live="polite">{feedback ? <><p>{feedback.summary}</p><ol className="coach-actions">{feedback.actions.map(action => <li key={action.title}><strong>{action.title}</strong><span>{action.advice}</span></li>)}</ol></>
        : !hasText ? <p>No writing was submitted, so there is not enough evidence to estimate a level. Start another attempt and write a response to get feedback.</p>
        : busy ? <p role="status">Assessing your writing against all four dimensions. Your submitted responses are available below.</p>
        : <>{error && <p role="alert" className="inline-error">{error}</p>}<p>{enabled ? 'Your responses are saved. You can retry the assessment.' : 'A signed-in Codex CLI enables scoring and coaching. Start the app with AI enabled, then reload this review. Your responses are saved below.'}</p>{enabled && <button className="button secondary" onClick={() => void assess()}>Retry writing feedback</button>}</>}</div>
    </section>
    <section><div className="section-heading"><div><h2>Your response review</h2><p>Submitted text stays unchanged. Revisions below are examples for study.</p></div></div>
      {attempt.exam.tasks.map(task => {
        const text = attempt.responses[task.index] || ''
        const review = feedback?.tasks.find(item => item.index === task.index)
        const count = wordCount(text)
        return <article className="review-part writing-review" key={task.index}>
          <div className="review-part-head"><h3>Task {task.index + 1} · {WRITING_TASKS[task.index].name}</h3><span className="badge">{review?.estimate ? `Estimated task score ${band(review.estimate)} / 12` : `${count} words`}</span></div>
          <details className="review-source"><summary>Read the task again</summary><WritingPrompt task={task} /></details>
          <h4>Your submitted response</h4><div className="submitted-writing">{text || 'No response submitted.'}</div>
          <p className="word-note">{count} words · {count === 0 ? 'No language to assess.' : count < 150 ? 'Below the suggested range. Check that you developed each required point.' : count > 200 ? 'Above the suggested range. Check for repetition and keep the response focused.' : 'Within the suggested 150–200-word range.'} Word count alone does not determine a level.</p>
          {drafts[task.index] && <details className="recovered-draft"><summary>Recover unsaved browser text</summary><p>This text was kept in your browser but was not part of the submitted response. It has not been scored.</p><textarea aria-label={`Unsaved Task ${task.index + 1} draft`} value={drafts[task.index]} readOnly /></details>}
          {review && <><p className="task-summary">{review.summary}</p>
            <div className="dimension-grid">{review.dimensions.map(dimension => <section className="dimension-card" key={dimension.key}><h4>{DIMENSIONS[dimension.key]}</h4><p>{dimension.observation}</p>{dimension.quote && <blockquote>{dimension.quote}</blockquote>}<p><strong>Next step:</strong> {dimension.advice}</p></section>)}</div>
            <h4>Did you cover the task?</h4><ul className="coverage-list">{review.coverage.map(point => <li key={point.requirement}><span className="badge">{point.status === 'met' ? 'Covered' : point.status === 'partial' ? 'Partly covered' : 'Missing'}</span><div><strong>{task.requirements[point.requirement]}</strong><p>{point.explanation}</p></div></li>)}</ul>
            <h4>Specific corrections</h4>{review.corrections.length ? <div className="correction-list">{review.corrections.map((correction, i) => <div key={i}><p><strong>Original:</strong> <q>{correction.original}</q></p><p><strong>Revision:</strong> {correction.replacement}</p><p>{correction.reason}</p></div>)}</div> : <p>No specific corrections were identified. Use the dimension feedback to guide your next draft.</p>}
            <details className="improved-writing"><summary>Study an illustrative improved response</summary><p>This example develops the response for learning. It may add illustrative details and has no official score.</p><div className="submitted-writing">{review.improvedResponse}</div><p className="word-note">{wordCount(review.improvedResponse)} words</p></details>
          </>}
        </article>
      })}
    </section>
    <div className="dialog-actions"><Link to="/writing/new/$task" params={{ task: 'all' }} className="button dark">Practise again<Icon name="arrow" size={17} /></Link><Link to="/history" className="button secondary">Attempt history</Link></div>
  </Shell>
}
