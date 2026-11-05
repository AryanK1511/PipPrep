import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as reading from '../src/server/store.server.ts'
import * as writing from '../src/server/writing-store.server.ts'
import { writingStarter } from '../src/server/writing-starter.ts'
import type { WritingAttempt } from '../src/lib/writing.ts'

process.env.READLINE_DB = join(mkdtempSync(join(tmpdir(), 'readline-writing-')), 'test.sqlite')
// Begin from the existing v1 schema to exercise the real upgrade path.
const old = new DatabaseSync(process.env.READLINE_DB)
old.exec(`CREATE TABLE exams(id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
CREATE TABLE attempts(id TEXT PRIMARY KEY, owner TEXT NOT NULL, state TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, coach TEXT) STRICT;
CREATE UNIQUE INDEX one_active_attempt ON attempts(owner) WHERE finished_at IS NULL;
PRAGMA user_version = 1;`)
old.close()

test('schema migration preserves Reading records and permits one independent Writing attempt', () => {
  const owner = randomUUID()
  const readId = reading.begin(owner, 0, false)
  const writeId = writing.beginWriting(owner, 'all', false)!
  assert.notEqual(readId, writeId)
  assert.equal(writing.beginWriting(owner, 1, false), writeId)
  assert.ok(reading.getAttempt(owner, readId!))
  assert.equal(reading.db().prepare('PRAGMA user_version').get()?.user_version, 2)
  assert.equal(writing.getWritingAttempt(randomUUID(), writeId), null)
  assert.equal(writing.updateWriting(randomUUID(), writeId, 0, 0, 'save', 'Stolen'), null)
  assert.equal(writing.writingResult(owner, writeId), null)
})
test('draft revisions persist and competing tabs cannot overwrite a newer save', () => {
  const owner = randomUUID()
  const id = writing.beginWriting(owner, 'all', false)!
  const saved = writing.updateWriting(owner, id, 0, 0, 'save', 'First draft')
  assert.ok(saved && !saved.finished)
  assert.equal(saved.attempt.revision, 1)
  const conflict = writing.updateWriting(owner, id, 0, 0, 'save', 'Stale draft')
  assert.ok(conflict && !conflict.finished && conflict.conflict)
  assert.equal(conflict.attempt.responses[0], 'First draft')
  const independent = new DatabaseSync(process.env.READLINE_DB!)
  const row = independent.prepare('SELECT state FROM writing_attempts WHERE id = ?').get(id)
  assert.equal(JSON.parse(String(row?.state)).responses[0], 'First draft')
  independent.close()
  const next = writing.updateWriting(owner, id, 0, 1, 'next', 'Final email')
  assert.ok(next && !next.finished)
  assert.equal(next.attempt.task.index, 1)
  const late = writing.updateWriting(owner, id, 0, next.attempt.revision, 'save', 'Late email')
  assert.ok(late && !late.finished && late.conflict)
  assert.equal(late.attempt.responses[0], 'Final email')
  writing.updateWriting(owner, id, 1, next.attempt.revision, 'next', 'Survey response')
  assert.equal(writing.writingResult(owner, id)?.responses[1], 'Survey response')
  writing.updateWriting(owner, id, 1, next.attempt.revision, 'save', 'Overwrite submission')
  assert.equal(writing.writingResult(owner, id)?.responses[1], 'Survey response')
})
test('timer catch-up locks expired drafts and results and deletion enforce ownership', () => {
  const owner = randomUUID()
  const id = writing.beginWriting(owner, 'all', true)!
  const row = reading.db().prepare('SELECT state FROM writing_attempts WHERE id = ?').get(id)
  const attempt: WritingAttempt = JSON.parse(String(row?.state))
  const ago = Date.now() - 60 * 60_000
  attempt.startedAt = ago; attempt.taskStartedAt = ago; attempt.deadline = ago + 27 * 60_000
  attempt.responses[0] = 'Saved before expiry'
  reading.db().prepare('UPDATE writing_attempts SET state = ? WHERE id = ?').run(JSON.stringify(attempt), id)
  assert.equal(writing.updateWriting(owner, id, 0, 0, 'save', 'Late write')?.finished, true)
  assert.equal(writing.writingResult(owner, id)?.responses[0], 'Saved before expiry')
  assert.deepEqual(writing.writingResult(owner, id)?.elapsed, [27 * 60_000, 26 * 60_000])
  assert.equal(writing.writingResult(randomUUID(), id), null)
  assert.equal(writing.writingDashboard(owner).entries.length, 1)
  writing.deleteWriting(randomUUID(), id)
  assert.ok(writing.writingResult(owner, id))
  writing.deleteWriting(owner, id)
  assert.equal(writing.writingResult(owner, id), null)
})
test('generated prompts stay private and missing or oversized responses cannot erase drafts', () => {
  const owner = randomUUID()
  const exam = { ...writingStarter, id: randomUUID(), origin: 'generated' as const }
  writing.saveWritingExam(owner, exam)
  assert.equal(writing.getWritingExam(randomUUID(), exam.id), null)
  assert.equal(writing.beginWriting(randomUUID(), 'all', false, exam.id), null)
  const id = writing.beginWriting(owner, 'all', false, exam.id)!
  assert.throws(() => writing.updateWriting(owner, id, 0, 0, 'save'), /Invalid/)
  assert.throws(() => writing.updateWriting(owner, id, 0, 0, 'save', 'a'.repeat(12_001)), /Invalid/)
  assert.ok(writing.getWritingAttempt(owner, id))
})
