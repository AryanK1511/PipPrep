import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { RoomView } from '../lib/rooms'
import { readAttemptRoom } from '../server/room-actions'

export function RoomStatus({ attemptId, roomCode, active = false, onReturn }: { attemptId: string; roomCode?: string | null; active?: boolean; onReturn?: () => void }) {
  const navigate = useNavigate()
  const [room, setRoom] = useState<RoomView | null>(null)
  const [connected, setConnected] = useState(true)
  useEffect(() => {
    if (roomCode === null) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const value = await readAttemptRoom({ data: attemptId })
        if (disposed) return
        setRoom(value); setConnected(true)
        if (!value) return
      } catch { if (!disposed) setConnected(false) }
      if (!disposed) timer = setTimeout(refresh, 2500)
    }
    void refresh()
    return () => { disposed = true; clearTimeout(timer) }
  }, [attemptId, roomCode])
  useEffect(() => {
    const round = room?.rounds.find(round => round.myAttemptId === attemptId)
    if (active && round?.participants.some(person => person.self && person.status !== 'working')) {
      void navigate({ to: round.kind === 'reading' ? '/results/$id' : '/writing/results/$id', params: { id: attemptId }, replace: true })
    }
  }, [active, room, attemptId, navigate])
  if (!room) return null
  const round = room.rounds.find(round => round.myAttemptId === attemptId)
  const next = !room.closed && room.rounds[0]?.id !== round?.id ? room.rounds[0] : null
  const working = round?.participants.filter(person => person.status === 'working') || []
  const ownWorking = round?.participants.some(person => person.self && person.status === 'working')
  const nextStatus = next?.state === 'preparing' ? 'The next test is being prepared. Stay in this room.'
    : next?.state === 'ready' ? 'The next test is ready. Go back to the room to get ready.'
    : next?.state === 'running' ? 'The next test has started. Go back to the room to open your test.'
    : null
  let status = 'Checking room progress…'
  if (!connected) status = 'Reconnecting to room…'
  else if (nextStatus) status = nextStatus
  else if (round?.state === 'complete') {
    status = room.closed ? 'The test has ended. Compare your saved results.'
      : room.isHost ? 'Test finished. Go back to the room to compare results and set up the next test.'
      : 'Test finished. Go back to the room for results and the next test.'
  } else if (ownWorking && active) {
    status = 'Your test is in progress. Returning to the room does not pause a timed test.'
  } else if (working.length) {
    status = `${working.map(person => person.self ? 'You' : person.name).join(', ')} ${working.length === 1 && !working[0].self ? 'is' : 'are'} still taking the test.`
  }
  return <aside className="room-status" aria-label="Room progress">
    <div><strong>Room {room.code}</strong><span role="status">{status}</span></div>
    {onReturn ? <button className="button secondary" onClick={onReturn}>Back to room</button> : <Link to="/rooms/$code" params={{ code: room.code }} className="button secondary">Back to room</Link>}
  </aside>
}
