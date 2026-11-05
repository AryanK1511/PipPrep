import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as store from '../src/server/store.server.ts'

const directory = mkdtempSync(join(tmpdir(), 'readline-store-test-'))
process.env.READLINE_DB = join(directory, 'attempts.sqlite')

test('SQLite keeps attempts private and never returns the answer key for active parts', () => {
  const owner = randomUUID()
  const stranger = randomUUID()
  const id = store.begin(owner, 'all', false)!
  assert.equal(store.begin(owner, 3, false), id)
  assert.equal(store.getAttempt(stranger, id), null)
  assert.equal(store.updateAttempt(stranger, id, 0, 'next'), null)
  const view = store.getAttempt(owner, id)
  assert.ok(view && !view.finished)
  assert.deepEqual(Object.keys(view.attempt.part.questions[0]), ['prompt', 'options'])
  assert.equal(view.attempt.part.questions.length, 11)
  assert.equal(store.result(owner, id), null)
})

test('saved answers survive a new SQLite connection and late writes cannot change the next part', () => {
  const owner = randomUUID()
  const id = store.begin(owner, 'all', false)!
  store.updateAttempt(owner, id, 0, 'answer', 0, 2)
  const independent = new DatabaseSync(process.env.READLINE_DB!)
  try {
    const row = independent.prepare('SELECT state FROM attempts WHERE id = ?').get(id)
    assert.equal(JSON.parse(String(row?.state)).answers[0][0], 2)
  } finally { independent.close() }
  store.updateAttempt(owner, id, 0, 'next')
  const stale = store.updateAttempt(owner, id, 0, 'answer', 0, 1)
  assert.ok(stale && !stale.finished)
  assert.equal(stale.attempt.position, 1)
  assert.equal(stale.attempt.answers[0]?.[0], 2)
  assert.equal(stale.attempt.answers[1], undefined)
})

test('completed history includes persisted coaching and respects ownership on deletion', () => {
  const owner = randomUUID()
  const id = store.begin(owner, 0, false)!
  store.updateAttempt(owner, id, 0, 'answer', 0, 2)
  assert.equal(store.updateAttempt(owner, id, 0, 'next')?.finished, true)
  store.saveCoaching(owner, id, { summary: 'Good detail tracking.', actions: [{ title: 'Review', advice: 'Revisit skipped items.' }] })
  store.deleteAttempt(randomUUID(), id)
  assert.equal(store.dashboard(owner).entries[0].score, 1)
  assert.equal(store.result(owner, id)?.coach?.summary, 'Good detail tracking.')
  store.deleteAttempt(owner, id)
  assert.equal(store.result(owner, id), null)
})
