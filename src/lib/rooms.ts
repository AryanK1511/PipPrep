import type { AiProvider } from './providers.ts'

export type RoomKind = 'reading' | 'writing'
export type RoomScope = 'all' | 0 | 1 | 2 | 3
export type RoomTestSettings = {
  kind: RoomKind; scope: RoomScope; timed: boolean; source: 'starter' | 'generated'; difficulty: 'standard' | 'challenge'
}
export type RoomScore = {
  score: number | null; total: number | null; estimate: { low: number; high: number } | null
  assessed: boolean; elapsed: number; parts: { label: string; score: number | null; total: number | null; estimate: { low: number; high: number } | null; elapsed: number }[]
}
export type RoomParticipant = {
  name: string; self: boolean; host: boolean; ready: boolean; status: 'waiting' | 'working' | 'submitted' | 'withdrawn'
  section: string | null; result: RoomScore | null
}
export type RoomRoundView = RoomTestSettings & {
  id: string; title: string; state: 'preparing' | 'ready' | 'running' | 'complete' | 'failed'
  startedAt: number | null; provider: AiProvider; error: string | null; progress: string[]
  participants: RoomParticipant[]; myAttemptId: string | null
}
export type RoomView = {
  code: string; closed: boolean; isHost: boolean; members: { name: string; self: boolean; host: boolean; ready: boolean }[]
  rounds: RoomRoundView[]
}

export function roomTestLabel(kind: RoomKind, scope: RoomScope) {
  if (scope === 'all') return kind === 'reading' ? 'Full Reading mock' : 'Full Writing mock'
  return kind === 'reading' ? `Reading · Part ${scope + 1}` : `Writing · ${scope === 0 ? 'Email' : 'Survey response'}`
}

export function parseRoomInvite(value: string): { code: string; url?: string } | null {
  const input = value.trim()
  if (/^[A-Z2-9]{8}$/i.test(input)) return { code: input.toUpperCase() }
  try {
    const url = new URL(input)
    const match = url.pathname.match(/^\/rooms\/([A-Z2-9]{8})\/?$/i)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !match) return null
    return { code: match[1].toUpperCase(), url: `${url.origin}/rooms/${match[1].toUpperCase()}` }
  } catch { return null }
}
