import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [createError, setCreateError] = useState('')
  const [joinError, setJoinError] = useState('')
  const openRooms = rooms.filter(room => !room.closed)
  const closedRooms = rooms.filter(room => room.closed)
  useEffect(() => {
    if (window.location.hash === '#hosting-help') {
      const help = document.getElementById('hosting-help') as HTMLDetailsElement | null
      if (help) help.open = true
    }
  }, [])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('create'); setCreateError('')
    const name = String(new FormData(event.currentTarget).get('name') || '')
    try {
      const code = await createStudyRoom({ data: { name } })
      await navigate({ to: '/rooms/$code', params: { code } })
    } catch (failure) { setCreateError(failure instanceof Error ? failure.message : 'Could not create a room.') }
    finally { setBusy(null) }
  }
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setJoinError('')
    const invite = parseRoomInvite(String(new FormData(event.currentTarget).get('invite') || ''))
    if (!invite) { setJoinError('Enter an eight-character room code or a PipPrep invite link.'); return }
    if (invite.url && new URL(invite.url).origin !== window.location.origin) { window.location.assign(invite.url); return }
    setBusy('join')
    try { await navigate({ to: '/rooms/$code', params: { code: invite.code } }) }
    catch { setJoinError('Could not open the room. Check the invite link and try again.') }
    finally { setBusy(null) }
  }
  return <Shell title="Study rooms">
    <div className="section-heading"><div><h1>Study rooms</h1><p>Practice the same test on your own screens, then compare scores. Keep your room for as many tests as you like.</p></div></div>
    {openRooms.length > 0 && <section className="room-resume"><h2>Your open rooms</h2><div className="room-list">{openRooms.map(room => <Link to="/rooms/$code" params={{ code: room.code }} className="card room-list-item" key={room.code}><div><strong>{room.code}</strong><p>{room.isHost ? 'You’re hosting' : 'You’re a member'} · {room.count} {room.count === 1 ? 'person' : 'people'}</p></div><span>Return to room →</span></Link>)}</div></section>}
    <div className="room-grid">
      <section className="card"><h2>Host a room</h2><p>Create a room, invite friends, then choose a Reading or Writing test. Everyone gets ready before you start.</p>
        <form className="room-form" onSubmit={event => void create(event)}><label htmlFor="host-name">Your display name</label><input id="host-name" name="name" autoComplete="nickname" maxLength={32} required placeholder="Your name" /><button className="button dark" disabled={busy !== null}>{busy === 'create' ? 'Creating…' : 'Create room'}</button>{createError && <p className="inline-error" role="alert">{createError}</p>}</form>
      </section>
      <section className="card"><h2>Join friends</h2><p>Paste your friend’s invite link or enter a room code. You’ll choose your display name next.</p>
        <form className="room-form" onSubmit={event => void join(event)}><label htmlFor="room-invite">Room code or invite link</label><input id="room-invite" name="invite" autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-describedby="room-invite-help" required placeholder="ABCDEFGH or https://…/rooms/ABCDEFGH" /><p id="room-invite-help" className="room-field-help">A code works on the same PipPrep address. If it cannot be found, ask your friend for the full invite link.</p><button className="button secondary" disabled={busy !== null}>{busy === 'join' ? 'Finding room…' : 'Find room'}</button>{joinError && <p className="inline-error" role="alert">{joinError}</p>}</form>
      </section>
    </div>
    <details id="hosting-help" className="card room-help"><summary>Hosting friends on other devices</summary><p>Install ngrok and sign in, then run <code>pnpm host:room</code> in the PipPrep folder. This builds the app, starts a tunnel, and configures your invite links automatically. Open the local address printed in the terminal and create a room.</p><p>Keep this terminal and your computer running during the session. Friends open the invite link in their browsers; they do not need a local installation. The room code works after they reach your host.</p><p>The host’s selected CLI generates tests and assesses writing. Share the tunnel with people you trust.</p></details>
    {closedRooms.length > 0 && <details className="card room-help"><summary>Closed rooms · {closedRooms.length}</summary><p>These rooms are finished. You can still view saved comparisons.</p><div className="room-list">{closedRooms.map(room => <Link to="/rooms/$code" params={{ code: room.code }} className="room-list-item" key={room.code}><strong>{room.code}</strong><span>View results →</span></Link>)}</div></details>}
  </Shell>
}
