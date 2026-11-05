import { createFileRoute, Link, notFound, redirect } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Brand } from '../components/Shell'
import { Icon } from '../components/Icon'
import { ThemeToggle } from '../components/ThemeToggle'
import { Source } from '../components/Source'
import { Dropdown } from '../components/Dropdown'
import { Confirm } from '../components/Confirm'
import { PARTS, blankIndices, optionsFor } from '../lib/reading'
import type { ActiveAttempt, Choice, PartView } from '../lib/types'
import { deleteSavedAttempt, mutateAttempt, readAttempt } from '../server/actions'

export const Route = createFileRoute('/attempt/$id')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: async ({ params }) => {
    if (!z.uuid().safeParse(params.id).success) throw notFound()
    const response = await readAttempt({ data: params.id })
    if (!response) throw notFound()
    if (response.finished) throw redirect({ to: '/results/$id', params })
    return response
  },
  component: () => {
    const loaded = Route.useLoaderData()
    return <Exam key={loaded.attempt.id} initial={loaded} />
  },
})

const format = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
const remaining = (deadline: number | null, now: number) => deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))

function Exam({ initial }: { initial: { attempt: ActiveAttempt; serverNow: number } }) {
  const navigate = Route.useNavigate()
  const [attempt, setAttempt] = useState(initial.attempt)
  const [seconds, setSeconds] = useState(remaining(initial.attempt.deadline, initial.serverNow))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'next' | 'exit' | null>(null)
  const inFlight = useRef(false)
  const clockOffset = useRef(0)
  const lastServerUpdate = useRef(initial.serverNow)
  const heading = useRef<HTMLHeadingElement>(null)
  const { id, position, deadline, part, partIndices } = attempt
  const meta = PARTS[part.index]
  const last = position === partIndices.length - 1
  const answers = attempt.answers[part.index] || {}
  const answered = Object.values(answers).filter(choice => choice !== null).length

  const perform = useCallback(async (action: 'answer' | 'next' | 'sync', question?: number, choice?: Choice) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const response = await mutateAttempt({ data: { id, position, action, question, choice } })
      if (!response) throw new Error('This attempt could not be found.')
      if (response.finished) return await navigate({ to: '/results/$id', params: { id }, replace: true })
      lastServerUpdate.current = response.serverNow
      clockOffset.current = response.serverNow - Date.now()
      setAttempt(response.attempt)
      setSeconds(remaining(response.attempt.deadline, response.serverNow))
      if (response.attempt.position !== position) setConfirm(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save. Please try again.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [id, position, navigate])

  useEffect(() => {
    if (initial.serverNow < lastServerUpdate.current || inFlight.current) return
    lastServerUpdate.current = initial.serverNow
    clockOffset.current = initial.serverNow - Date.now()
    setAttempt(initial.attempt)
    setSeconds(remaining(initial.attempt.deadline, initial.serverNow))
  }, [initial])
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [position])
  useEffect(() => {
    if (deadline === null) return
    function tick() {
      const left = remaining(deadline, Date.now() + clockOffset.current)
      setSeconds(left)
      if (left === 0 && !error) void perform('sync')
    }
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [deadline, error, perform])

  async function discard() {
    try {
      await deleteSavedAttempt({ data: id })
      await navigate({ to: '/', replace: true })
    } catch {
      setConfirm(null)
      setError('Could not discard this attempt. Please try again.')
    }
  }

  return <div className="exam">
    <header className="exam-top"><div className="exam-identity"><Brand /><span className="exam-divider" /><span>Reading mock</span></div>
      <div className="exam-tools"><ThemeToggle /><div className={'timer' + (seconds !== null && seconds <= 60 ? ' low' : '')}><Icon name="clock" size={18} />
        <span role="timer" aria-label="Time remaining">{seconds === null ? 'Untimed' : format(seconds)}</span></div>
        <button className="button quiet" onClick={() => setConfirm('exit')}>Exit test</button></div>
    </header>
    <main className="exam-body">
      <div className="exam-heading"><div><p className="eyebrow">Part 0{part.index + 1} · {meta.count} questions</p><h1 ref={heading} tabIndex={-1}>{meta.name}</h1></div>
        <div className="steps" aria-label="Test progress">{partIndices.map((partIndex, i) => <span key={partIndex} className={'step ' + (i === position ? 'current' : i < position ? 'finished' : '')} aria-current={i === position ? 'step' : undefined}>{i < position ? <Icon name="check" size={15} /> : partIndex + 1}</span>)}</div>
      </div>
      {error && <div role="alert" className="inline-error">{error} {seconds === 0 && <button onClick={() => void perform('sync')}>Retry</button>}</div>}
      <div className="exam-panes" key={position}>
        <section className="pane" aria-labelledby="source-label"><h2 className="pane-label" id="source-label"><Icon name={meta.icon} size={17} />{meta.label}</h2>
          <div className="pane-scroll" role="region" aria-label={meta.label + ' content'} tabIndex={0}><Source part={part} /></div></section>
        <section className="pane" aria-labelledby="questions-label"><h2 className="pane-label" id="questions-label"><Icon name="list" size={17} />Questions</h2>
          <div className="pane-scroll" role="region" aria-label="Answer choices" tabIndex={0}>
            <Questions part={part} answers={answers} disabled={busy || seconds === 0} answer={(index, choice) => void perform('answer', index, choice)} />
          </div></section>
      </div>
    </main>
    <footer className="exam-foot"><span id="answer-count">{answered} of {meta.count} answered</span>
      <button className="button dark" disabled={busy || seconds === 0} onClick={() => setConfirm('next')}><Icon name="arrow" size={17} />{last ? 'Finish test' : 'Next part'}</button></footer>
    {confirm === 'next' && <Confirm title={last ? 'Finish this test?' : 'Move to the next part?'} text={`${meta.count - answered} unanswered. ${last ? 'Submitting opens your answer review.' : 'Moving on locks this part.'}`} onClose={() => setConfirm(null)}>
      <button className="button dark" onClick={() => { setConfirm(null); void perform('next') }}>{last ? 'Submit test' : 'Continue to next part'}</button>
    </Confirm>}
    {confirm === 'exit' && <Confirm title="Exit to the study room?" text={attempt.timed ? 'Your answers are saved and the clock keeps running.' : 'Your answers are saved for when you return.'} onClose={() => setConfirm(null)}>
      <button className="button quiet danger" onClick={() => void discard()}>Discard attempt</button><Link className="button dark" to="/">Exit to Reading</Link>
    </Confirm>}
  </div>
}

function Questions({ part, answers, disabled, answer }: { part: PartView; answers: Record<number, Choice>; disabled: boolean; answer: (index: number, choice: Choice) => void }) {
  const blanks = blankIndices(part.index)
  const select = (index: number) => <Dropdown id={'question-' + index} label={'Question ' + (index + 1)}
    options={['Choose an answer', ...optionsFor(part, part.questions[index])]}
    value={answers[index] == null ? 0 : answers[index] + 1} disabled={disabled}
    onChange={option => answer(index, option === 0 ? null : option - 1)} />
  const questions = part.questions.map((question, index) => blanks.includes(index) ? null : <div className="question" key={index}>
    <label htmlFor={'question-' + index}><span className="question-number">{index + 1}</span><span>{question.prompt}</span></label>{select(index)}
  </div>)
  const followup = part.followup && <section className="followup"><h3>{['Complete the reply', 'Complete the email', '', 'Complete the reader comment'][part.index]}</h3>
    <div className="followup-text">{part.followup.split(/(\{\{\d+\}\})/g).map((token, i) => {
      const match = token.match(/^\{\{(\d+)\}\}$/)
      return match ? <span className="inline-answer" key={i}><span aria-hidden="true">{match[1]}</span>{select(Number(match[1]) - 1)}</span> : token
    })}</div></section>
  return <><p className="questions-intro">{part.index === 2 ? 'For each statement, choose the paragraph that gives the information. Choose E if the full statement is absent.' : 'Use the source to choose the best answer.'}</p>
    {part.index === 1 ? <>{followup}{questions}</> : <>{questions}{followup}</>}</>
}
