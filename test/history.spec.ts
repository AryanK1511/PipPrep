import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from '@playwright/test'
import { advance, startAttempt } from '../src/lib/reading.ts'
import { advanceWriting, startWriting } from '../src/lib/writing.ts'
import type { WritingFeedback } from '../src/lib/writing.ts'
import { starter } from '../src/server/starter.ts'
import { writingStarter } from '../src/server/writing-starter.ts'

test.use({ timezoneId: 'America/Toronto', locale: 'en-US' })

test('Reading and Writing history show the local completion date across UTC midnight', async ({ page, context }) => {
  const owner = randomUUID()
  await context.addCookies([{ name: 'readline_owner', value: owner, url: 'http://127.0.0.1:4275' }])
  await page.goto('/history')
  const database = new DatabaseSync(process.env.READLINE_E2E_DB!)
  const finishedAt = Date.parse('2026-11-06T01:30:00Z')
  try {
    const reading = advance(startAttempt({ ...starter, parts: [starter.parts[0]] }, false, finishedAt - 1000, randomUUID()), finishedAt)
    const writing = advanceWriting(startWriting({ ...writingStarter, tasks: [writingStarter.tasks[0]] }, false, finishedAt - 1000, randomUUID()), finishedAt)
    database.prepare('INSERT INTO attempts (id, owner, state, started_at, finished_at) VALUES (?, ?, ?, ?, ?)')
      .run(reading.id, owner, JSON.stringify(reading), reading.startedAt, finishedAt)
    database.prepare('INSERT INTO writing_attempts (id, owner, state, started_at, finished_at) VALUES (?, ?, ?, ?, ?)')
      .run(writing.id, owner, JSON.stringify(writing), writing.startedAt, finishedAt)
  } finally { database.close() }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.reload()
  await expect(page.locator('.history-row time')).toHaveText(['Nov 5, 2026', 'Nov 5, 2026'])
  for (const time of await page.locator('.history-row time').all()) {
    await expect(time).toHaveAttribute('datetime', '2026-11-06T01:30:00.000Z')
  }
  expect(errors).toEqual([])
})

test('Writing history shows saved task and mock scores out of 12', async ({ page, context }) => {
  const owner = randomUUID()
  await context.addCookies([{ name: 'readline_owner', value: owner, url: 'http://127.0.0.1:4275' }])
  await page.goto('/history')
  const cases = [
    { title: 'Email drill', indices: [0], estimate: null, taskEstimate: { low: 7, high: 7 }, expected: '7/12' },
    { title: 'Survey drill', indices: [1], estimate: null, taskEstimate: { low: 8, high: 10 }, expected: '8–10/12' },
    { title: 'Full mock', indices: [0, 1], estimate: { low: 6, high: 8 }, taskEstimate: { low: 7, high: 9 }, expected: '6–8/12' },
    { title: 'Partial mock', indices: [0, 1], estimate: null, taskEstimate: { low: 7, high: 9 }, expected: 'Reviewed' },
    { title: 'Unscored drill', indices: [0], estimate: null, taskEstimate: null, expected: 'Unscored' },
  ]
  const database = new DatabaseSync(process.env.READLINE_E2E_DB!)
  try {
    for (const item of cases) {
      const exam = { ...writingStarter, title: item.title, tasks: writingStarter.tasks.filter(task => item.indices.includes(task.index)) }
      let attempt = startWriting(exam, false, Date.now(), randomUUID())
      for (const _task of exam.tasks) attempt = advanceWriting(attempt)
      const feedback: WritingFeedback | null = item.taskEstimate && {
        estimate: item.estimate, summary: 'Develop concrete reasons.', actions: [{ title: 'Add details', advice: 'Give examples.' }],
        tasks: exam.tasks.map(task => ({
          index: task.index, estimate: item.taskEstimate, summary: 'Ideas are clear.',
          dimensions: (['content', 'vocabulary', 'readability', 'fulfillment'] as const).map(key => ({ key, quote: null, observation: 'Use specific details.', advice: 'Give an example.' })),
          coverage: task.requirements.map((_, requirement) => ({ requirement, status: 'missing', explanation: 'Needs supporting details.' })),
          corrections: [], improvedResponse: 'Illustrative response.',
        })),
      }
      database.prepare('INSERT INTO writing_attempts (id, owner, state, started_at, finished_at, feedback) VALUES (?, ?, ?, ?, ?, ?)')
        .run(attempt.id, owner, JSON.stringify(attempt), attempt.startedAt, attempt.finishedAt!, feedback ? JSON.stringify(feedback) : null)
    }
  } finally { database.close() }
  await page.reload()
  for (const item of cases) {
    const row = page.locator('.history-row').filter({ has: page.getByRole('heading', { name: item.title, exact: true }) })
    await expect(row.locator('.history-score')).toHaveText(item.expected)
    if (item.taskEstimate && item.estimate) await expect(row.getByLabel('Estimated Writing score')).toBeVisible()
    else if (item.indices.length === 1 && item.taskEstimate) await expect(row.getByLabel('Estimated task score')).toBeVisible()
  }
})
