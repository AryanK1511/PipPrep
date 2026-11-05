import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

async function lobby(host: Page, browser: Browser) {
  await host.goto('/rooms')
  await host.getByRole('textbox', { name: 'Your display name' }).fill('Aryan')
  await host.getByRole('button', { name: 'Create room', exact: true }).click()
  await expect(host.getByRole('heading', { name: /^Room / })).toBeVisible()
  const code = host.url().split('/').at(-1)!
  const guest = await browser.newPage()
  await guest.goto('/rooms')
  await guest.getByRole('textbox', { name: 'Room code or invite link' }).fill(code.toLowerCase())
  await guest.getByRole('button', { name: 'Find room' }).click()
  await expect(guest.getByRole('heading', { name: 'Join this room', exact: true })).toBeVisible()
  await guest.getByRole('textbox', { name: 'Your display name' }).fill('Friend')
  await guest.getByRole('button', { name: 'Join room', exact: true }).click()
  await expect(guest.locator('.room-members')).toContainText('Friend')
  await expect(host.locator('.room-members')).toContainText('Friend')
  return { guest, code, url: host.url() }
}
async function start(host: Page, guest: Page) {
  await host.getByRole('button', { name: 'Prepare shared test' }).click()
  await host.getByRole('button', { name: 'I’m ready', exact: true }).click()
  await guest.getByRole('button', { name: 'I’m ready', exact: true }).click()
  await expect(host.getByRole('button', { name: 'Start for everyone' })).toBeEnabled()
  await host.getByRole('button', { name: 'Start for everyone' }).click()
  await expect(guest.getByRole('link', { name: 'Open my test' })).toBeVisible()
  await host.getByRole('link', { name: 'Open my test' }).click()
  await guest.getByRole('link', { name: 'Open my test' }).click()
}
async function finishReading(page: Page, sections: number) {
  for (let part = 0; part < sections; part++) {
    await page.getByRole('button', { name: part === sections - 1 ? 'Finish test' : 'Next part', exact: true }).click()
    await page.getByRole('button', { name: part === sections - 1 ? 'Submit test' : 'Continue to next part', exact: true }).click()
  }
  await expect(page.getByRole('heading', { name: 'Reading results', exact: true })).toBeVisible()
}
for (const section of [0, 1, 2, 3, 4]) {
  test(`room Reading ${section === 0 ? 'full mock' : `part ${section}`} starts separately and compares only after everyone finishes`, async ({ page, browser }) => {
    const { guest, code, url } = await lobby(page, browser)
    try {
      await page.getByRole('combobox', { name: 'Test sections' }).click()
      await page.getByRole('listbox').getByRole('option').nth(section).click()
      await page.getByRole('radio', { name: /^Untimed/ }).check()
      await start(page, guest)
      expect(page.url()).not.toBe(guest.url())
      await expect(page.getByRole('complementary', { name: 'Room progress' })).toContainText('Friend')
      if (section === 1) {
        await page.getByRole('combobox', { name: 'Question 1', exact: true }).click()
        await page.getByRole('listbox').getByRole('option').nth(3).click()
        await page.reload()
        await expect(page.locator('#answer-count')).toContainText('1 of 11 answered')
        await expect(guest.locator('#answer-count')).toContainText('0 of 11 answered')
      }
      await finishReading(page, section === 0 ? 4 : 1)
      await page.getByRole('link', { name: 'Back to room', exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: /1 of 2 finished/ })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Score comparison' })).toHaveCount(0)
      await finishReading(guest, section === 0 ? 4 : 1)
      await expect(page.getByRole('region', { name: 'Score comparison' })).toContainText('Aryan (you)')
      await expect(page.getByRole('region', { name: 'Score comparison' })).toContainText('Friend')
      const totals = [38, 11, 8, 9, 10]
      await expect(page.getByRole('region', { name: 'Score comparison' })).toContainText(`0 / ${totals[section]}`)
      if (section === 1) await expect(page.getByRole('region', { name: 'Score comparison' }).locator('tbody tr').first()).toContainText('1 / 11')
      await page.reload()
      await expect(page.getByRole('region', { name: 'Score comparison' })).toContainText('Friend')
      if (section === 2) {
        await page.setViewportSize({ width: 390, height: 844 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
        await page.screenshot({ path: '/tmp/pipprep-room-mobile.png', fullPage: true })
        await page.getByRole('button', { name: 'Switch to dark theme' }).click()
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await page.screenshot({ path: '/tmp/pipprep-room-dark.png', fullPage: true })
      }
      await guest.goto(url)
      await expect(guest.getByRole('button', { name: 'Prepare shared test' })).toHaveCount(0)
      const stranger = await browser.newPage()
      try {
        await stranger.goto(`/rooms/${code}`)
        await expect(stranger.locator('.room-members')).toHaveCount(0)
        await expect(stranger.getByRole('heading', { name: 'Join this room' })).toBeVisible()
      } finally { await stranger.close() }
    } finally { await guest.close() }
  })
}
for (const section of [0, 1, 2]) {
  test(`room Writing ${section === 0 ? 'full mock' : `task ${section}`} saves independent responses and shows completion`, async ({ page, browser }) => {
    const { guest } = await lobby(page, browser)
    try {
      await page.getByRole('radio', { name: 'Writing', exact: true }).check()
      await page.getByRole('combobox', { name: 'Test sections' }).click()
      await page.getByRole('listbox').getByRole('option').nth(section).click()
      await page.getByRole('radio', { name: /^Untimed/ }).check()
      await start(page, guest)
      for (const [person, prefix] of [[page, 'Host'], [guest, 'Guest']] as const) {
        const count = section === 0 ? 2 : 1
        for (let position = 0; position < count; position++) {
          await person.getByRole('textbox', { name: 'Your response', exact: true }).fill(`${prefix} private response for task ${position + 1}.`)
          await expect(person.getByRole('status', { name: 'Save status' })).toHaveText('Saved')
          await person.reload()
          await expect(person.getByRole('textbox', { name: 'Your response', exact: true })).toHaveValue(`${prefix} private response for task ${position + 1}.`)
          await person.getByRole('button', { name: position === count - 1 ? 'Finish writing' : 'Next task', exact: true }).click()
          await person.getByRole('button', { name: position === count - 1 ? 'Submit writing' : 'Continue to next task', exact: true }).click()
        }
        await expect(person.getByRole('heading', { name: 'Writing results', exact: true })).toBeVisible()
        await person.getByRole('link', { name: 'Back to room', exact: true }).click()
        if (person === page) {
          await expect(person.locator('.room-members')).toContainText('Writing')
          await expect(person.getByRole('region', { name: 'Score comparison' })).toHaveCount(0)
        }
      }
      const comparison = page.getByRole('region', { name: 'Score comparison' })
      await expect(comparison).toContainText('No estimate')
      await expect(comparison).toContainText('Friend')
      expect(await page.content()).not.toContain('Guest private response')
      expect(await guest.content()).not.toContain('Host private response')
    } finally { await guest.close() }
  })
}

test('host can end a timed test, participants are redirected, and closed rooms cannot be joined', async ({ page, browser }) => {
  const { guest, url } = await lobby(page, browser)
  try {
    await page.getByRole('radio', { name: 'Writing', exact: true }).check()
    await start(page, guest)
    await expect(guest.getByRole('timer')).toHaveText(/^(27:00|26:5\d)$/)
    await guest.getByRole('textbox', { name: 'Your response' }).fill('Saved before the host ended the test.')
    await expect(guest.getByRole('status', { name: 'Save status' })).toHaveText('Saved')
    await page.getByRole('button', { name: 'Back to room', exact: true }).click()
    await page.getByRole('button', { name: 'End this test for everyone' }).click()
    await page.getByRole('button', { name: 'End test', exact: true }).click()
    await expect(guest.getByRole('heading', { name: 'Writing results', exact: true })).toBeVisible()
    await expect(guest.getByText('Saved before the host ended the test.', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Score comparison' })).toContainText('Stopped early')
    await page.getByRole('button', { name: 'Close room', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Close room', exact: true }).click()
    const newcomer = await browser.newPage()
    try {
      await newcomer.goto(url)
      await expect(newcomer.getByRole('heading', { name: 'Room closed', exact: true })).toBeVisible()
      await expect(newcomer.getByRole('button', { name: 'Join room' })).toHaveCount(0)
    } finally { await newcomer.close() }
  } finally { await guest.close() }
})

test('rooms support another skill in the next round, preserve comparisons, and allow members to leave between tests', async ({ page, browser }) => {
  const { guest, url } = await lobby(page, browser)
  try {
    await start(page, guest)
    await page.getByRole('link', { name: 'Back to room', exact: true }).click()
    await page.getByRole('button', { name: 'End this test for everyone' }).click()
    await page.getByRole('button', { name: 'End test', exact: true }).click()
    await expect(guest.getByRole('heading', { name: 'Reading results', exact: true })).toBeVisible()
    await guest.getByRole('link', { name: 'Back to room', exact: true }).click()
    await page.getByText('Choose the next test', { exact: true }).click()
    await page.getByRole('radio', { name: 'Writing', exact: true }).check()
    await page.getByRole('combobox', { name: 'Test sections' }).click()
    await page.getByRole('listbox').getByRole('option').nth(1).click()
    await page.getByRole('radio', { name: /^Untimed/ }).check()
    await start(page, guest)
    for (const participant of [page, guest]) {
      await participant.getByRole('textbox', { name: 'Your response' }).fill('A separate response for our second round.')
      await participant.getByRole('button', { name: 'Finish writing', exact: true }).click()
      await participant.getByRole('button', { name: 'Submit writing', exact: true }).click()
      await expect(participant.getByRole('heading', { name: 'Writing results', exact: true })).toBeVisible()
      await participant.getByRole('link', { name: 'Back to room', exact: true }).click()
    }
    await expect(page.getByRole('region', { name: 'Score comparison' })).toContainText('No estimate')
    await expect(page.locator('.room-history')).toHaveCount(1)
    await page.locator('.room-history > summary').click()
    await expect(page.locator('.room-history')).toContainText('0 / 38')
    await guest.getByRole('button', { name: 'Leave room', exact: true }).click()
    await expect(guest.getByRole('heading', { name: 'Study rooms', exact: true })).toBeVisible()
    await expect(page.locator('.room-members')).not.toContainText('Friend')
    await guest.goto(url)
    await expect(guest.getByRole('heading', { name: 'Join this room', exact: true })).toBeVisible()
    await guest.getByRole('textbox', { name: 'Your display name' }).fill('Friend again')
    await guest.getByRole('button', { name: 'Join room', exact: true }).click()
    await expect(page.locator('.room-members')).toContainText('Friend again')
    await page.getByRole('button', { name: 'Remove Friend again', exact: true }).click()
    await expect(guest.getByRole('heading', { name: 'Join this room', exact: true })).toBeVisible()
  } finally { await guest.close() }
})
