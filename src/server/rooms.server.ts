import { randomBytes, randomUUID } from 'node:crypto'
import { db, transaction, insertSharedAttempt, sharedAttempt } from './store.server.ts'
import { insertSharedWriting, sharedWritingAttempt } from './writing-store.server.ts'
import { listJobs } from './jobs.server.ts'
import { markAttempt, PARTS } from '../lib/reading.ts'
import { WRITING_TASKS } from '../lib/writing.ts'
import { roomTestLabel } from '../lib/rooms.ts'
import type { RoomKind, RoomRoundView, RoomScore, RoomTestSettings, RoomView } from '../lib/rooms.ts'
import type { Attempt, Exam } from '../lib/types.ts'
import type { WritingAttempt, WritingExam } from '../lib/writing.ts'
import type { AiProvider } from '../lib/providers.ts'

type Room = { code: string; host: string; closed: number }
type Member = { owner: string; name: string; ready: number }
type Round = RoomTestSettings & {
  id: string; code: string; title: string; state: RoomRoundView['state']; exam: Exam | WritingExam | null
  startedAt: number | null; provider: AiProvider; jobId: string | null; error: string | null
}
type Entrant = { owner: string; name: string; attempt_id: string; withdrawn: number }
let initialized = false
function database() {
  const connection = db()
  if (!initialized) {
    connection.exec(`
      CREATE TABLE IF NOT EXISTS study_rooms (
        code TEXT PRIMARY KEY, host TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS room_members (
        code TEXT NOT NULL, owner TEXT NOT NULL, name TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (code, owner), UNIQUE (code, name COLLATE NOCASE)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS room_members_owner ON room_members(owner);
      CREATE TABLE IF NOT EXISTS room_rounds (
        id TEXT PRIMARY KEY, code TEXT NOT NULL, payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS room_rounds_code ON room_rounds(code);
      CREATE TABLE IF NOT EXISTS room_entrants (
        round_id TEXT NOT NULL, owner TEXT NOT NULL, name TEXT NOT NULL, attempt_id TEXT NOT NULL UNIQUE,
        withdrawn INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (round_id, owner)
      ) STRICT;
    `)
    initialized = true
  }
  return connection
}
function room(code: string): Room {
  const value = database().prepare('SELECT code, host, closed FROM study_rooms WHERE code = ?').get(code) as Room | undefined
  if (!value) throw new Error('Room not found on this host. Open your friend’s invite link to join their PipPrep.')
  return value
}
function members(code: string) {
  return database().prepare('SELECT owner, name, ready FROM room_members WHERE code = ? ORDER BY rowid').all(code) as Member[]
}
function requireMember(owner: string, code: string) {
  const value = room(code)
  if (!members(code).some(member => member.owner === owner)) throw new Error('Join this room first.')
  return value
}
export function requireRoomHost(owner: string, code: string) {
  const value = requireMember(owner, code)
  if (value.host !== owner) throw new Error('Only the room host can do that.')
  if (value.closed) throw new Error('This room is closed.')
  return value
}
function rounds(code: string): Round[] {
  return database().prepare('SELECT payload FROM room_rounds WHERE code = ? ORDER BY rowid DESC').all(code).map(row => JSON.parse(String(row.payload)))
}
function saveRound(round: Round) {
  database().prepare('UPDATE room_rounds SET payload = ? WHERE id = ?').run(JSON.stringify(round), round.id)
}
function entrants(round: Round) {
  return database().prepare('SELECT owner, name, attempt_id, withdrawn FROM room_entrants WHERE round_id = ? ORDER BY rowid').all(round.id) as Entrant[]
}
function attempt(round: Round, entrant: Entrant, stop = false) {
  return round.kind === 'reading' ? sharedAttempt(entrant.owner, entrant.attempt_id, stop) : sharedWritingAttempt(entrant.owner, entrant.attempt_id, stop)
}
function refreshRound(round: Round) {
  if (round.state === 'preparing' && round.jobId) {
    const job = listJobs(room(round.code).host).find(item => item.id === round.jobId)
    if (!job || job.state === 'failed') {
      round.state = 'failed'; round.error = job?.error || 'Generation was interrupted. The host can prepare another test.'; saveRound(round)
    }
  }
  if (round.state === 'running' && entrants(round).every(entrant => attempt(round, entrant)?.finishedAt !== undefined)) {
    round.state = 'complete'; saveRound(round)
  }
  return round
}
function latest(code: string) {
  const value = rounds(code)[0]
  return value ? refreshRound(value) : null
}
export function createRoom(owner: string, name: string) {
  database()
  return transaction(() => {
    const active = database().prepare('SELECT count(*) AS count FROM study_rooms WHERE host = ? AND closed = 0').get(owner)!
    if (Number(active.count) >= 5) throw new Error('Close one of your existing rooms before creating another.')
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code: string
    do { code = [...randomBytes(8)].map(value => alphabet[value % alphabet.length]).join('') }
    while (database().prepare('SELECT code FROM study_rooms WHERE code = ?').get(code))
    database().prepare('INSERT INTO study_rooms (code, host, created_at) VALUES (?, ?, ?)').run(code, owner, Date.now())
    database().prepare('INSERT INTO room_members (code, owner, name) VALUES (?, ?, ?)').run(code, owner, name)
    return code
  })
}
export function joinRoom(owner: string, code: string, name: string) {
  database()
  transaction(() => {
    const value = room(code)
    const people = members(code)
    if (people.some(member => member.owner === owner)) return
    if (value.closed) throw new Error('This room is closed.')
    if (latest(code)?.state === 'running') throw new Error('A test is in progress. Join after this round finishes.')
    if (people.length >= 12) throw new Error('This room is full. Up to 12 people can join.')
    if (people.some(member => member.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is already in the room. Choose a different name.')
    database().prepare('INSERT INTO room_members (code, owner, name) VALUES (?, ?, ?)').run(code, owner, name)
  })
}
export function listRooms(owner?: string) {
  if (!owner) return []
  return database().prepare(`SELECT r.code, r.closed, r.host FROM study_rooms r JOIN room_members m ON m.code = r.code WHERE m.owner = ? ORDER BY r.created_at DESC LIMIT 30`).all(owner)
    .map(row => ({ code: String(row.code), closed: !!row.closed, isHost: row.host === owner, count: members(String(row.code)).length }))
}
export function previewRoom(code: string) {
  const value = room(code)
  return { code, closed: !!value.closed }
}
export function prepareRound(owner: string, code: string, settings: RoomTestSettings, provider: AiProvider, exam: Exam | WritingExam | null) {
  database()
  return transaction(() => {
    requireRoomHost(owner, code)
    const current = latest(code)
    if (current && ['running', 'preparing'].includes(current.state)) throw new Error('Finish the current test before preparing another.')
    const value: Round = { ...settings, id: randomUUID(), code, title: exam?.title || roomTestLabel(settings.kind, settings.scope), state: exam ? 'ready' : 'preparing', exam, startedAt: null, provider, jobId: null, error: null }
    database().prepare('INSERT INTO room_rounds (id, code, payload) VALUES (?, ?, ?)').run(value.id, code, JSON.stringify(value))
    database().prepare('UPDATE room_members SET ready = 0 WHERE code = ?').run(code)
    return value.id
  })
}
export function attachRoomJob(owner: string, code: string, roundId: string, jobId: string) {
  requireRoomHost(owner, code)
  const current = rounds(code).find(round => round.id === roundId)!
  current.jobId = jobId; saveRound(current)
}
export function finishRoomGeneration(code: string, roundId: string, exam: Exam | WritingExam) {
  const current = rounds(code).find(round => round.id === roundId)
  if (!current || current.state !== 'preparing' || room(code).closed) return
  current.exam = exam; current.title = exam.title; current.state = 'ready'; saveRound(current)
}
export function failRoomGeneration(code: string, roundId: string, message: string) {
  const current = rounds(code).find(round => round.id === roundId)
  if (!current || current.state !== 'preparing') return
  current.state = 'failed'; current.error = message; saveRound(current)
}
export function setReady(owner: string, code: string, roundId: string, ready: boolean) {
  database()
  transaction(() => {
    const value = requireMember(owner, code)
    const current = latest(code)
    if (value.closed || current?.state !== 'ready' || current.id !== roundId) throw new Error('The room test changed. Refresh before getting ready.')
    database().prepare('UPDATE room_members SET ready = ? WHERE code = ? AND owner = ?').run(Number(ready), code, owner)
  })
}
export function startRound(owner: string, code: string, roundId: string) {
  database()
  transaction(() => {
    requireRoomHost(owner, code)
    const round = latest(code)
    if (!round || round.id !== roundId || round.state !== 'ready' || !round.exam) throw new Error('Prepare a test first, then refresh the room.')
    const people = members(code)
    if (people.length < 2) throw new Error('Invite at least one friend before starting.')
    if (people.some(member => !member.ready)) throw new Error('Everyone must be ready before starting.')
    const now = Date.now()
    for (const member of people) {
      let id: string
      try {
        id = round.kind === 'reading' ? insertSharedAttempt(member.owner, round.exam as Exam, round.timed, now) : insertSharedWriting(member.owner, round.exam as WritingExam, round.timed, now)
      } catch (error) { throw new Error(`${member.name}: ${error instanceof Error ? error.message : 'Could not start the attempt.'}`) }
      database().prepare('INSERT INTO room_entrants (round_id, owner, name, attempt_id) VALUES (?, ?, ?, ?)').run(round.id, member.owner, member.name, id)
    }
    round.state = 'running'; round.startedAt = now; saveRound(round)
  })
}
export function endRound(owner: string, code: string, roundId: string) {
  database()
  transaction(() => {
    requireRoomHost(owner, code)
    const current = latest(code)
    if (!current || current.id !== roundId || current.state !== 'running') throw new Error('There is no matching running test to end.')
    for (const entrant of entrants(current)) {
      if (attempt(current, entrant)?.finishedAt === undefined) {
        attempt(current, entrant, true)
        database().prepare('UPDATE room_entrants SET withdrawn = 1 WHERE round_id = ? AND owner = ?').run(current.id, entrant.owner)
      }
    }
    current.state = 'complete'; saveRound(current)
  })
}
export function closeRoom(owner: string, code: string) {
  requireRoomHost(owner, code)
  const running = latest(code)
  if (running?.state === 'running') endRound(owner, code, running.id)
  database().prepare('UPDATE study_rooms SET closed = 1 WHERE code = ?').run(code)
  const current = latest(code)
  if (current?.state === 'preparing') failRoomGeneration(code, current.id, 'The host closed this room.')
}
export function leaveRoom(owner: string, code: string, removeName?: string) {
  database()
  transaction(() => {
    const value = requireMember(owner, code)
    if (removeName) requireRoomHost(owner, code)
    const member = removeName ? members(code).find(member => member.name === removeName) : members(code).find(member => member.owner === owner)
    if (!member) return
    if (member.owner === value.host) throw new Error('The host must close the room instead of leaving.')
    if (latest(code)?.state === 'running') throw new Error('Wait for this test to finish before leaving or removing someone.')
    database().prepare('DELETE FROM room_members WHERE code = ? AND owner = ?').run(code, member.owner)
  })
}
export function roomForAttempt(owner: string, id: string) {
  const row = database().prepare('SELECT r.code, r.payload FROM room_rounds r JOIN room_entrants e ON e.round_id = r.id WHERE e.owner = ? AND e.attempt_id = ?').get(owner, id)
  return row ? { code: String(row.code), provider: (JSON.parse(String(row.payload)) as Round).provider } : null
}
export function withdrawAttempt(owner: string, id: string) {
  const link = roomForAttempt(owner, id)
  if (!link) return false
  transaction(() => {
    const round = rounds(link.code).find(round => entrants(round).some(entrant => entrant.attempt_id === id))!
    const entrant = entrants(round).find(entrant => entrant.owner === owner)!
    if (attempt(round, entrant)?.finishedAt !== undefined) throw new Error('Room attempts are kept for the group comparison.')
    attempt(round, entrant, true)
    database().prepare('UPDATE room_entrants SET withdrawn = 1 WHERE attempt_id = ? AND owner = ?').run(id, owner)
    refreshRound(round)
  })
  return true
}
function score(round: Round, value: Attempt | WritingAttempt): RoomScore {
  const elapsed = value.elapsed.reduce((sum, ms) => sum + ms, 0)
  if (round.kind === 'reading') {
    const result = markAttempt(value as Attempt)
    return { score: result.score, total: result.total, estimate: null, assessed: true, elapsed,
      parts: result.parts.map((part, index) => ({ label: `Part ${part.part.index + 1}`, score: part.score, total: part.total, estimate: null, elapsed: value.elapsed[index] || 0 })) }
  }
  const writing = value as WritingAttempt
  const feedback = writing.feedback
  return { score: null, total: null, estimate: (writing.exam.tasks.length === 2 ? feedback?.estimate : feedback?.tasks.find(task => task.index === writing.exam.tasks[0].index)?.estimate) ?? null,
    assessed: !!feedback, elapsed, parts: writing.exam.tasks.map((task, index) => ({ label: WRITING_TASKS[task.index].short, score: null, total: null, estimate: feedback?.tasks.find(item => item.index === task.index)?.estimate ?? null, elapsed: writing.elapsed[index] || 0 })) }
}
export function readRoom(owner: string | undefined, code: string): RoomView | null {
  database()
  if (!owner || !members(code).some(member => member.owner === owner)) return null
  return transaction(() => {
    const value = requireMember(owner, code)
    const people = members(code)
    return { code, closed: !!value.closed, isHost: value.host === owner,
      members: people.map(member => ({ name: member.name, self: member.owner === owner, host: member.owner === value.host, ready: !!member.ready })),
      rounds: rounds(code).slice(0, 20).map(raw => {
        const round = refreshRound(raw)
        const entries = entrants(round)
        const job = round.jobId ? listJobs(value.host).find(job => job.id === round.jobId) : null
        // Only public room metadata and completed scores leave the server. Never
        // send another participant's answers, drafts, owner token, or answer key.
        return { id: round.id, title: round.title, kind: round.kind, scope: round.scope, timed: round.timed, source: round.source, difficulty: round.difficulty,
          state: round.state, startedAt: round.startedAt, provider: round.provider, error: round.error, progress: Object.values(job?.updates || {}),
          myAttemptId: entries.find(entry => entry.owner === owner)?.attempt_id ?? null,
          participants: entries.map(entry => {
            const state = attempt(round, entry)
            const finished = state?.finishedAt !== undefined
            const index = state && !finished ? (round.kind === 'reading' ? (state as Attempt).exam.parts[state.position]?.index : (state as WritingAttempt).exam.tasks[state.position]?.index) : undefined
            return { name: entry.name, self: entry.owner === owner, host: entry.owner === value.host, ready: true,
              status: entry.withdrawn ? 'withdrawn' as const : finished ? 'submitted' as const : 'working' as const,
              section: index === undefined ? null : round.kind === 'reading' ? PARTS[index].short : WRITING_TASKS[index as 0 | 1].short,
              result: round.state === 'complete' && state ? score(round, state) : null }
          }),
        }
      }),
    }
  })
}
