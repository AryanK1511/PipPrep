import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Shell } from '../components/Shell'
import { Confirm } from '../components/Confirm'
import { Dropdown } from '../components/Dropdown'
import { JobProgress } from '../components/JobProgress'
import { useAiProvider } from '../components/AiProvider'
import { PARTS } from '../lib/reading'
import { PROVIDER_LABELS } from '../lib/providers'
import { WRITING_TASKS } from '../lib/writing'
import { roomTestLabel } from '../lib/rooms'
import type { RoomKind, RoomRoundView, RoomScore, RoomScope, RoomTestSettings } from '../lib/rooms'
import { closeStudyRoom, endRoomTest, joinStudyRoom, leaveStudyRoom, prepareRoomTest, readStudyRoom, readyForRoomTest, startRoomTest } from '../server/room-actions'

export const Route = createFileRoute('/rooms/$code')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: async ({ params }) => {
    if (!/^[A-Z2-9]{8}$/i.test(params.code)) throw notFound()
    return readStudyRoom({ data: params.code })
  },
  component: () => { const data = Route.useLoaderData(); return <Room key={data.code} initial={data} /> },
  errorComponent: () => <Shell title="Room unavailable"><h1>Room unavailable</h1><p>Check the code and make sure you opened the host’s PipPrep. If your friend is using ngrok, open their full invite link.</p><Link to="/rooms" className="button secondary">Back to rooms</Link></Shell>,
})
type PageData = Awaited<ReturnType<typeof readStudyRoom>>
function Room({ initial }: { initial: PageData }) {
  const [data, setData] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(true)
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState<'end' | 'close' | null>(null)
  const [removeName, setRemoveName] = useState<string | null>(null)
  const sequence = useRef(0)
  const mutating = useRef(false)
  const navigate = Route.useNavigate()
  const { code, room } = data
  const round = room?.rounds[0]
  const own = room?.members.find(member => member.self)
  const invite = `${data.inviteOrigin}/rooms/${code}`
  const localInvite = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(invite).hostname)
  const previousRound = useRef(initial.room?.rounds[0])
  const waiting = room?.members.filter(member => !member.ready) || []
  const stage = round?.state === 'complete' ? 3 : round?.state === 'running' ? 2 : round?.state === 'ready' ? 1 : 0
  const canSetUp = room?.isHost && !room.closed && !['running', 'preparing'].includes(round?.state || '')
  useEffect(() => {
    const previous = previousRound.current
    previousRound.current = round
    // Only enter on a live start transition. Returning to the lobby must stay possible.
    if (previous?.id !== round?.id || previous?.state === 'running' || round?.state !== 'running' || !round.myAttemptId) return
    if (!round.participants.some(person => person.self && person.status === 'working')) return
    void navigate({ to: round.kind === 'reading' ? '/attempt/$id' : '/writing/attempt/$id', params: { id: round.myAttemptId } })
      .catch(() => setError('Your test has started. Use Resume my test below to open it.'))
  }, [round, navigate])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 3000)
    return () => clearTimeout(timer)
  }, [copied])
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      if (mutating.current) { timer = setTimeout(poll, 1500); return }
      const version = ++sequence.current
      try {
        const latest = await readStudyRoom({ data: code })
        if (!disposed && version === sequence.current) { setData(latest); setConnected(true) }
      } catch { if (!disposed && version === sequence.current) setConnected(false) }
      if (!disposed) timer = setTimeout(poll, 1000)
    }
    function resume() { clearTimeout(timer); void poll() }
    void poll()
    window.addEventListener('online', resume)
    return () => { disposed = true; sequence.current++; clearTimeout(timer); window.removeEventListener('online', resume) }
  }, [code])
  async function run(work: () => Promise<unknown>) {
    if (mutating.current) return
    mutating.current = true; sequence.current++; setBusy(true); setError('')
    try {
      await work()
      setData(await readStudyRoom({ data: code })); setConnected(true)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update the room. Please retry.') }
    finally { mutating.current = false; setBusy(false) }
  }
  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') || '')
    void run(() => joinStudyRoom({ data: { code, name } }))
  }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(invite); setCopied(true) }
    catch { setError('Copy the invite link from the field below.') }
  }
  return <Shell title="Study room">
    <div className="section-heading"><div><h1>Room <span className="room-code">{code}</span></h1><p>{data.closed ? 'Room closed. Your saved results are still available here.' : `${room?.isHost ? 'You’re hosting. ' : ''}One room, the same test for everyone. Stay together for the next test.`}</p></div><Link to="/rooms" className="button secondary">All rooms</Link></div>
    {!connected && <p className="inline-error" role="status">Connection lost. Reconnecting… Timed tests keep running.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {!room ? <section className="card setup-card"><h2>{data.closed ? 'Room closed' : 'Join this room'}</h2>{!data.closed && <><p>Choose a name so your friends can recognize you. The host chooses the test, then everyone gets ready before it starts.</p><form className="room-form" onSubmit={join}><label htmlFor="member-name">Your display name</label><input id="member-name" name="name" autoComplete="nickname" maxLength={32} required autoFocus /><button className="button dark" disabled={busy}>{busy ? 'Joining…' : 'Join room'}</button></form><p className="room-note">Your name, scores, progress, and section times are visible to the room. Your writing and individual answers stay private. AI feedback uses the host’s selected provider.</p></>}</section> : <>
      {!room.closed && <ol className="room-steps" aria-label="Room progress">{['Choose a test', 'Get ready', 'Practice', 'Compare'].map((label, index) => <li key={label} aria-current={stage === index ? 'step' : undefined} className={index < stage ? 'done' : ''}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>}
      <div className="room-layout">
        <div className="room-main">
          <section className="card room-current" aria-labelledby="current-test-heading">
            <h2 id="current-test-heading">{room.closed && round?.state !== 'complete' ? 'Room closed' : !round ? room.isHost && !room.closed ? 'Choose your first test' : 'Waiting for the host to choose a test' : round.state === 'preparing' ? 'Preparing your test' : round.state === 'ready' ? 'Get ready to start' : round.state === 'running' ? 'Test in progress' : round.state === 'failed' ? 'The test couldn’t be prepared' : round.participants.some(person => person.status === 'withdrawn') ? 'Test ended' : 'Test complete'}</h2>
            {!round ? <><p>{room.closed ? 'You can view earlier results below. Create another room to practice again.' : room.isHost ? 'Choose what to practice. Preparing a test does not start the timer.' : 'You’re in. The host will choose Reading or Writing, then you can mark yourself ready.'}</p>{canSetUp && <TestSetup busy={busy} prepare={settings => run(() => prepareRoomTest({ data: { ...settings, code } }))} />}</> : <>
              <p className="room-test-summary"><strong>{roomTestLabel(round.kind, round.scope)}</strong> · {round.timed ? 'Timed' : 'Untimed'} · {round.source === 'starter' ? 'Starter material' : 'Freshly generated'}{round.source === 'generated' && round.kind === 'reading' ? ` · ${round.difficulty === 'challenge' ? 'Challenge' : 'Standard'}` : ''}</p>
              <p className="room-note">{round.title}</p>
              {round.state === 'preparing' && <JobProgress title="Preparing the shared test" detail="Everyone will see the test here when it’s ready. You can leave and return; timers have not started." steps={round.progress.length ? round.progress.map((status, index) => ({ label: `Progress ${index + 1}`, status })) : [{ label: 'Shared test', status: 'Starting' }]} />}
              {round.state === 'failed' && <><p className="inline-error" role="alert">{round.error}</p>{room.isHost && !room.closed ? <button className="button dark" disabled={busy} onClick={() => void run(() => prepareRoomTest({ data: { code, kind: round.kind, scope: round.scope, timed: round.timed, source: round.source, difficulty: round.difficulty } }))}>Retry shared test</button> : <p>The host can retry or choose another test.</p>}</>}
              {round.state === 'ready' && !room.closed && <>
                <div className="room-ready-status" role="status"><strong>{room.members.length - waiting.length} of {room.members.length} ready</strong><p>{!own?.ready ? 'Review the settings above, then mark yourself ready.' : room.members.length < 2 ? 'You’re ready. Invite a friend before starting.' : waiting.length ? `You’re ready. Waiting for ${waiting.map(member => member.self ? 'you' : member.name).join(', ')}.` : room.isHost ? 'Everyone is ready. Start the test when you’re ready to begin.' : 'You’re ready. Waiting for the host to start.'}</p></div>
                <p className="room-note">{round.timed ? 'Everyone’s timer starts when the host starts the test.' : 'Work at your own pace after the host starts.'} Your test will open automatically. Keep this page open.</p>
                <div className="room-actions"><button className={own?.ready ? 'button secondary' : 'button dark'} disabled={busy} onClick={() => void run(() => readyForRoomTest({ data: { code, roundId: round.id, ready: !own?.ready } }))}>{own?.ready ? 'Cancel ready' : 'I’m ready'}</button>{room.isHost && <button className={own?.ready ? 'button dark' : 'button secondary'} disabled={busy || !connected || room.members.length < 2 || waiting.length > 0} aria-describedby="start-reason" onClick={() => void run(() => startRoomTest({ data: { code, roundId: round.id } }))}>Start for everyone</button>}</div>
                {room.isHost && <p id="start-reason" className="room-note">{room.members.length < 2 ? 'Invite at least one friend to start.' : waiting.length ? `Start unlocks when ${waiting.map(member => member.self ? 'you' : member.name).join(', ')} ${waiting.length === 1 && !waiting[0].self ? 'is' : 'are'} ready.` : 'Starting opens the test for everyone.'}</p>}
              </>}
              {round.state === 'running' && <><p role="status">{round.participants.filter(person => person.status !== 'working').length} of {round.participants.length} finished. Scores appear here when everyone finishes.</p>{round.myAttemptId && <AttemptLink round={round} />}{round.participants.some(person => person.self && person.status !== 'working') && <p className="room-note">Your work is submitted. You can review it while you wait for your friends.</p>}{room.isHost && <details className="room-test-controls"><summary>Host controls</summary><p>End the test if someone cannot finish. Their last saved work will be submitted.</p><button className="button quiet danger" disabled={busy} onClick={() => setConfirm('end')}>End this test for everyone</button></details>}</>}
              {round.state === 'complete' && <><p role="status">{round.participants.some(person => person.status === 'withdrawn') ? 'The test has ended. Compare everyone’s saved work below.' : 'Everyone has finished. Compare your scores below.'}</p>{round.myAttemptId && <AttemptLink round={round} />}{!room.isHost && !room.closed && <p className="room-note">Stay in this room. The host can prepare another test after you compare results.</p>}</>}
            </>}
          </section>
          {round?.state === 'complete' && <Comparison round={round} />}
          {canSetUp && round && <section className="card room-next">
            {round.state === 'complete' && <><h2>Practice again</h2><p>Keep everyone in this room. Choose the same settings or set up a different test.</p><button className="button dark" disabled={busy} onClick={() => void run(() => prepareRoomTest({ data: { code, kind: round.kind, scope: round.scope, timed: round.timed, source: round.source, difficulty: round.difficulty } }))}>Play again</button><p className="room-note">{round.source === 'generated' ? 'Generates fresh material with the same settings.' : 'Uses the same starter material with new attempts.'} Everyone will mark themselves ready again.</p></>}
            <details key={round.id} className="room-setup" open={round.state === 'failed'}><summary>{round.state === 'ready' ? 'Change test settings' : 'Choose a different test'}</summary>{round.state === 'ready' && <p className="room-note">Preparing a replacement resets everyone’s ready status.</p>}<TestSetup initial={round} busy={busy} prepare={settings => run(() => prepareRoomTest({ data: { ...settings, code } }))} /></details>
          </section>}
        </div>
        <aside className="room-sidebar" aria-label="People and invitations">
          <section className="card room-people"><h2>In the room <span className="badge">{room.members.length} / 12</span></h2><p className="room-note" role="status">{room.closed ? 'This room is closed.' : round?.state === 'ready' ? `${room.members.length - waiting.length} of ${room.members.length} ready.` : `${room.members.length} ${room.members.length === 1 ? 'person' : 'people'} in the room.`}</p><ul className="room-members">{room.members.map(member => {
            const entry = round?.participants.find(person => person.name === member.name)
            const status = round?.state === 'running' && entry ? entry.status === 'working' ? `${round.kind === 'writing' ? 'Writing' : 'Reading'} · ${entry.section || 'In progress'}` : entry.status === 'withdrawn' ? 'Stopped early' : 'Submitted' : round?.state === 'ready' ? member.ready ? 'Ready' : 'Not ready' : round?.state === 'complete' ? entry?.status === 'withdrawn' ? 'Stopped early' : entry ? 'Submitted' : 'In lobby' : 'In lobby'
            return <li key={member.name}><span className="room-avatar" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}{member.self ? ' (you)' : ''}</strong><small>{member.host ? 'Host · ' : ''}{status}</small></div>{room.isHost && !member.host && !room.closed && round?.state !== 'running' && <button className="button quiet" disabled={busy} aria-label={`Remove ${member.name}`} onClick={() => setRemoveName(member.name)}>Remove</button>}</li>
          })}</ul></section>
          {!room.closed && <details key={room.members.length < 2 ? 'invite' : 'together'} className="card room-share" open={room.members.length < 2}><summary>Invite friends</summary><p>Share this link. Friends choose a display name when they join.</p><label htmlFor="share-invite">Invite link</label><input id="share-invite" readOnly value={invite} onFocus={event => event.currentTarget.select()} /><button className="button secondary" onClick={() => void copyInvite()}>Copy invite link</button><span className="room-copy-status" role="status">{copied ? 'Link copied' : ''}</span>{localInvite && <p className="room-note">This link only works on this computer. To invite friends on other devices, <Link to="/rooms" hash="hosting-help">set up a shareable link</Link> first.</p>}</details>}
          <details className="room-manage"><summary>{room.isHost ? 'Manage room' : 'Room membership'}</summary><p className="room-note">{room.isHost ? room.closed ? 'Saved comparisons remain available.' : 'Use All rooms to come back later. Close this room only when your group is done.' : round?.state === 'running' ? 'Wait for this test to finish before leaving the room.' : 'Leaving removes you from the room. You can rejoin with the invite link.'}</p>{room.isHost && !room.closed ? <button className="button quiet danger" disabled={busy} onClick={() => setConfirm('close')}>Close room</button> : !room.isHost && round?.state !== 'running' && <button className="button quiet" disabled={busy} onClick={() => void run(async () => { await leaveStudyRoom({ data: { code } }); await navigate({ to: '/rooms' }) })}>Leave room</button>}</details>
        </aside>
      </div>
      {room.rounds.some(previous => previous.id !== round?.id && previous.state === 'complete') && <section className="room-past"><h2>Previous tests</h2>{room.rounds.filter(previous => previous.id !== round?.id && previous.state === 'complete').map(previous => <details className="card room-history" key={previous.id}><summary>{roomTestLabel(previous.kind, previous.scope)} · {previous.startedAt ? new Date(previous.startedAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' }) : ''}</summary><Comparison round={previous} /></details>)}</section>}
    </>}
    {removeName && <Confirm title={`Remove ${removeName}?`} text="They will need the invite link to rejoin. Their completed test results will stay saved." onClose={() => setRemoveName(null)}><button className="button dark" disabled={busy} onClick={() => { const name = removeName; setRemoveName(null); void run(() => leaveStudyRoom({ data: { code, removeName: name } })) }}>Remove from room</button></Confirm>}
    {confirm && <Confirm title={confirm === 'end' ? 'End this test for everyone?' : 'Close this room?'} text={confirm === 'end' ? 'Unfinished attempts will be submitted with their last saved answers and marked as stopped. Everyone can compare results.' : 'New people cannot join and no more tests can start. Any running attempts will be submitted with their last saved work.'} onClose={() => setConfirm(null)}><button className="button dark" disabled={busy} onClick={() => { const action = confirm; setConfirm(null); void run(() => action === 'end' && round ? endRoomTest({ data: { code, roundId: round.id } }) : closeStudyRoom({ data: code })) }}>{confirm === 'end' ? 'End test' : 'Close room'}</button></Confirm>}
  </Shell>
}

function TestSetup({ initial, busy, prepare }: { initial?: RoomTestSettings; busy: boolean; prepare: (settings: RoomTestSettings) => Promise<void> }) {
  const { settings, busy: providerBusy } = useAiProvider()
  const ai = settings?.enabled && settings.providers[settings.selected] === 'online'
  const [kind, setKind] = useState<RoomKind>(initial?.kind ?? 'reading')
  const [section, setSection] = useState(initial && initial.scope !== 'all' ? initial.scope + 1 : 0)
  const [source, setSource] = useState<'starter' | 'generated'>(initial?.source ?? 'starter')
  const [timed, setTimed] = useState(initial?.timed ?? true)
  const [difficulty, setDifficulty] = useState(initial?.difficulty === 'challenge' ? 1 : 0)
  return <form onSubmit={event => { event.preventDefault(); void prepare({ kind, scope: section === 0 ? 'all' : (section - 1) as RoomScope, source, timed, difficulty: difficulty ? 'challenge' : 'standard' }) }}>
    <fieldset disabled={busy}><legend>Choose a skill</legend><div className="room-actions"><label className="choice"><input type="radio" name="room-kind" checked={kind === 'reading'} onChange={() => { setKind('reading'); setSection(0) }} /><span>Reading</span></label><label className="choice"><input type="radio" name="room-kind" checked={kind === 'writing'} onChange={() => { setKind('writing'); setSection(0) }} /><span>Writing</span></label></div></fieldset>
    <div className="room-field"><label htmlFor="room-section">Test sections</label><Dropdown id="room-section" label="Test sections" options={kind === 'reading' ? ['Full Reading mock · 38 questions', ...PARTS.map((part, index) => `Part ${index + 1} · ${part.name}`)] : ['Full Writing mock · 2 tasks', ...WRITING_TASKS.map((task, index) => `Task ${index + 1} · ${task.name}`)]} value={section} onChange={setSection} disabled={busy} /></div>
    <fieldset disabled={busy || providerBusy}><legend>Choose material</legend><label className="choice"><input type="radio" name="room-source" checked={source === 'starter'} onChange={() => setSource('starter')} /><span><strong>Starter test</strong><small>Ready immediately. Repeating it reuses the same questions or prompts.</small></span></label><label className="choice"><input type="radio" name="room-source" disabled={!ai} checked={source === 'generated'} onChange={() => setSource('generated')} /><span><strong>Generate a fresh test</strong><small>{ai ? `New material for everyone, prepared with ${PROVIDER_LABELS[settings!.selected]}.` : 'Requires an available AI provider. Check the sidebar to enable generation.'}</small></span></label></fieldset>
    {source === 'generated' && kind === 'reading' && <div className="room-field"><label htmlFor="room-difficulty">Difficulty</label><Dropdown id="room-difficulty" label="Difficulty" options={['Standard', 'Challenge']} value={difficulty} onChange={setDifficulty} disabled={busy} /></div>}
    <fieldset disabled={busy}><legend>Choose a mode</legend><label className="choice"><input type="radio" name="room-mode" checked={timed} onChange={() => setTimed(true)} /><span><strong>Timed</strong><small>Start together. Each section has its own deadline.</small></span></label><label className="choice"><input type="radio" name="room-mode" checked={!timed} onChange={() => setTimed(false)} /><span><strong>Untimed</strong><small>Work at your own pace and compare when everyone finishes.</small></span></label></fieldset>
    <p className="room-note">{kind === 'writing' ? 'Writing feedback uses the host’s AI provider. Without AI, responses and word counts are saved without a level estimate. ' : ''}Everyone reviews the settings and marks themselves ready before the host starts.</p>
    <button className="button dark" disabled={busy || providerBusy || (source === 'generated' && !ai)}>{busy ? 'Preparing…' : source === 'generated' ? 'Generate shared test' : 'Prepare shared test'}</button>
  </form>
}
function AttemptLink({ round }: { round: RoomRoundView }) {
  const finished = round.participants.find(person => person.self)?.status !== 'working'
  const id = round.myAttemptId!
  return round.kind === 'reading' ? <Link className={finished ? 'button secondary' : 'button dark'} to={finished ? '/results/$id' : '/attempt/$id'} params={{ id }}>{finished ? 'Review my test' : 'Resume my test'}</Link> : <Link className={finished ? 'button secondary' : 'button dark'} to={finished ? '/writing/results/$id' : '/writing/attempt/$id'} params={{ id }}>{finished ? 'Review my writing' : 'Resume my test'}</Link>
}
const duration = (ms: number) => `${Math.floor(ms / 60_000)}m ${Math.floor(ms % 60_000 / 1000)}s`
function scoreLabel(result: Pick<RoomScore, 'score' | 'total' | 'estimate'> | null) {
  if (!result) return '—'
  if (result.total !== null) return `${result.score} / ${result.total}`
  if (!result.estimate) return 'No estimate'
  return `${result.estimate.low === result.estimate.high ? result.estimate.low : `${result.estimate.low}–${result.estimate.high}`} / 12`
}
function Comparison({ round }: { round: RoomRoundView }) {
  const columns = round.participants.find(person => person.result)?.result?.parts || []
  return <section className="room-comparison" aria-label="Score comparison"><div className="section-heading"><div><h2>Compare scores</h2><p>{round.title}</p></div></div><div className="card room-table-wrap"><table className="room-table"><caption className="sr-only">{roomTestLabel(round.kind, round.scope)} results</caption><thead><tr><th scope="col">Participant</th><th scope="col">{round.kind === 'reading' ? 'Raw score' : 'AI practice estimate'}</th>{columns.map(part => <th scope="col" key={part.label}>{part.label}</th>)}<th scope="col">Total time</th></tr></thead><tbody>{round.participants.map(person => <tr key={person.name}><th scope="row">{person.name}{person.self ? ' (you)' : ''}<small>{person.status === 'withdrawn' ? 'Stopped early' : 'Submitted'}</small></th><td><strong>{scoreLabel(person.result)}</strong>{round.kind === 'writing' && !person.result?.assessed && <small>{person.self ? 'Open your review to request feedback.' : 'No feedback available yet.'}</small>}</td>{columns.map((part, index) => <td key={part.label}>{scoreLabel(person.result?.parts[index] || null)}<small>{duration(person.result?.parts[index]?.elapsed || 0)}</small></td>)}<td>{duration(person.result?.elapsed || 0)}</td></tr>)}</tbody></table></div>{round.kind === 'writing' && <p className="room-note">AI estimates are uncertain practice feedback. Scores update here when assessments finish. Responses remain private.</p>}</section>
}
