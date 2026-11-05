import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Shell } from '../components/Shell'
import { parseRoomInvite } from '../lib/rooms'
import { createStudyRoom, readRooms } from '../server/room-actions'

export const Route = createFileRoute('/rooms/')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: () => readRooms(),
  component: Rooms,
})
function Rooms() {
  const { rooms } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const name = String(new FormData(event.currentTarget).get('name') || '')
    try {
      const code = await createStudyRoom({ data: { name } })
      await navigate({ to: '/rooms/$code', params: { code } })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not create a room.') }
    finally { setBusy(false) }
  }
  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    const invite = parseRoomInvite(String(new FormData(event.currentTarget).get('invite') || ''))
    if (!invite) { setError('Enter an eight-character room code or a PipPrep invite link.'); return }
    if (invite.url && new URL(invite.url).origin !== window.location.origin) { window.location.assign(invite.url); return }
    void navigate({ to: '/rooms/$code', params: { code: invite.code } })
  }
  return <Shell title="Study rooms">
    <div className="section-heading"><div><p className="eyebrow">Practice together</p><h1>Study rooms</h1><p>One test, your own screen, and results to compare.</p></div></div>
    <div className="room-grid">
      <section className="card"><h2>Host a room</h2><p>Invite friends to your PipPrep. Choose Reading or Writing, a full mock or a single section.</p>
        <form className="room-form" onSubmit={event => void create(event)}><label htmlFor="host-name">Your display name</label><input id="host-name" name="name" autoComplete="nickname" maxLength={32} required placeholder="Your name" /><button className="button dark" disabled={busy}>{busy ? 'Creating…' : 'Create room'}</button></form>
      </section>
      <section className="card"><h2>Join friends</h2><p>Enter a code on the host’s PipPrep, or paste their invite link to connect to their computer.</p>
        <form className="room-form" onSubmit={join}><label htmlFor="room-invite">Room code or invite link</label><input id="room-invite" name="invite" autoCapitalize="characters" autoCorrect="off" spellCheck={false} required placeholder="ABCDEFGH or https://…/rooms/ABCDEFGH" /><button className="button secondary">Find room</button></form>
      </section>
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <details className="card room-help"><summary>How to invite someone from another computer</summary><p>Install ngrok and sign in, then run <code>pnpm host:room</code> in the PipPrep folder. This builds the app, starts a tunnel, and configures your invite links automatically. Open the local address printed in the terminal and create a room.</p><p>Keep this terminal and your computer running during the session. Friends open the invite link in their browsers; they do not need a local installation. The room code works after they reach your host.</p><p>The host’s selected CLI generates tests and assesses writing. Share the tunnel with people you trust.</p></details>
    {rooms.length > 0 && <section><div className="section-heading"><h2>Your rooms</h2></div><div className="room-list">{rooms.map(room => <Link to="/rooms/$code" params={{ code: room.code }} className="card room-list-item" key={room.code}><div><strong>{room.code}</strong><p>{room.isHost ? 'Hosting' : 'Member'} · {room.count} people · {room.closed ? 'Closed' : 'Open'}</p></div><span>Open room →</span></Link>)}</div></section>}
  </Shell>
}
