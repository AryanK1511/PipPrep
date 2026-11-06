import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Brand } from '../components/Shell'
import { Icon } from '../components/Icon'
import { Confirm } from '../components/Confirm'
import { RoomStatus } from '../components/RoomStatus'
import { WritingPrompt } from '../components/WritingPrompt'
import { MAX_RESPONSE_LENGTH, wordCount, WRITING_TASKS } from '../lib/writing'
import type { ActiveWritingAttempt } from '../lib/writing'
import { readWritingBackup } from '../lib/writing-backup'
import { deleteWritingAttempt, mutateWritingAttempt, readWritingAttempt } from '../server/actions'

export const Route = createFileRoute('/writing/attempt/$id')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: async ({ params }) => {
    if (!z.uuid().safeParse(params.id).success) throw notFound()
    const result = await readWritingAttempt({ data: params.id })
    if (!result) throw notFound()
    if (result.finished) throw redirect({ to: '/writing/results/$id', params })
    return result
  },
  component: () => {
    const initial = Route.useLoaderData()
    return <WritingExam key={initial.attempt.id} initial={initial} />
  },
})
function WritingExam({ initial }: { initial: ActiveResponse }) {
  const [loaded, setLoaded] = useState(initial)
  return <Editor key={loaded.attempt.id + ':' + loaded.attempt.position} initial={loaded.attempt} serverNow={loaded.serverNow} update={setLoaded} roomCode={initial.roomCode} />
}
type ActiveResponse = { finished: false; attempt: ActiveWritingAttempt; serverNow: number; conflict: boolean; roomCode?: string | null }
const remaining = (deadline: number | null, now: number) => deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
const format = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

function Editor({ initial, serverNow, update, roomCode }: { initial: ActiveWritingAttempt; serverNow: number; update: (value: ActiveResponse) => void; roomCode?: string | null }) {
  const navigate = Route.useNavigate()
  const { id, task, position, deadline, taskIndices } = initial
  const [response, setResponse] = useState(initial.responses[task.index] || '')
  const latest = useRef(response)
  const saved = useRef(response)
  const revision = useRef(initial.revision)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const offset = useRef(serverNow - Date.now())
  const [seconds, setSeconds] = useState(remaining(deadline, serverNow))
  const [saving, setSaving] = useState(false)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const blocked = useRef(false)
  const [recovered, setRecovered] = useState('')
  const [backupWarning, setBackupWarning] = useState('')
  const [confirm, setConfirm] = useState<'next' | 'exit' | null>(null)
  const expirySync = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const backupKey = `readline-writing:${id}:${task.index}`
  const last = position === taskIndices.length - 1
  const words = wordCount(response)

  const backup = useCallback(() => {
    try {
      if (latest.current === saved.current) sessionStorage.removeItem(backupKey)
      else sessionStorage.setItem(backupKey, JSON.stringify({ response: latest.current, revision: revision.current }))
    } catch { setBackupWarning('Browser backup is unavailable. Wait for “Saved” before leaving this page.') }
  }, [backupKey])

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    try {
      const raw = readWritingBackup(backupKey)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (typeof draft.response !== 'string' || draft.response.length > MAX_RESPONSE_LENGTH) return
      if (draft.response === saved.current) { sessionStorage.removeItem(backupKey); return }
      if (draft.revision === revision.current) {
        latest.current = draft.response; setResponse(draft.response)
      } else setRecovered(draft.response)
    } catch { setBackupWarning('Could not read the browser backup. Your last server save is shown.') }
  }, [backupKey])

  const perform = useCallback((action: 'save' | 'next' | 'sync'): Promise<boolean> => {
    const operation = async () => {
      if (blocked.current && action !== 'sync') return false
      if (action === 'save' && latest.current === saved.current) return true
      const snapshot = latest.current
      setSaving(true); setError('')
      try {
        const result = await mutateWritingAttempt({ data: { id, position, revision: revision.current, action, response: action === 'sync' ? undefined : snapshot } })
        if (!result) throw new Error('This writing attempt could not be found.')
        if (result.finished) {
          backup()
          await navigate({ to: '/writing/results/$id', params: { id }, replace: true })
          return true
        }
        offset.current = result.serverNow - Date.now()
        if (result.attempt.position !== position) { backup(); update(result); return false }
        if (result.conflict || (action === 'sync' && result.attempt.revision !== revision.current)) {
          blocked.current = true; setConflict(true)
          setError('Another tab saved a different version. Your text is kept here. Copy it before loading the saved response.')
          return false
        }
        revision.current = result.attempt.revision
        if (action !== 'sync') saved.current = snapshot
        backup()
        update(result)
        return true
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Could not save your writing. Please retry.')
        return false
      } finally { setSaving(false) }
    }
    const pending = chain.current.then(operation)
    chain.current = pending
    return pending
  }, [id, position, backup, navigate, update])

  useEffect(() => {
    if (response === saved.current || conflict || moving) return
    const timer = window.setTimeout(() => void perform('save'), 400)
    return () => window.clearTimeout(timer)
  }, [response, conflict, moving, perform])
  useEffect(() => {
    if (deadline === null) return
    function tick() {
      const left = remaining(deadline, Date.now() + offset.current)
      setSeconds(left)
      if (left === 0 && !expirySync.current) { expirySync.current = true; void perform('sync') }
    }
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [deadline, perform])

  async function leave() {
    setMoving(true)
    const ok = await perform('save')
    if (ok) {
      if (roomCode) await navigate({ to: '/rooms/$code', params: { code: roomCode } })
      else await navigate({ to: '/writing' })
    }
    setMoving(false)
  }
  async function discard() {
    setMoving(true)
    await chain.current
    try {
      await deleteWritingAttempt({ data: id })
      try {
        for (const index of taskIndices) sessionStorage.removeItem(`readline-writing:${id}:${index}`)
      } catch { /* A deleted attempt must still close when browser storage is blocked. */ }
      if (roomCode) await navigate({ to: '/rooms/$code', params: { code: roomCode }, replace: true })
      else await navigate({ to: '/writing', replace: true })
    } catch { setError('Could not discard this attempt. Please retry.'); setMoving(false); setConfirm(null) }
  }
  function change(text: string) { latest.current = text; setResponse(text); backup() }
  async function next() {
    setConfirm(null); setMoving(true)
    await perform('next')
    setMoving(false)
  }
  return <div className="exam writing-exam">
    <header className="exam-top"><div className="exam-identity"><Brand /><span className="exam-divider" /><span>Writing practice</span></div>
      <div className="exam-tools"><div className={'timer' + (seconds !== null && seconds <= 60 ? ' low' : '')}><Icon name="clock" size={18} /><span role="timer" aria-label="Time remaining">{seconds === null ? 'Untimed' : format(seconds)}</span></div><button className="button quiet" disabled={moving} onClick={() => setConfirm('exit')}>Exit test</button></div>
    </header>
    <main className="exam-body"><RoomStatus attemptId={id} roomCode={roomCode} active onReturn={() => setConfirm('exit')} /><div className="exam-heading"><div><p className="eyebrow">Task 0{task.index + 1} · about 150–200 words</p><h1 ref={heading} tabIndex={-1}>{WRITING_TASKS[task.index].name}</h1></div>
      <div className="steps" aria-label="Writing progress">{taskIndices.map((index, i) => <span key={index} className={'step ' + (position === i ? 'current' : i < position ? 'finished' : '')} aria-current={position === i ? 'step' : undefined}>{index + 1}</span>)}</div></div>
      {error && <div role="alert" className="inline-error">{error} {conflict ? <button className="button secondary" onClick={() => { backup(); window.location.reload() }}>Load saved response</button> : <button className="button secondary" onClick={() => void perform(seconds === 0 ? 'sync' : 'save')}>Retry save</button>}</div>}
      {backupWarning && <p role="alert" className="inline-error">{backupWarning}</p>}
      {recovered && <details className="recovered-draft"><summary>Unsaved text from an earlier browser draft</summary><p>Compare this text with your saved response before copying any edits back into the editor.</p><textarea aria-label="Recovered browser draft" value={recovered} readOnly /></details>}
      <div className="exam-panes"><section className="pane" aria-labelledby="writing-task-label"><h2 className="pane-label" id="writing-task-label"><Icon name="mail" size={17} />Your task</h2><div className="pane-scroll" role="region" aria-label="Writing prompt" tabIndex={0}><WritingPrompt task={task} /></div></section>
        <section className="pane writing-editor-pane" aria-labelledby="writing-response-label"><label className="pane-label" id="writing-response-label" htmlFor="writing-response"><Icon name="pen" size={17} />Your response</label>
          <textarea id="writing-response" className="writing-editor" lang="en-US" spellCheck autoCapitalize="sentences" autoCorrect="off" autoComplete="off" placeholder={task.index === 0 ? 'Write your email here…' : 'State your choice and explain your reasons…'} value={response} maxLength={MAX_RESPONSE_LENGTH} disabled={moving || seconds === 0} onChange={event => change(event.target.value)} onBlur={() => { if (seconds !== 0) void perform('save') }} aria-describedby="writing-word-count" />
          <div className="editor-meta"><span id="writing-word-count"><strong>{words} words</strong> · target 150–200</span><span role="status" aria-label="Save status">{conflict ? 'Save conflict' : error ? 'Not saved' : saving ? 'Saving…' : response !== saved.current ? 'Unsaved changes' : 'Saved'}</span></div>
        </section></div>
    </main>
    <footer className="exam-foot"><span>Browser spellcheck · {response.length === MAX_RESPONSE_LENGTH ? 'Character limit reached' : 'Plan, write, then proofread'}</span><button className="button dark" disabled={moving || conflict || seconds === 0} onClick={() => setConfirm('next')}>{last ? 'Finish writing' : 'Next task'}<Icon name="arrow" size={17} /></button></footer>
    {confirm === 'next' && <Confirm title={last ? 'Submit your writing?' : 'Move to the survey?'} text={`${words} words. ${last ? 'Your responses will be locked for review.' : 'Your email will be locked. Unused time does not carry over.'}`} onClose={() => setConfirm(null)}><button className="button dark" disabled={moving} onClick={() => void next()}>{last ? 'Submit writing' : 'Continue to next task'}</button></Confirm>}
    {confirm === 'exit' && <Confirm title="Exit to the study room?" text={initial.timed ? 'The clock keeps running while you are away.' : 'Your response will be saved before you leave.'} onClose={() => setConfirm(null)}><button className="button quiet danger" disabled={moving} onClick={() => void discard()}>{roomCode ? 'Leave this test' : 'Discard attempt'}</button><button className="button dark" disabled={moving} onClick={() => void leave()}>Save and exit</button></Confirm>}
  </div>
}
