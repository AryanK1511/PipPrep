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
import type { RoomKind, RoomRoundView, RoomScore, RoomScope } from '../lib/rooms'
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
  const sequence = useRef(0)
  const mutating = useRef(false)
  const navigate = Route.useNavigate()
  const { code, room } = data
  const round = room?.rounds[0]
  const own = room?.members.find(member => member.self)
  const invite = `${data.inviteOrigin}/rooms/${code}`
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
      if (!disposed) timer = setTimeout(poll, 2000)
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
    <div className="section-heading"><div><p className="eyebrow">{room?.isHost ? 'You are hosting' : 'Practice together'}</p><h1>Room <span className="room-code">{code}</span></h1><p>{data.closed ? 'This room is closed. Saved comparisons are still available to members.' : 'Same test. Separate attempts. Learn from each other.'}</p></div><Link to="/rooms" className="button secondary">All rooms</Link></div>
    {!connected && <p className="inline-error" role="status">Connection lost. Reconnecting to the host… Timed tests keep running.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {!room ? <section className="card setup-card"><h2>{data.closed ? 'Room closed' : 'Join this room'}</h2>{!data.closed && <><p>Your display name, test status, scores, and time per section will be visible to the room. Your writing and individual answers stay private. AI feedback uses the host’s selected provider.</p><form className="room-form" onSubmit={join}><label htmlFor="member-name">Your display name</label><input id="member-name" name="name" autoComplete="nickname" maxLength={32} required autoFocus /><button className="button dark" disabled={busy}>Join room</button></form></>}</section> : <>
      {!room.closed && <section className="card room-invite"><div><h2>Invite a friend</h2><p>Share this link. On this host, friends can also enter <strong>{code}</strong> under Study rooms.</p><label className="sr-only" htmlFor="share-invite">Invite link</label><input id="share-invite" readOnly value={invite} onFocus={event => event.currentTarget.select()} /></div><button className="button secondary" onClick={() => void copyInvite()}>{copied ? 'Link copied' : 'Copy invite link'}</button></section>}
      <div className="room-grid room-lobby">
        <section className="card"><h2>In the room <span className="badge">{room.members.length} / 12</span></h2><ul className="room-members">{room.members.map(member => {
          const entry = round?.participants.find(person => person.name === member.name)
          const status = round?.state === 'running' && entry ? entry.status === 'working' ? `${round.kind === 'writing' ? 'Writing' : 'Reading'} · ${entry.section || 'In progress'}` : entry.status === 'withdrawn' ? 'Left test' : 'Submitted' : round?.state === 'ready' ? member.ready ? 'Ready' : 'Not ready' : 'In lobby'
          return <li key={member.name}><span className="room-avatar" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}{member.self ? ' (you)' : ''}</strong><small>{member.host ? 'Host · ' : ''}{status}</small></div>{room.isHost && !member.host && !room.closed && round?.state !== 'running' && <button className="button quiet" disabled={busy} aria-label={`Remove ${member.name}`} onClick={() => void run(() => leaveStudyRoom({ data: { code, removeName: member.name } }))}>Remove</button>}</li>
        })}</ul></section>
        <section className="card room-current"><p className="eyebrow">Current test</p>{!round ? <><h2>Waiting for a test</h2><p>{room.isHost ? 'Choose a test below. Everyone will get the same questions or writing prompts.' : 'The host will choose a shared test for everyone.'}</p></> : <>
          <h2>{roomTestLabel(round.kind, round.scope)}</h2><p>{round.title} · {round.timed ? 'Timed' : 'Untimed'} · {round.source === 'starter' ? 'Starter' : 'Generated'}</p>
          {round.state === 'preparing' && <JobProgress title="Preparing the shared test" detail="Generation continues if you leave this page. Timers have not started." steps={round.progress.length ? round.progress.map((status, index) => ({ label: `Progress ${index + 1}`, status })) : [{ label: 'Shared test', status: 'Starting' }]} />}
          {round.state === 'failed' && <><p className="inline-error" role="alert">{round.error}</p>{room.isHost && !room.closed && <button className="button secondary" disabled={busy} onClick={() => void run(() => prepareRoomTest({ data: { code, kind: round.kind, scope: round.scope, timed: round.timed, source: round.source, difficulty: round.difficulty } }))}>Retry shared test</button>}</>}
          {round.state === 'ready' && !room.closed && <><p>Get ready when you can start. Everyone’s timer begins when the host starts the test.</p><div className="room-actions"><button className={own?.ready ? 'button secondary' : 'button dark'} disabled={busy} onClick={() => void run(() => readyForRoomTest({ data: { code, roundId: round.id, ready: !own?.ready } }))}>{own?.ready ? 'Not ready yet' : 'I’m ready'}</button>{room.isHost && <button className="button dark" disabled={busy || room.members.length < 2 || room.members.some(member => !member.ready)} onClick={() => void run(() => startRoomTest({ data: { code, roundId: round.id } }))}>Start for everyone</button>}</div>{room.members.length < 2 && <p className="room-note">Invite at least one friend to start.</p>}</>}
          {round.state === 'running' && <><p role="status">{round.participants.filter(person => person.status !== 'working').length} of {round.participants.length} finished. Scores appear here when everyone finishes.</p>{round.myAttemptId && <AttemptLink round={round} />}{room.isHost && <button className="button quiet danger" disabled={busy} onClick={() => setConfirm('end')}>End this test for everyone</button>}</>}
          {round.state === 'complete' && <><p role="status">Everyone has finished. Your comparison is below.</p>{round.myAttemptId && <AttemptLink round={round} />}</>}
        </>}</section>
      </div>
      {round?.state === 'complete' && <Comparison round={round} />}
      {room.isHost && !room.closed && !['running', 'preparing'].includes(round?.state || '') && <details className="card room-setup" open={!round || round.state === 'failed'}><summary>{round?.state === 'ready' ? 'Change the shared test' : 'Choose the next test'}</summary><TestSetup busy={busy} prepare={settings => run(() => prepareRoomTest({ data: { ...settings, code } }))} /></details>}
      {room.rounds.filter(previous => previous.id !== round?.id && previous.state === 'complete').map(previous => <details className="card room-history" key={previous.id}><summary>{roomTestLabel(previous.kind, previous.scope)} · {previous.startedAt ? new Date(previous.startedAt).toLocaleString('en-CA', { timeZone: 'America/Toronto' }) : ''}</summary><Comparison round={previous} /></details>)}
      <div className="dialog-actions">{room.isHost && !room.closed ? <button className="button quiet danger" disabled={busy} onClick={() => setConfirm('close')}>Close room</button> : !room.isHost && round?.state !== 'running' && <button className="button quiet" disabled={busy} onClick={() => void run(async () => { await leaveStudyRoom({ data: { code } }); await navigate({ to: '/rooms' }) })}>Leave room</button>}</div>
    </>}
    {confirm && <Confirm title={confirm === 'end' ? 'End this test for everyone?' : 'Close this room?'} text={confirm === 'end' ? 'Unfinished attempts will be submitted with their last saved answers and marked as stopped. Everyone can compare results.' : 'New people cannot join and no more tests can start. Any running attempts will be submitted with their last saved work.'} onClose={() => setConfirm(null)}><button className="button dark" disabled={busy} onClick={() => { const action = confirm; setConfirm(null); void run(() => action === 'end' && round ? endRoomTest({ data: { code, roundId: round.id } }) : closeStudyRoom({ data: code })) }}>{confirm === 'end' ? 'End test' : 'Close room'}</button></Confirm>}
  </Shell>
}

function TestSetup({ busy, prepare }: { busy: boolean; prepare: (settings: { kind: RoomKind; scope: RoomScope; source: 'starter' | 'generated'; timed: boolean; difficulty: 'standard' | 'challenge' }) => Promise<void> }) {
  const { settings, busy: providerBusy } = useAiProvider()
  const ai = settings?.enabled && settings.providers[settings.selected] === 'online'
  const [kind, setKind] = useState<RoomKind>('reading')
  const [section, setSection] = useState(0)
  const [source, setSource] = useState<'starter' | 'generated'>('starter')
  const [timed, setTimed] = useState(true)
  const [difficulty, setDifficulty] = useState(0)
  return <form onSubmit={event => { event.preventDefault(); void prepare({ kind, scope: section === 0 ? 'all' : (section - 1) as RoomScope, source, timed, difficulty: difficulty ? 'challenge' : 'standard' }) }}>
    <fieldset disabled={busy || providerBusy}><legend>Choose a skill</legend><div className="room-actions"><label className="choice"><input type="radio" name="room-kind" checked={kind === 'reading'} onChange={() => { setKind('reading'); setSection(0) }} /><span>Reading</span></label><label className="choice"><input type="radio" name="room-kind" checked={kind === 'writing'} onChange={() => { setKind('writing'); setSection(0) }} /><span>Writing</span></label></div></fieldset>
    <div className="room-field"><label htmlFor="room-section">Test sections</label><Dropdown id="room-section" label="Test sections" options={kind === 'reading' ? ['Full Reading mock · 38 questions', ...PARTS.map((part, index) => `Part ${index + 1} · ${part.name}`)] : ['Full Writing mock · 2 tasks', ...WRITING_TASKS.map((task, index) => `Task ${index + 1} · ${task.name}`)]} value={section} onChange={setSection} disabled={busy} /></div>
    <fieldset disabled={busy || providerBusy}><legend>Choose material</legend><label className="choice"><input type="radio" name="room-source" checked={source === 'starter'} onChange={() => setSource('starter')} /><span><strong>Starter test</strong><small>Ready immediately. Everyone gets the same material.</small></span></label><label className="choice"><input type="radio" name="room-source" disabled={!ai} checked={source === 'generated'} onChange={() => setSource('generated')} /><span><strong>Generate a fresh test</strong><small>{ai ? `Generate once with the host’s ${PROVIDER_LABELS[settings!.selected]} for the whole room.` : 'Select a signed-in CLI on the host to generate material.'}</small></span></label></fieldset>
    {source === 'generated' && kind === 'reading' && <div className="room-field"><label htmlFor="room-difficulty">Difficulty</label><Dropdown id="room-difficulty" label="Difficulty" options={['Standard', 'Challenge']} value={difficulty} onChange={setDifficulty} disabled={busy} /></div>}
    <fieldset disabled={busy}><legend>Choose a mode</legend><label className="choice"><input type="radio" name="room-mode" checked={timed} onChange={() => setTimed(true)} /><span><strong>Timed</strong><small>Start together. Each section has its own deadline.</small></span></label><label className="choice"><input type="radio" name="room-mode" checked={!timed} onChange={() => setTimed(false)} /><span><strong>Untimed</strong><small>Work at your own pace and compare when everyone finishes.</small></span></label></fieldset>
    <p className="room-note">Writing estimates use the host’s selected CLI and are practice feedback. Without AI, responses and word counts are saved, but no level is estimated.</p>
    <button className="button dark" disabled={busy || providerBusy || (source === 'generated' && !ai)}>{busy ? 'Preparing…' : source === 'generated' ? 'Generate shared test' : 'Prepare shared test'}</button>
  </form>
}
function AttemptLink({ round }: { round: RoomRoundView }) {
  const finished = round.participants.find(person => person.self)?.status !== 'working'
  const id = round.myAttemptId!
  return round.kind === 'reading' ? <Link className="button dark" to={finished ? '/results/$id' : '/attempt/$id'} params={{ id }}>{finished ? 'Review my test' : 'Open my test'}</Link> : <Link className="button dark" to={finished ? '/writing/results/$id' : '/writing/attempt/$id'} params={{ id }}>{finished ? 'Review my writing' : 'Open my test'}</Link>
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
  return <section className="room-comparison" aria-label="Score comparison"><div className="section-heading"><div><p className="eyebrow">Finished together</p><h2>Compare scores</h2><p>{round.title}</p></div></div><div className="card room-table-wrap"><table className="room-table"><caption className="sr-only">{roomTestLabel(round.kind, round.scope)} results</caption><thead><tr><th scope="col">Participant</th><th scope="col">{round.kind === 'reading' ? 'Raw score' : 'AI practice estimate'}</th>{columns.map(part => <th scope="col" key={part.label}>{part.label}</th>)}<th scope="col">Total time</th></tr></thead><tbody>{round.participants.map(person => <tr key={person.name}><th scope="row">{person.name}{person.self ? ' (you)' : ''}<small>{person.status === 'withdrawn' ? 'Stopped early' : 'Submitted'}</small></th><td><strong>{scoreLabel(person.result)}</strong>{round.kind === 'writing' && !person.result?.assessed && <small>Open your review to request feedback.</small>}</td>{columns.map((part, index) => <td key={part.label}>{scoreLabel(person.result?.parts[index] || null)}<small>{duration(person.result?.parts[index]?.elapsed || 0)}</small></td>)}<td>{duration(person.result?.elapsed || 0)}</td></tr>)}</tbody></table></div>{round.kind === 'writing' && <p className="room-note">AI estimates are uncertain practice feedback. Scores update here when assessments finish. Responses remain private.</p>}</section>
}
