import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/server/store.server.ts'
import { dismissJob, listJobs, startJob } from '../src/server/jobs.server.ts'

process.env.READLINE_DB = join(mkdtempSync(join(tmpdir(), 'readline-jobs-')), 'test.sqlite')
const tick = () => new Promise(resolve => setImmediate(resolve))

test('jobs survive client detachment, deduplicate requests, persist progress/results and enforce ownership', async () => {
  let finish!: (result: string) => void
  let count = 0
  const work = async (update: (key: string, value: string) => void, signal: AbortSignal) => {
    count++
    assert.equal(signal.aborted, false)
    update('prompts', 'Checking')
    return new Promise<string>(resolve => { finish = resolve })
  }
  const input = { kind: 'writing' as const, target: 'all', mode: 'untimed' as const }
  const job = startJob('owner', input, 'Failed', work)
  assert.equal(startJob('owner', input, 'Failed', work).id, job.id)
  // Another generation scope reuses the active generation instead of spending again.
  assert.equal(startJob('owner', { ...input, kind: 'reading', target: '1' }, 'Failed', work).id, job.id)
  await tick()
  assert.equal(count, 1)
  assert.equal(listJobs('owner')[0].updates.prompts, 'Checking')
  assert.deepEqual(listJobs('stranger'), [])
  dismissJob('stranger', job.id)
  dismissJob('owner', job.id) // Running jobs cannot be hidden and then duplicated.
  assert.equal(listJobs('owner').length, 1)
  finish('saved-exam-id')
  await tick()
  const saved = listJobs('owner')[0]
  assert.equal(saved.state, 'ready')
  assert.equal(saved.result, 'saved-exam-id')
  const independent = new DatabaseSync(process.env.READLINE_DB!)
  const row = independent.prepare('SELECT payload FROM background_jobs WHERE id = ?').get(job.id)
  assert.equal(JSON.parse(String(row!.payload)).result, 'saved-exam-id')
  independent.close()
  assert.equal(startJob('owner', input, 'Failed', work).id, job.id)
  assert.equal(count, 1)
  dismissJob('owner', job.id)
  assert.deepEqual(listJobs('owner'), [])
})

test('failed work releases the slot and explicit retry starts a new job', async () => {
  const input = { kind: 'feedback' as const, target: 'attempt', mode: 'untimed' as const }
  const first = startJob('retry-owner', input, 'Please retry', async () => { throw new Error('private provider detail') })
  await tick()
  assert.equal(listJobs('retry-owner')[0].state, 'failed')
  assert.equal(listJobs('retry-owner')[0].error, 'Please retry')
  const retry = startJob('retry-owner', input, 'Please retry', async () => 'feedback')
  assert.notEqual(retry.id, first.id)
  await tick()
  assert.equal(listJobs('retry-owner')[0].state, 'ready')
})

test('a server restart turns interrupted jobs into a retryable error', async () => {
  // A fresh module instance represents startup of the single Node server.
  db().prepare('INSERT INTO background_jobs (id, owner, payload) VALUES (?, ?, ?)').run('interrupted', 'restart-owner', JSON.stringify({
    id: 'interrupted', kind: 'writing', target: '1', mode: 'timed', state: 'running', updates: {}, startedAt: Date.now(),
  }))
  const restarted = await import(new URL('../src/server/jobs.server.ts?restart-test', import.meta.url).href)
  const job = restarted.listJobs('restart-owner')[0]
  assert.equal(job.state, 'failed')
  assert.match(job.error!, /server restarted/)
})
