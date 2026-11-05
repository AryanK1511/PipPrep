import type { AiProvider } from '../lib/providers.ts'
import { randomUUID } from 'node:crypto'
import { db, transaction } from './store.server.ts'
import { ProviderError } from './ai.server.js'
import type { BackgroundJob, JobKind } from '../lib/jobs.ts'

let initialized = false
function database() {
  const database = db()
  if (!initialized) {
    database.exec(`CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0
    ) STRICT; CREATE INDEX IF NOT EXISTS background_jobs_owner ON background_jobs(owner);`)
    // This app runs one Node server. Work cannot continue across a server restart.
    for (const row of database.prepare('SELECT id, payload FROM background_jobs').all()) {
      const job: BackgroundJob = JSON.parse(String(row.payload))
      if (job.state === 'running') {
        job.state = 'failed'
        job.error = 'The server restarted before this finished. Please retry.'
        database.prepare('UPDATE background_jobs SET payload = ? WHERE id = ?').run(JSON.stringify(job), String(row.id))
      }
    }
    initialized = true
  }
  return database
}
export function listJobs(owner?: string): BackgroundJob[] {
  if (!owner) return []
  return database().prepare('SELECT payload FROM background_jobs WHERE owner = ? AND dismissed = 0 ORDER BY rowid DESC').all(owner)
    .map(row => JSON.parse(String(row.payload)) as BackgroundJob)
}
export function dismissJob(owner: string, id: string) {
  database().prepare("UPDATE background_jobs SET dismissed = 1 WHERE owner = ? AND id = ? AND json_extract(payload, '$.state') != 'running'").run(owner, id)
}
export function startJob(owner: string, input: { kind: JobKind; target: string; mode: 'timed' | 'untimed'; provider?: AiProvider }, fallback: string,
  work: (update: (key: string, stage: string) => void, signal: AbortSignal) => Promise<NonNullable<BackgroundJob['result']>>,
): BackgroundJob {
  database()
  const job = transaction(() => {
    const jobs = listJobs(owner)
    const existing = jobs.find(job => job.kind === input.kind && job.target === input.target && job.state !== 'failed')
      || jobs.find(job => job.state === 'running' && input.kind !== 'feedback' && job.kind !== 'feedback')
    if (existing) return { existing }
    const running = database().prepare("SELECT count(*) AS count FROM background_jobs WHERE json_extract(payload, '$.state') = 'running'").get()!
    if (Number(running.count) >= 6) throw new Error('The server is busy. Please try again in a moment.')
    const created: BackgroundJob = { ...input, id: randomUUID(), state: 'running', startedAt: Date.now(), updates: {} }
    database().prepare('INSERT INTO background_jobs (id, owner, payload) VALUES (?, ?, ?)').run(created.id, owner, JSON.stringify(created))
    return { created }
  })
  if (job.existing) return job.existing
  const current = job.created!
  const persist = () => database().prepare('UPDATE background_jobs SET payload = ? WHERE owner = ? AND id = ?').run(JSON.stringify(current), owner, current.id)
  // Deliberately independent of the HTTP request and its cancellation signal.
  void Promise.resolve().then(() => work((key, stage) => { current.updates[key] = stage; persist() }, AbortSignal.timeout(15 * 60_000)))
    .then(result => { current.result = result; current.state = 'ready' })
    .catch(error => { current.state = 'failed'; current.error = error instanceof ProviderError ? error.message : fallback })
    .finally(persist)
  return current
}
