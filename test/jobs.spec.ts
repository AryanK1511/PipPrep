import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from '@playwright/test'
import { writingStarter } from '../src/server/writing-starter.ts'

test('writing progress survives navigation, reload and another tab, then opens saved untimed prompts', async ({ page, context }) => {
  const owner = randomUUID()
  await context.addCookies([{ name: 'readline_owner', value: owner, url: 'http://127.0.0.1:4275' }])
  await page.goto('/writing/new/all')
  const database = new DatabaseSync(process.env.READLINE_E2E_DB!)
  try {
    // Wait until the app's first status read has initialized job recovery.
    await expect.poll(() => database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'background_jobs'").get()?.count).toBe(1)
    const id = randomUUID()
    const examId = randomUUID()
    const job = { id, kind: 'writing', target: 'all', mode: 'untimed', state: 'running', startedAt: Date.now() - 12_000, updates: { prompts: 'Writing prompts' } }
    database.prepare('INSERT INTO background_jobs (id, owner, payload) VALUES (?, ?, ?)').run(id, owner, JSON.stringify(job))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('status', { name: 'Building your writing test' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate prompts' })).toBeHidden()
    await page.getByRole('link', { name: 'Reading', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Background activity' })).toContainText('Writing prompts · In progress')
    await page.reload()
    await expect(page.getByRole('link', { name: 'View progress' })).toBeVisible()
    const other = await context.newPage()
    try {
      await other.goto('/writing/new/all')
      await expect(other.getByRole('status', { name: 'Building your writing test' })).toBeVisible()
      // Complete the job as the model worker would, without making a real paid AI call.
      database.prepare('INSERT INTO writing_exams (id, owner, payload, created_at) VALUES (?, ?, ?, ?)').run(examId, owner, JSON.stringify({ ...writingStarter, id: examId, origin: 'generated' }), Date.now())
      database.prepare('UPDATE background_jobs SET payload = ? WHERE id = ?').run(JSON.stringify({ ...job, state: 'ready', result: examId }), id)
      await expect(page.getByRole('link', { name: 'Open prompts' })).toBeVisible()
      await expect(other.getByRole('heading', { name: 'Your writing test is ready' })).toBeVisible()
      await page.getByRole('link', { name: 'Open prompts' }).click()
      await page.getByRole('button', { name: 'Begin writing' }).click()
      await expect(page.getByRole('textbox', { name: 'Your response' })).toBeVisible()
      await expect(page.getByRole('timer')).toHaveText('Untimed')
      await expect.poll(() => database.prepare('SELECT dismissed FROM background_jobs WHERE id = ?').get(id)?.dismissed).toBe(1)
    } finally { await other.close() }
  } finally { database.close() }
})

test('activity polling slows while idle, accelerates for running jobs, and pauses in hidden tabs', async ({ page, context }) => {
  const owner = randomUUID()
  await context.addCookies([{ name: 'readline_owner', value: owner, url: 'http://127.0.0.1:4275' }])
  await page.clock.install()
  await page.goto('/')
  const database = new DatabaseSync(process.env.READLINE_E2E_DB!)
  try {
    await expect.poll(() => database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'background_jobs'").get()?.count).toBe(1)
    const job = { id: randomUUID(), kind: 'reading', target: 'all', mode: 'untimed', state: 'ready', result: randomUUID(), startedAt: Date.now(), updates: {} }
    database.prepare('INSERT INTO background_jobs (id, owner, payload) VALUES (?, ?, ?)').run(job.id, owner, JSON.stringify(job))
    const firstRead = page.waitForResponse(async response => response.url().includes('/_serverFn/') && (await response.text()).includes(job.id))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    const endpoint = new URL((await firstRead).url()).pathname
    await expect(page.getByRole('complementary', { name: 'Background activity' })).toContainText('Reading test · Ready')
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
    await page.waitForLoadState('networkidle')
    let reads = 0
    page.on('request', request => { if (new URL(request.url()).pathname === endpoint) reads++ })
    await page.clock.runFor(10_000)
    expect(reads).toBe(0)
    const idleRead = page.waitForResponse(response => new URL(response.url()).pathname === endpoint)
    await page.clock.runFor(20_000)
    await idleRead
    await page.waitForLoadState('networkidle')
    expect(reads).toBe(1)

    database.prepare('UPDATE background_jobs SET payload = ? WHERE id = ?').run(JSON.stringify({ ...job, state: 'running' }), job.id)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('complementary', { name: 'Background activity' })).toContainText('Reading test · In progress')
    await page.waitForLoadState('networkidle')
    reads = 0
    const activeRead = page.waitForResponse(response => new URL(response.url()).pathname === endpoint)
    await page.clock.runFor(1500)
    await activeRead
    await page.waitForLoadState('networkidle')
    expect(reads).toBe(1)

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    reads = 0
    await page.clock.runFor(60_000)
    expect(reads).toBe(0)
    const resumedRead = page.waitForResponse(response => new URL(response.url()).pathname === endpoint)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await resumedRead
    expect(reads).toBe(1)
  } finally { database.close() }
})
