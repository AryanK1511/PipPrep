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
  const working = round?.participants.filter(person => person.status === 'working') || []
  return <aside className="room-status" aria-label="Room progress">
    <div><strong>Room {room.code}</strong><span role="status">{!connected ? 'Reconnecting to room…' : round?.state === 'complete' ? 'Everyone has finished. Compare your results.' : working.length ? `${working.map(person => person.self ? 'You' : person.name).join(', ')} ${working.length === 1 && !working[0].self ? 'is' : 'are'} still taking the test.` : 'Checking room progress…'}</span></div>
    {onReturn ? <button className="button secondary" onClick={onReturn}>Back to room</button> : <Link to="/rooms/$code" params={{ code: room.code }} className="button secondary">Back to room</Link>}
  </aside>
}
