import { randomUUID } from 'node:crypto'
import { db, transaction } from './store.server.ts'
import { writingStarter } from './writing-starter.ts'
import { advanceWriting, catchUpWriting, MAX_RESPONSE_LENGTH, startWriting } from '../lib/writing.ts'
import type { ActiveWritingAttempt, WritingAttempt, WritingExam, WritingFeedback, WritingScope } from '../lib/writing.ts'

type Row = { state: string; feedback: string | null }
function unpack(row: Row): WritingAttempt {
  const attempt = JSON.parse(row.state)
  return row.feedback ? { ...attempt, feedback: JSON.parse(row.feedback) } : attempt
}
function get(owner: string, id: string) {
  const row = db().prepare('SELECT state, feedback FROM writing_attempts WHERE owner = ? AND id = ?').get(owner, id) as Row | undefined
  return row ? unpack(row) : null
}
function persist(owner: string, attempt: WritingAttempt) {
  db().prepare('UPDATE writing_attempts SET state = ?, finished_at = ? WHERE owner = ? AND id = ?')
    .run(JSON.stringify(attempt), attempt.finishedAt ?? null, owner, attempt.id)
}
function refresh(owner: string, attempt: WritingAttempt, now = Date.now()) {
  const current = catchUpWriting(attempt, now)
  if (current !== attempt) persist(owner, current)
  return current
}
function active(owner: string) {
  const row = db().prepare('SELECT state, feedback FROM writing_attempts WHERE owner = ? AND finished_at IS NULL').get(owner) as Row | undefined
  if (!row) return null
  const attempt = refresh(owner, unpack(row))
  return attempt.finishedAt === undefined ? attempt : null
}
export function writingDashboard(owner?: string) {
  if (!owner) return { active: null, entries: [] }
  return transaction(() => {
    const current = active(owner)
    const entries = (db().prepare('SELECT state, feedback FROM writing_attempts WHERE owner = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC, id').all(owner) as Row[])
      .map(row => { const attempt = unpack(row); return { id: attempt.id, title: attempt.exam.title, timed: attempt.timed, finishedAt: attempt.finishedAt!, estimate: attempt.feedback?.estimate ?? null, reviewed: !!attempt.feedback, taskCount: attempt.exam.tasks.length } })
    return { active: current ? { id: current.id, title: current.exam.title } : null, entries }
  })
}
export function saveWritingExam(owner: string, exam: WritingExam) {
  db().prepare('INSERT INTO writing_exams (id, owner, payload, created_at) VALUES (?, ?, ?, ?)').run(exam.id, owner, JSON.stringify(exam), Date.now())
}
export function getWritingExam(owner: string, id: string): WritingExam | null {
  const row = db().prepare('SELECT payload FROM writing_exams WHERE owner = ? AND id = ?').get(owner, id)
  return row ? JSON.parse(String(row.payload)) : null
}
export function recentWritingTitles(owner: string) {
  return db().prepare('SELECT payload FROM writing_exams WHERE owner = ? ORDER BY created_at DESC LIMIT 12').all(owner)
    .flatMap(row => (JSON.parse(String(row.payload)) as WritingExam).tasks.map(task => task.title))
}
export function beginWriting(owner: string, scope: WritingScope, timed: boolean, examId?: string) {
  return transaction(() => {
    const current = active(owner)
    if (current) return current.id
    const tasks = scope === 'all' ? writingStarter.tasks : [writingStarter.tasks[scope]]
    const exam = examId ? getWritingExam(owner, examId) : { ...writingStarter, tasks, title: tasks.length === 1 ? tasks[0].title : writingStarter.title }
    if (!exam) return null
    const attempt = startWriting(exam, timed, Date.now(), randomUUID())
    db().prepare('INSERT INTO writing_attempts (id, owner, state, started_at) VALUES (?, ?, ?, ?)').run(attempt.id, owner, JSON.stringify(attempt), attempt.startedAt)
    return attempt.id
  })
}
function view(attempt: WritingAttempt, now: number, conflict = false) {
  if (attempt.finishedAt !== undefined) return { finished: true as const, id: attempt.id }
  const { exam, feedback: _feedback, ...state } = attempt
  const projected: ActiveWritingAttempt = { ...state, title: exam.title, task: exam.tasks[attempt.position], taskIndices: exam.tasks.map(task => task.index) }
  return { finished: false as const, attempt: projected, serverNow: now, conflict }
}
export function getWritingAttempt(owner: string, id: string) {
  return transaction(() => {
    const attempt = get(owner, id)
    const now = Date.now()
    return attempt ? view(refresh(owner, attempt, now), now) : null
  })
}
export function updateWriting(owner: string, id: string, position: number, revision: number, action: 'save' | 'next' | 'sync', response?: string) {
  return transaction(() => {
    const attempt = get(owner, id)
    if (!attempt) return null
    const now = Date.now()
    let current = refresh(owner, attempt, now)
    if (current.finishedAt === undefined && action !== 'sync') {
      if (current.position !== position || current.revision !== revision) return view(current, now, true)
      if (typeof response !== 'string' || response.length > MAX_RESPONSE_LENGTH) throw new Error('Invalid writing response')
      const index = current.exam.tasks[current.position].index
      current = { ...current, responses: { ...current.responses, [index]: response }, revision: current.revision + 1 }
      if (action === 'next') current = advanceWriting(current, now)
      persist(owner, current)
    }
    return view(current, now)
  })
}
export function writingResult(owner: string, id: string) {
  return transaction(() => {
    const attempt = get(owner, id)
    const current = attempt && refresh(owner, attempt)
    return current?.finishedAt !== undefined ? current : null
  })
}
export function saveWritingFeedback(owner: string, id: string, feedback: WritingFeedback) {
  db().prepare('UPDATE writing_attempts SET feedback = ? WHERE owner = ? AND id = ? AND finished_at IS NOT NULL AND feedback IS NULL').run(JSON.stringify(feedback), owner, id)
}
export function deleteWriting(owner: string, id: string) {
  db().prepare('DELETE FROM writing_attempts WHERE owner = ? AND id = ?').run(owner, id)
}
