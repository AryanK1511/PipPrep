import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { BackToReading, Shell } from '../components/Shell'
import { Icon } from '../components/Icon'
import { JobProgress } from '../components/JobProgress'
import { readJob } from '../lib/progress'
import type { CoachStage } from '../lib/progress'
import { Source } from '../components/Source'
import { PARTS, SKILLS, markAttempt, optionsFor, promptFor, referenceBands } from '../lib/reading'
import type { Attempt, Coaching, Part } from '../lib/types'
import { readAiStatus, readResult, requestCoaching } from '../server/actions'

export const Route = createFileRoute('/results/$id')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: async ({ params }) => {
    if (!z.uuid().safeParse(params.id).success) throw notFound()
    const [attempt, ai] = await Promise.all([readResult({ data: params.id }), readAiStatus()])
    if (!attempt) throw notFound()
    return { attempt, ai }
  },
  component: () => {
    const { attempt, ai } = Route.useLoaderData()
    return <Results key={attempt.id} attempt={attempt} ai={ai} />
  },
})

function duration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function Results({ attempt, ai }: { attempt: Attempt; ai: boolean }) {
  const [missed, setMissed] = useState(false)
  const { score, total, unanswered, parts } = markAttempt(attempt)
  const missedBySkill = Object.entries(SKILLS).map(([key, label]) => ({
    label, count: parts.flatMap(({ items }) => items).filter(item => !item.correct && item.selected !== null && item.question.skill === key).length,
  })).filter(skill => skill.count > 0).sort((a, b) => b.count - a.count)
  return <Shell title="Answer review">
    <div className="section-heading results-heading"><div><p className="eyebrow">Attempt complete</p><h1>Reading results</h1>
      <p>{attempt.exam.title} · {attempt.timed ? 'Timed' : 'Untimed'} · {duration(attempt.elapsed.reduce((sum, ms) => sum + ms, 0))} used</p></div><BackToReading /></div>
    <div className="result-top">
      <div className="score-card"><span className="eyebrow">Raw practice score</span><div><strong>{score}</strong><span> / {total}</span></div>
        <p>{score === total ? 'Perfect on this form' : `${total - score - unanswered} incorrect · ${unanswered} unanswered`}</p></div>
      <div className="card score-summary">
        {total === 38 ? <div className="band"><div><span className="eyebrow">CELPIP reference band</span><strong>{referenceBands(score).join(' or ')}</strong></div>
          <p>Approximate range from CELPIP’s published chart. Practice forms have no official score equating.</p></div> : <p>Reference bands are shown after full 38-question mocks.</p>}
        <div className="breakdown">{parts.map(({ part, score: correct, total: count }, i) => <div key={part.index}><span>Part {part.index + 1} · {PARTS[part.index].short}</span><small>{duration(attempt.elapsed[i])}</small><strong>{correct}/{count}</strong></div>)}</div>
      </div>
    </div>
    <section className="card coach-card">
      <div className="coach-heading"><span className="icon-tile"><Icon name="sparkle" /></span><div><h2>AI coaching</h2><p>What to work on next</p></div></div>
      <Coach attempt={attempt} enabled={ai} />
      {missedBySkill.length > 0 && <div className="missed-skills" aria-label="Missed skills">{missedBySkill.map(skill => <span className="badge" key={skill.label}>{skill.label} · {skill.count} missed</span>)}</div>}
    </section>
    <section className="review-section"><div className="section-heading"><div><h2>Answer review</h2><p>See your choice, the correct answer, and the supporting text.</p></div>
      <div className="segmented" aria-label="Filter answers"><button className="button quiet" aria-pressed={!missed} onClick={() => setMissed(false)}>All answers</button>
        <button className="button quiet" aria-pressed={missed} onClick={() => setMissed(true)}>Missed only</button></div></div>
      {missed && score === total && <p className="empty">You answered every question correctly.</p>}
      {parts.map(({ part, items, score: correct, total: count }) => {
        const visible = missed ? items.filter(item => !item.correct) : items
        if (!visible.length) return null
        return <section className="review-part" key={part.index}>
          <div className="review-part-head"><h3>Part {part.index + 1} · {PARTS[part.index].short}</h3><span className="badge">{correct} / {count}</span></div>
          <details className="review-source"><summary>Read the source again</summary><Source part={part} />
            {part.followup && <div className="review-followup"><h4>Follow-up text</h4><p>{part.followup.replace(/\{\{(\d+)\}\}/g, '[$1]')}</p></div>}
          </details>
          {visible.map(item => <ReviewItem key={item.index} part={part} item={item} />)}
        </section>
      })}
    </section>
  </Shell>
}

function ReviewItem({ part, item }: { part: Part; item: ReturnType<typeof markAttempt>['parts'][number]['items'][number] }) {
  const { question, index, selected, correct } = item
  const options = optionsFor(part, question)
  return <details className="review-item">
    <summary><span className={'verdict ' + (correct ? 'right' : selected === null ? 'skipped' : 'wrong')}>{selected === null ? '–' : <Icon name={correct ? 'check' : 'x'} size={15} />}</span>
      <strong className="review-q-number">Q{index + 1}</strong><span className="review-prompt">{promptFor(part, index).replace(/\{\{(\d+)\}\}/g, '[$1]')}</span>
      <span className="review-status">{correct ? 'Correct' : selected === null ? 'Unanswered' : 'Incorrect'}</span></summary>
    <div className="review-detail"><p><strong>Your answer</strong> {selected === null ? 'Skipped' : options[selected]}</p><p><strong>Correct answer</strong> {options[question.answer]}</p>
      <p>{question.explanation}</p><div className="evidence"><strong>From the source</strong>{question.evidence.map((quote, i) => <blockquote key={i}>{quote}</blockquote>)}</div>
      <span className="badge">{SKILLS[question.skill]}</span></div>
  </details>
}

const COACH_STEPS = [
  { stage: 'reviewing', label: 'Review your answers', active: 'Comparing answers, skills, and timing' },
  { stage: 'drafting', label: 'Write your coaching notes', active: 'Looking for patterns and building drills' },
  { stage: 'saving', label: 'Save your feedback', active: 'Saving to your attempt' },
] as const

function Coach({ attempt, enabled }: { attempt: Attempt; enabled: boolean }) {
  const [feedback, setFeedback] = useState<Coaching | undefined>(attempt.coach)
  const [busy, setBusy] = useState(enabled && !attempt.coach)
  const [error, setError] = useState('')
  const [stage, setStage] = useState<CoachStage | null>(null)
  const started = useRef(false)

  async function fetchFeedback() {
    setBusy(true)
    setError('')
    setStage(null)
    try {
      const response = await requestCoaching({ data: attempt.id })
      setFeedback(await readJob<CoachStage, Coaching>(response, setStage))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.')
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (enabled && !attempt.coach && !started.current) {
      started.current = true
      void fetchFeedback()
    }
  }, [enabled, attempt.id])

  const current = COACH_STEPS.findIndex(step => step.stage === stage)
  return <div id="coach">
    {feedback ? <>
      <p>{feedback.summary}</p>
      {(feedback.patterns || feedback.gaps || feedback.priority) && <div className="coach-insights">
        {([
          ['Patterns in your answers', feedback.patterns],
          ['Clues to look for', feedback.gaps],
          ['What to work on first', feedback.priority],
        ] as const).map(([title, copy]) => copy && <div key={title}><h3>{title}</h3><p>{copy}</p></div>)}
      </div>}
      <h3 className="coach-practice">Try this in your next practice</h3>
      <ol className="coach-actions">{feedback.actions.map((action, i) => <li key={i}><strong>{action.title}</strong><span>{action.advice}</span></li>)}</ol>
    </>
      : busy ? <JobProgress title="Preparing your feedback" detail="You can review your answers below while the coach works."
        steps={COACH_STEPS.map((step, i) => ({
          label: step.label, status: i < current ? 'Done' : i === current ? step.active : 'Queued', done: i < current,
        }))} />
      : enabled ? <><p role="alert">{error}</p><button className="button secondary" onClick={() => void fetchFeedback()}>Retry AI feedback</button></>
      : <p>A signed-in Codex CLI enables personalised coaching. The answer review is available below.</p>}
  </div>
}
