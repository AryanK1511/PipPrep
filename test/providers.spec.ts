import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { writingStarter } from '../src/server/writing-starter.ts'
import { starter } from '../src/server/starter.ts'

const dir = process.env.PIPPREP_PROVIDER_E2E_DIR!
const state = (value: object) => writeFileSync(join(dir, 'state.json'), JSON.stringify({ codex: 'online', claude: 'online', ...value }))
const logs = () => { try { return readFileSync(join(dir, 'log.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)) } catch { return [] } }
const picker = (page: Page) => page.getByRole('region', { name: 'AI provider', exact: true })
async function refresh(page: Page) {
  await picker(page).getByRole('button', { name: 'Refresh CLI status' }).click()
  await expect(picker(page).getByRole('button', { name: 'Refresh CLI status' })).toHaveText('Refresh')
}
async function choose(page: Page, provider: 'codex' | 'claude') {
  await picker(page).getByRole('radio', { name: provider === 'codex' ? /Codex CLI/ : /Claude Code CLI/ }).check()
  await expect(picker(page).getByRole('radio', { name: provider === 'codex' ? /Codex CLI/ : /Claude Code CLI/ })).toBeEnabled()
}
test.beforeEach(() => { state({}); rmSync(join(dir, 'log.jsonl'), { force: true }) })
test.afterEach(() => { copyFileSync('test/fixtures/cli.cjs', join(dir, 'codex')); state({}) })

test('sidebar status and keyboard selection persist across navigation, reloads and tabs', async ({ page, context }) => {
  await page.goto('/')
  await refresh(page)
  await expect(picker(page).getByText('Online', { exact: true })).toHaveCount(2)
  const theme = await page.getByRole('button', { name: /Switch to .* theme/ }).boundingBox()
  const box = await picker(page).boundingBox()
  expect(box!.y + box!.height).toBeLessThanOrEqual(theme!.y)
  await picker(page).getByRole('radio', { name: /Codex CLI/ }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(picker(page).getByRole('radio', { name: /Claude Code CLI/ })).toBeChecked()
  await page.getByRole('link', { name: 'Writing', exact: true }).click()
  await page.reload()
  await expect(picker(page).getByRole('radio', { name: /Claude Code CLI/ })).toBeChecked()
  const other = await context.newPage()
  await other.goto('/')
  await expect(picker(other).getByRole('radio', { name: /Claude Code CLI/ })).toBeChecked()
  await choose(other, 'codex')
  await expect(picker(page).getByRole('radio', { name: /Codex CLI/ })).toBeChecked()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
  expect(logs()).toHaveLength(0)
})

test('one installed CLI works and an unavailable explicit choice stays selected with starter practice available', async ({ page }) => {
  rmSync(join(dir, 'codex'))
  await page.goto('/writing/new/1')
  await refresh(page)
  await expect(picker(page).getByText('Not installed')).toBeVisible()
  await expect(picker(page).getByRole('radio', { name: /Claude Code CLI/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: /Generate fresh prompts/ })).toBeEnabled()
  await choose(page, 'codex')
  await expect(page.getByRole('radio', { name: /Generate fresh prompts/ })).toBeDisabled()
  await expect(page.getByRole('radio', { name: /Starter prompts/ })).toBeChecked()
  await page.reload()
  await expect(picker(page).getByRole('radio', { name: /Codex CLI/ })).toBeChecked()
  state({ claude: 'signed-out' })
  await refresh(page)
  await choose(page, 'claude')
  await expect(picker(page).getByText('Sign in', { exact: true })).toBeVisible()
  await expect(picker(page)).toContainText('claude auth login')
  await expect(page.getByRole('button', { name: 'Begin writing' })).toBeEnabled()
  expect(logs()).toHaveLength(0)
})

test('switching CLI during generation keeps the running job on its original provider', async ({ page }) => {
  state({ response: { tasks: [{ ...writingStarter.tasks[0], title: 'Original provider prompt' }] }, delay: 1500 })
  await page.goto('/writing/new/1')
  await refresh(page)
  await choose(page, 'codex')
  await page.getByRole('radio', { name: /Generate fresh prompts/ }).check()
  await page.getByRole('button', { name: 'Generate prompts' }).click()
  await choose(page, 'claude')
  await expect(page.getByRole('complementary', { name: 'Background activity' })).toContainText('Codex CLI')
  await expect(page.getByRole('heading', { name: 'Your writing test is ready' })).toBeVisible()
  expect(logs().map(call => call.provider)).toEqual(['codex'])
})

for (const change of ['same settings', 'provider', 'difficulty'] as const) {
  test(`full Reading mock retries reuse completed parts only with the same settings: ${change}`, async ({ page }) => {
    state({ readingParts: starter.parts, failReadingPart: 3 })
    await page.goto('/new/all')
    await refresh(page)
    await choose(page, 'codex')
    await page.getByRole('radio', { name: /Generate a fresh test/ }).check()
    await page.getByRole('button', { name: 'Generate test' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /could not finish this request/i })).toBeVisible()
    expect(logs().map(call => call.part).sort()).toEqual([0, 1, 2, 3])

    state({ readingParts: starter.parts })
    if (change === 'provider') await choose(page, 'claude')
    if (change === 'difficulty') {
      await page.getByRole('combobox', { name: 'Difficulty' }).click()
      await page.getByRole('option', { name: 'Challenge', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Generate test' }).click()
    await expect(page.getByRole('heading', { name: 'Your reading test is ready' })).toBeVisible()
    const retry = logs().slice(4)
    expect(retry.map(call => call.part).sort()).toEqual(change === 'same settings' ? [3] : [0, 1, 2, 3])
    expect(retry.every(call => call.provider === (change === 'provider' ? 'claude' : 'codex'))).toBe(true)
    if (change === 'difficulty') expect(retry.every(call => call.prompt.includes('Target difficulty is challenging'))).toBe(true)
    await page.getByRole('button', { name: 'Begin test' }).click()
    await expect(page.locator('.steps .step')).toHaveCount(4)
    await expect(page.getByRole('combobox')).toHaveCount(11)
  })
}

for (const provider of ['codex', 'claude'] as const) {
  test(`${provider} handles Reading generation and coaching through the selected CLI`, async ({ page }) => {
    state({ response: { ...starter.parts[1], title: `${provider} generated flyer` } })
    await page.goto('/new/2')
    await refresh(page)
    await choose(page, provider)
    await page.getByRole('radio', { name: /Generate a fresh test/ }).check()
    await page.getByRole('button', { name: 'Generate test' }).click()
    await expect(page.getByRole('heading', { name: 'Your reading test is ready' })).toBeVisible()
    await page.getByRole('button', { name: 'Begin test' }).click()
    state({ response: { summary: 'Focus on comparing the flyer conditions.', patterns: 'Several details need comparison.', gaps: 'Read the note beside the table.', priority: 'Combine constraints.', actions: [{ title: 'Compare two rows', advice: 'List the conditions before choosing.' }] } })
    await page.getByRole('button', { name: 'Finish test' }).click()
    await page.getByRole('button', { name: 'Submit test' }).click()
    await expect(page.getByText('Focus on comparing the flyer conditions.', { exact: true })).toBeVisible()
    expect(logs().map(call => call.provider)).toEqual([provider, provider])
  })
  test(`${provider} handles Writing generation and validated assessment through the selected CLI`, async ({ page }) => {
    state({ response: { tasks: [{ ...writingStarter.tasks[0], title: `${provider} generated email` }] } })
    await page.goto('/writing/new/1')
    await refresh(page)
    await choose(page, provider)
    await page.getByRole('radio', { name: /Generate fresh prompts/ }).check()
    await page.getByRole('radio', { name: /Untimed/ }).check()
    await page.getByRole('button', { name: 'Generate prompts' }).click()
    await expect(page.getByRole('heading', { name: 'Your writing test is ready' })).toBeVisible()
    await page.getByRole('button', { name: 'Begin writing' }).click()
    const sentence = 'I prefer the garden because it gives residents a place to meet and grow vegetables. '
    await page.getByRole('textbox', { name: 'Your response' }).fill(sentence.repeat(10))
    state({ response: {
      estimate: null, summary: 'Develop concrete reasons.',
      tasks: [{ index: 0, estimate: { low: 6, high: 8 }, summary: 'Ideas are clear.',
        dimensions: ['content', 'vocabulary', 'readability', 'fulfillment'].map(key => ({ key, quote: 'I prefer the garden', observation: 'The main position is clear.', advice: 'Add a concrete example.' })),
        coverage: writingStarter.tasks[0].requirements.map((_, requirement) => ({ requirement, status: 'partial', explanation: 'Add more detail.' })),
        corrections: [], improvedResponse: sentence.repeat(10).trim(),
      }], actions: [{ title: 'Support each reason', advice: 'Give a specific example.' }],
    } })
    await page.getByRole('button', { name: 'Finish writing' }).click()
    await page.getByRole('button', { name: 'Submit writing' }).click()
    await expect(page.getByRole('region', { name: 'Writing score' })).toContainText('6–8')
    await expect(page.getByText('Develop concrete reasons.', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('region', { name: 'Writing score' })).toContainText('6–8')
    expect(logs().map(call => call.provider)).toEqual([provider, provider])
  })
}

async function roomLobby(host: Page, guest: Page) {
  await host.goto('/rooms')
  await refresh(host)
  await choose(host, 'claude')
  await host.getByRole('textbox', { name: 'Your display name' }).fill('Host')
  await host.getByRole('button', { name: 'Create room', exact: true }).click()
  await expect(host.getByRole('heading', { name: /^Room / })).toBeVisible()
  await guest.goto(host.url())
  await guest.getByRole('textbox', { name: 'Your display name' }).fill('Guest')
  await guest.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(guest.locator('.room-members')).toContainText('Guest')
}
async function startSharedTest(host: Page, guest: Page) {
  await host.getByRole('button', { name: 'I’m ready', exact: true }).click()
  await guest.getByRole('button', { name: 'I’m ready', exact: true }).click()
  await expect(host.getByRole('button', { name: 'Start for everyone' })).toBeEnabled()
  await host.getByRole('button', { name: 'Start for everyone' }).click()
  await guest.getByRole('link', { name: 'Open my test', exact: true }).click()
  await host.getByRole('link', { name: 'Open my test', exact: true }).click()
}
test('room generation creates one shared full Reading exam on the host provider and failure can be retried', async ({ page, browser }) => {
  const guest = await browser.newPage()
  try {
    state({ readingParts: starter.parts, failure: 'Temporary test provider failure' })
    await roomLobby(page, guest)
    await page.getByRole('radio', { name: /^Generate a fresh test/ }).check()
    await page.getByRole('button', { name: 'Generate shared test' }).click()
    await expect(page.locator('.room-current')).toContainText('could not finish this request')
    state({ readingParts: starter.parts })
    const prior = logs().length
    await page.getByRole('button', { name: 'Retry shared test' }).click()
    await expect(page.getByRole('button', { name: 'I’m ready', exact: true })).toBeVisible()
    expect(logs().slice(prior).map(call => call.part).sort()).toEqual([0, 1, 2, 3])
    expect(logs().slice(prior).every(call => call.provider === 'claude')).toBe(true)
    await startSharedTest(page, guest)
    expect(await page.getByRole('region', { name: 'Message content' }).innerText()).toBe(await guest.getByRole('region', { name: 'Message content' }).innerText())
    await expect(page.locator('.step')).toHaveCount(4)
    await expect(guest.locator('.step')).toHaveCount(4)
  } finally { await guest.close() }
})

for (const full of [false, true]) {
  test(`room ${full ? 'full Writing mock' : 'Writing drill'} generates once and compares assessments from the captured host provider`, async ({ page, browser }) => {
    const guest = await browser.newPage()
    try {
      const tasks = full ? writingStarter.tasks : [writingStarter.tasks[0]]
      state({ response: { tasks } })
      await roomLobby(page, guest)
      await page.getByRole('radio', { name: 'Writing', exact: true }).check()
      if (!full) {
        await page.getByRole('combobox', { name: 'Test sections' }).click()
        await page.getByRole('listbox').getByRole('option').nth(1).click()
      }
      await page.getByRole('radio', { name: /^Untimed/ }).check()
      await page.getByRole('radio', { name: /^Generate a fresh test/ }).check()
      await page.getByRole('button', { name: 'Generate shared test' }).click()
      await expect(page.getByRole('button', { name: 'I’m ready', exact: true })).toBeVisible()
      expect(logs().map(call => call.provider)).toEqual(['claude'])
      await choose(page, 'codex')
      await startSharedTest(page, guest)
      expect(await page.getByRole('region', { name: 'Writing prompt' }).innerText()).toBe(await guest.getByRole('region', { name: 'Writing prompt' }).innerText())
      const sentence = 'I prefer the garden because it gives residents a place to meet and grow vegetables. '
      state({ response: {
        estimate: full ? { low: 7, high: 9 } : null, summary: 'Support your reasons with examples.',
        tasks: tasks.map(task => ({ index: task.index, estimate: { low: 7, high: 9 }, summary: 'A clear response.',
          dimensions: ['content', 'vocabulary', 'readability', 'fulfillment'].map(key => ({ key, quote: 'I prefer the garden', observation: 'The position is clear.', advice: 'Explain each reason.' })),
          coverage: task.requirements.map((_, requirement) => ({ requirement, status: 'partial', explanation: 'Develop this point.' })),
          corrections: [], improvedResponse: sentence.repeat(10).trim(),
        })), actions: [{ title: 'Add examples', advice: 'Use a specific example for each reason.' }],
      } })
      for (const participant of [page, guest]) {
        for (let position = 0; position < tasks.length; position++) {
          await participant.getByRole('textbox', { name: 'Your response', exact: true }).fill(sentence.repeat(10))
          await participant.getByRole('button', { name: position === tasks.length - 1 ? 'Finish writing' : 'Next task', exact: true }).click()
          await participant.getByRole('button', { name: position === tasks.length - 1 ? 'Submit writing' : 'Continue to next task', exact: true }).click()
        }
        await expect(participant.getByRole('region', { name: 'Writing score' })).toContainText('7–9')
        await participant.getByRole('link', { name: 'Back to room', exact: true }).click()
      }
      await expect(page.getByRole('region', { name: 'Score comparison' })).toContainText('7–9 / 12')
      const rows = page.getByRole('region', { name: 'Score comparison' }).locator('tbody tr')
      await expect(rows).toHaveCount(2)
      for (let person = 0; person < 2; person++) {
        for (let column = 0; column <= tasks.length; column++) await expect(rows.nth(person).locator('td').nth(column)).toContainText('7–9 / 12')
      }
      expect(logs().map(call => call.provider)).toEqual(['claude', 'claude', 'claude'])
    } finally { await guest.close() }
  })
}
