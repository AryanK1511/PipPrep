import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import test from 'node:test'
import * as rooms from '../src/server/rooms.server.ts'
import * as reading from '../src/server/store.server.ts'
import * as writing from '../src/server/writing-store.server.ts'
import { starter } from '../src/server/starter.ts'
import { writingStarter } from '../src/server/writing-starter.ts'
import { parseRoomInvite } from '../src/lib/rooms.ts'
import type { RoomTestSettings } from '../src/lib/rooms.ts'

process.env.READLINE_DB = join(mkdtempSync(join(tmpdir(), 'pipprep-rooms-')), 'test.sqlite')
const settings: RoomTestSettings = { kind: 'reading', scope: 0, timed: false, source: 'starter', difficulty: 'standard' }
function lobby() {
  const host = randomUUID(), guest = randomUUID()
  const code = rooms.createRoom(host, 'Aryan')
  rooms.joinRoom(guest, code, 'Friend')
  return { host, guest, code }
}
function prepare(host: string, code: string, value = settings) {
  const exam = value.kind === 'reading'
    ? { ...starter, parts: value.scope === 'all' ? starter.parts : [starter.parts[value.scope]] }
    : { ...writingStarter, tasks: value.scope === 'all' ? writingStarter.tasks : [writingStarter.tasks[value.scope as 0 | 1]] }
  return rooms.prepareRound(host, code, value, 'claude', exam)
}
function start(host: string, guest: string, code: string, roundId: string) {
  rooms.setReady(host, code, roundId, true); rooms.setReady(guest, code, roundId, true)
  rooms.startRound(host, code, roundId)
  return { hostId: rooms.readRoom(host, code)!.rounds[0].myAttemptId!, guestId: rooms.readRoom(guest, code)!.rounds[0].myAttemptId! }
}
test('room codes and invites resolve safely and membership cannot be read or controlled by strangers', () => {
  const { host, guest, code } = lobby()
  assert.match(code, /^[A-Z2-9]{8}$/)
  assert.deepEqual(parseRoomInvite(code.toLowerCase()), { code })
  assert.deepEqual(parseRoomInvite(`https://example.ngrok.app/rooms/${code}`), { code, url: `https://example.ngrok.app/rooms/${code}` })
  assert.equal(parseRoomInvite('javascript:alert(1)'), null)
  assert.equal(parseRoomInvite(`https://user:password@example.org/rooms/${code}`), null)
  assert.equal(rooms.readRoom(randomUUID(), code), null)
  assert.equal(rooms.listRooms(randomUUID()).length, 0)
  assert.throws(() => rooms.joinRoom(randomUUID(), code, 'friend'), /already/)
  assert.throws(() => rooms.requireRoomHost(guest, code), /host/)
  assert.throws(() => rooms.closeRoom(guest, code), /host/)
  assert.throws(() => rooms.leaveRoom(guest, code, 'Aryan'), /host/)
  assert.ok(rooms.readRoom(host, code)?.isHost)
})
test('everyone starts the identical exam and timestamp, answers are independent, and scores wait for all submissions', () => {
  const { host, guest, code } = lobby()
  const roundId = prepare(host, code)
  assert.throws(() => rooms.startRound(host, code, roundId), /ready/)
  const { hostId, guestId } = start(host, guest, code, roundId)
  assert.notEqual(hostId, guestId)
  const hostAttempt = reading.sharedAttempt(host, hostId)!, guestAttempt = reading.sharedAttempt(guest, guestId)!
  assert.deepEqual(hostAttempt.exam, guestAttempt.exam)
  assert.equal(hostAttempt.startedAt, guestAttempt.startedAt)
  assert.equal(reading.getAttempt(guest, hostId), null)
  reading.updateAttempt(host, hostId, 0, 'answer', 0, starter.parts[0].questions[0].answer)
  reading.updateAttempt(host, hostId, 0, 'next')
  const waiting = rooms.readRoom(host, code)!.rounds[0]
  assert.equal(waiting.state, 'running')
  assert.deepEqual(waiting.participants.map(person => person.status), ['submitted', 'working'])
  assert.ok(waiting.participants.every(person => person.result === null))
  const publicData = JSON.stringify(rooms.readRoom(guest, code))
  for (const secret of [host, guest, '"answers"', '"responses"', '"explanation"', starter.parts[0].questions[0].explanation]) assert.ok(!publicData.includes(secret))
  reading.updateAttempt(guest, guestId, 0, 'next')
  const complete = rooms.readRoom(host, code)!.rounds[0]
  assert.equal(complete.state, 'complete')
  assert.deepEqual(complete.participants.map(person => person.result?.score), [1, 0])
  assert.deepEqual(complete.participants.map(person => person.result?.total), [11, 11])
  assert.equal(rooms.roomForAttempt(host, hostId)?.provider, 'claude')
  assert.equal(rooms.roomForAttempt(guest, hostId), null)
})
test('starting is atomic when a participant already has a solo attempt and stale ready/start requests are rejected', () => {
  const { host, guest, code } = lobby()
  const old = prepare(host, code)
  const roundId = prepare(host, code)
  assert.throws(() => rooms.setReady(guest, code, old, true), /changed/)
  assert.throws(() => rooms.startRound(host, code, old), /refresh/)
  const solo = reading.begin(guest, 0, false)!
  rooms.setReady(host, code, roundId, true); rooms.setReady(guest, code, roundId, true)
  assert.throws(() => rooms.startRound(host, code, roundId), /Friend.*active Reading/)
  assert.equal(reading.dashboard(host).active, null)
  assert.equal(rooms.readRoom(host, code)?.rounds[0].state, 'ready')
  reading.deleteAttempt(guest, solo)
  rooms.startRound(host, code, roundId)
  assert.equal(rooms.readRoom(host, code)?.rounds[0].state, 'running')
  assert.throws(() => rooms.joinRoom(randomUUID(), code, 'Late arrival'), /in progress/)
})
test('leaving an attempt preserves group results and the host can finish abandoned tests and close a room', () => {
  const { host, guest, code } = lobby()
  const roundId = prepare(host, code, { ...settings, scope: 'all' })
  const { hostId, guestId } = start(host, guest, code, roundId)
  assert.equal(rooms.withdrawAttempt(randomUUID(), guestId), false)
  assert.equal(rooms.withdrawAttempt(guest, guestId), true)
  assert.throws(() => rooms.prepareRound(host, code, settings, 'codex', starter), /current/)
  assert.equal(rooms.readRoom(host, code)!.rounds[0].participants[1].status, 'withdrawn')
  rooms.closeRoom(host, code)
  const view = rooms.readRoom(host, code)!
  assert.equal(view.closed, true)
  assert.equal(view.rounds[0].state, 'complete')
  assert.ok(reading.result(host, hostId))
  assert.equal(reading.dashboard(guest).active, null)
  assert.throws(() => rooms.joinRoom(randomUUID(), code, 'New friend'), /closed/)
  assert.throws(() => prepare(host, code), /closed/)
})
test('Writing mocks and task drills keep private drafts and compare task estimates rather than inventing scores', () => {
  const { host, guest, code } = lobby()
  for (const scope of ['all', 0, 1] as const) {
    const roundId = prepare(host, code, { ...settings, kind: 'writing', scope })
    const { hostId, guestId } = start(host, guest, code, roundId)
    const tasks = scope === 'all' ? [0, 1] : [scope]
    let revision = 0
    for (const [position, _index] of tasks.entries()) {
      writing.updateWriting(host, hostId, position, revision, 'next', 'Host private response')
      writing.updateWriting(guest, guestId, position, revision, 'next', 'Guest private response')
      revision += 2
    }
    const complete = rooms.readRoom(host, code)!.rounds[0]
    assert.equal(complete.state, 'complete')
    assert.equal(complete.participants[0].result?.estimate, null)
    assert.equal(complete.participants[0].result?.parts.length, tasks.length)
    assert.ok(!JSON.stringify(complete).includes('private response'))
    assert.equal(writing.writingResult(host, hostId)?.responses[tasks[0] as 0 | 1], 'Host private response')
  }
})
test('expired shared timers finish absent participants when the lobby is polled', () => {
  const { host, guest, code } = lobby()
  const roundId = prepare(host, code, { ...settings, timed: true })
  const { hostId, guestId } = start(host, guest, code, roundId)
  for (const id of [hostId, guestId]) {
    const row = reading.db().prepare('SELECT state FROM attempts WHERE id = ?').get(id)!
    const value = JSON.parse(String(row.state))
    value.startedAt = value.partStartedAt = Date.now() - 12 * 60_000
    value.deadline = Date.now() - 60_000
    reading.db().prepare('UPDATE attempts SET state = ? WHERE id = ?').run(JSON.stringify(value), id)
  }
  assert.equal(rooms.readRoom(host, code)!.rounds[0].state, 'complete')
  assert.equal(reading.dashboard(guest).active, null)
})
test('only the host can change rounds; readiness resets and old comparisons survive the next test', () => {
  const { host, guest, code } = lobby()
  const first = prepare(host, code)
  start(host, guest, code, first)
  assert.throws(() => rooms.endRound(guest, code, first), /host/)
  rooms.endRound(host, code, first)
  const second = prepare(host, code, { ...settings, kind: 'writing' })
  const view = rooms.readRoom(guest, code)!
  assert.equal(view.rounds[0].id, second)
  assert.ok(view.members.every(member => !member.ready))
  assert.equal(view.rounds[1].state, 'complete')
  rooms.leaveRoom(guest, code)
  assert.equal(rooms.readRoom(guest, code), null)
  assert.equal(rooms.readRoom(host, code)!.members.length, 1)
})

test('rooms and comparisons recover in a new server process, and interrupted generation becomes retryable', () => {
  const { host, guest, code } = lobby()
  const first = prepare(host, code)
  start(host, guest, code, first)
  rooms.endRound(host, code, first)
  const second = rooms.prepareRound(host, code, { ...settings, source: 'generated' }, 'codex', null)
  const job = { id: randomUUID(), owner: host, kind: 'room', target: `${code}:${second}`, mode: 'untimed', state: 'running', startedAt: Date.now(), updates: {} }
  // Initialize the persisted job table through the public job reader.
  rooms.readRoom(host, code)
  reading.db().exec('CREATE TABLE IF NOT EXISTS background_jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0) STRICT')
  reading.db().prepare('INSERT INTO background_jobs (id, owner, payload) VALUES (?, ?, ?)').run(job.id, host, JSON.stringify(job))
  rooms.attachRoomJob(host, code, second, job.id)
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { readRoom } from './src/server/rooms.server.ts';
    console.log(JSON.stringify(readRoom(${JSON.stringify(host)}, ${JSON.stringify(code)})));
  `], { cwd: process.cwd(), env: process.env, encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  const restored = JSON.parse(child.stdout)
  assert.equal(restored.rounds[0].state, 'failed')
  assert.match(restored.rounds[0].error, /restarted/)
  assert.equal(restored.rounds[1].state, 'complete')
  assert.equal(restored.rounds[1].participants.length, 2)
  assert.equal(restored.rounds[1].participants[0].result.total, 11)
  assert.doesNotThrow(() => prepare(host, code))
})

test('a room supports a group, enforces its capacity, and waits for every participant', () => {
  const { host, guest, code } = lobby()
  const people = [host, guest]
  for (let index = 2; index < 12; index++) {
    const owner = randomUUID(); people.push(owner)
    rooms.joinRoom(owner, code, `Friend ${index}`)
  }
  assert.throws(() => rooms.joinRoom(randomUUID(), code, 'Extra friend'), /full/)
  const round = prepare(host, code)
  people.forEach(person => rooms.setReady(person, code, round, true))
  rooms.startRound(host, code, round)
  for (const person of people.slice(0, -1)) {
    const id = rooms.readRoom(person, code)!.rounds[0].myAttemptId!
    reading.updateAttempt(person, id, 0, 'next')
  }
  assert.equal(rooms.readRoom(host, code)!.rounds[0].state, 'running')
  const last = people.at(-1)!
  reading.updateAttempt(last, rooms.readRoom(last, code)!.rounds[0].myAttemptId!, 0, 'next')
  assert.equal(rooms.readRoom(host, code)!.rounds[0].state, 'complete')
})
