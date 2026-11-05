import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { advance, applyAnswer, catchUp, markAttempt, startAttempt } from '../lib/reading.ts'
import type { ActiveAttempt, Attempt, Choice, Coaching, Exam, PartIndex } from '../lib/types.ts'
import { starter } from './starter.ts'

type AttemptRow = { id: string; state: string; coach: string | null }
let connection: DatabaseSync | undefined

export function db() {
  if (connection) return connection
  const file = resolve(process.env.READLINE_DB || 'data/readline.sqlite')
  mkdirSync(dirname(file), { recursive: true })
  const database = new DatabaseSync(file)
  try {
    database.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;')
    database.exec('BEGIN IMMEDIATE')
    const version = database.prepare('PRAGMA user_version').get()?.user_version
    if (version === 0) {
      database.exec(`
        CREATE TABLE exams (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at INTEGER NOT NULL
        ) STRICT;
        CREATE INDEX exams_owner ON exams(owner, created_at DESC);
        CREATE TABLE attempts (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          state TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          finished_at INTEGER,
          coach TEXT
        ) STRICT;
        CREATE INDEX attempts_owner ON attempts(owner, finished_at, started_at DESC);
        CREATE UNIQUE INDEX one_active_attempt ON attempts(owner) WHERE finished_at IS NULL;
        PRAGMA user_version = 1;
      `)
    } else if (version !== 1 && version !== 2) {
      throw new Error('Unsupported Readline database schema')
    }
    if (version === 0 || version === 1) {
      database.exec(`
        CREATE TABLE writing_exams (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL
        ) STRICT;
        CREATE INDEX writing_exams_owner ON writing_exams(owner, created_at DESC);
        CREATE TABLE writing_attempts (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, state TEXT NOT NULL,
          started_at INTEGER NOT NULL, finished_at INTEGER, feedback TEXT
        ) STRICT;
        CREATE INDEX writing_attempts_owner ON writing_attempts(owner, finished_at, started_at DESC);
        CREATE UNIQUE INDEX one_active_writing_attempt ON writing_attempts(owner) WHERE finished_at IS NULL;
        PRAGMA user_version = 2;
      `)
    }
    database.exec('COMMIT')
    connection = database
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

export function transaction<T>(work: () => T): T {
  const database = db()
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function unpack(row: AttemptRow): Attempt {
  const state: Attempt = JSON.parse(row.state)
  return row.coach ? { ...state, coach: JSON.parse(row.coach) } : state
}

function persist(owner: string, attempt: Attempt) {
  db().prepare('UPDATE attempts SET state = ?, finished_at = ? WHERE owner = ? AND id = ?')
    .run(JSON.stringify(attempt), attempt.finishedAt ?? null, owner, attempt.id)
}

function get(owner: string, id: string): Attempt | null {
  const row = db().prepare('SELECT id, state, coach FROM attempts WHERE owner = ? AND id = ?').get(owner, id) as AttemptRow | undefined
  return row ? unpack(row) : null
}

function refresh(owner: string, attempt: Attempt, now = Date.now()) {
  const current = catchUp(attempt, now)
  if (current !== attempt) persist(owner, current)
  return current
}

function currentAttempt(owner: string) {
  const row = db().prepare('SELECT id, state, coach FROM attempts WHERE owner = ? AND finished_at IS NULL').get(owner) as AttemptRow | undefined
  if (!row) return null
  const attempt = refresh(owner, unpack(row))
  return attempt.finishedAt ? null : attempt
}

export function dashboard(owner: string | undefined) {
  if (!owner) return { active: null, entries: [], best: null }
  return transaction(() => {
    const active = currentAttempt(owner)
    const entries = (db().prepare('SELECT id, state, coach FROM attempts WHERE owner = ? AND finished_at IS NOT NULL ORDER BY finished_at DESC, id')
      .all(owner) as AttemptRow[]).map(row => {
      const attempt = unpack(row)
      const { score, total } = markAttempt(attempt)
      return { id: attempt.id, title: attempt.exam.title, timed: attempt.timed, finishedAt: attempt.finishedAt!, score, total, origin: attempt.exam.origin }
    })
    const scores = entries.filter(entry => entry.total === 38).map(entry => entry.score)
    return { active: active ? { id: active.id, title: active.exam.title } : null, entries, best: scores.length ? Math.max(...scores) : null }
  })
}

export function saveExam(owner: string, exam: Exam) {
  db().prepare('INSERT INTO exams (id, owner, payload, created_at) VALUES (?, ?, ?, ?)').run(exam.id, owner, JSON.stringify(exam), Date.now())
}

export function getExam(owner: string, id: string): Exam | null {
  const row = db().prepare('SELECT payload FROM exams WHERE owner = ? AND id = ?').get(owner, id)
  return row ? JSON.parse(String(row.payload)) : null
}

export function recentTitles(owner: string, part: PartIndex) {
  const rows = db().prepare('SELECT payload FROM exams WHERE owner = ? ORDER BY created_at DESC LIMIT 12').all(owner)
  return [...new Set(rows.flatMap(row => (JSON.parse(String(row.payload)) as Exam).parts.filter(item => item.index === part).map(item => item.title)))]
}

export function begin(owner: string, part: PartIndex | 'all', timed: boolean, examId?: string) {
  return transaction(() => {
    const active = currentAttempt(owner)
    if (active) return active.id
    const parts = part === 'all' ? starter.parts : [starter.parts[part]]
    const exam = examId ? getExam(owner, examId) : { ...starter, title: parts.length === 1 ? parts[0].title : starter.title, parts }
    if (!exam) return null
    const attempt = startAttempt(exam, timed, Date.now(), randomUUID())
    db().prepare('INSERT INTO attempts (id, owner, state, started_at) VALUES (?, ?, ?, ?)').run(attempt.id, owner, JSON.stringify(attempt), attempt.startedAt)
    return attempt.id
  })
}

export function project(attempt: Attempt): ActiveAttempt {
  const part = attempt.exam.parts[attempt.position]
  return {
    id: attempt.id, title: attempt.exam.title, timed: attempt.timed,
    startedAt: attempt.startedAt, position: attempt.position, answers: attempt.answers,
    elapsed: attempt.elapsed, partStartedAt: attempt.partStartedAt, deadline: attempt.deadline,
    partIndices: attempt.exam.parts.map(item => item.index),
    part: { ...part, questions: part.questions.map(({ prompt, options }) => ({ prompt, options })) },
  }
}

export function getAttempt(owner: string, id: string) {
  return transaction(() => {
    const attempt = get(owner, id)
    if (!attempt) return null
    const current = refresh(owner, attempt)
    return current.finishedAt ? { finished: true as const, id } : { finished: false as const, attempt: project(current), serverNow: Date.now() }
  })
}

export function updateAttempt(owner: string, id: string, position: number, action: 'answer' | 'next' | 'sync', question?: number, choice?: Choice) {
  return transaction(() => {
    const attempt = get(owner, id)
    if (!attempt) return null
    const now = Date.now()
    let current = refresh(owner, attempt, now)
    if (!current.finishedAt && current.position === position) {
      const next = action === 'next' ? advance(current, now)
        : action === 'answer' && question !== undefined && choice !== undefined ? applyAnswer(current, question, choice, now) : current
      if (next !== current) persist(owner, next)
      current = next
    }
    return current.finishedAt ? { finished: true as const, id } : { finished: false as const, attempt: project(current), serverNow: now }
  })
}

export function result(owner: string, id: string) {
  const attempt = get(owner, id)
  return attempt?.finishedAt ? attempt : null
}

export function saveCoaching(owner: string, id: string, feedback: Coaching) {
  db().prepare('UPDATE attempts SET coach = ? WHERE id = ? AND owner = ? AND finished_at IS NOT NULL AND coach IS NULL')
    .run(JSON.stringify(feedback), id, owner)
}

export function deleteAttempt(owner: string, id: string) {
  db().prepare('DELETE FROM attempts WHERE id = ? AND owner = ?').run(id, owner)
}
