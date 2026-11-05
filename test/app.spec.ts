import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { starter } from '../src/server/starter.ts'

async function begin(page: Page) {
  await page.getByRole('button', { name: 'Begin test' }).click()
}

test('full mock saves answers on refresh, scores 38/38, and persists review', async ({ page, browser }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Start a practice test' }).click()
  await page.getByRole('radio', { name: /Untimed/ }).check()
  await begin(page)
  for (const [position, part] of starter.parts.entries()) {
    await expect(page.getByRole('combobox')).toHaveCount(part.questions.length)
    for (const [index, question] of part.questions.entries()) {
      const select = page.getByRole('combobox', { name: 'Question ' + (index + 1), exact: true })
      await select.selectOption(String(question.answer))
      await expect(page.locator('#answer-count')).toHaveText(`${index + 1} of ${part.questions.length} answered`)
    }
    if (position === 0) {
      await page.reload()
      await expect(page.getByRole('combobox', { name: 'Question 1', exact: true })).toHaveValue('2')
      expect(await page.content()).not.toContain(part.questions[0].explanation)
    }
    if (position === 1) await expect(page.getByRole('table')).toBeVisible()
    if (position === 2) await expect(page.locator('.paragraph-label')).toHaveText(['A', 'B', 'C', 'D'])
    await page.getByRole('button', { name: position === 3 ? 'Finish test' : 'Next part' }).click()
    await page.getByRole('button', { name: position === 3 ? 'Submit test' : 'Continue to next part' }).click()
  }
  await expect(page.locator('.score-card')).toContainText('38 / 38')
  await expect(page.locator('.band strong')).toHaveText('10–12')
  await expect(page.locator('.review-item')).toHaveCount(38)
  const resultUrl = page.url()
  await page.getByRole('button', { name: 'Missed only' }).click()
  await expect(page.getByText('You answered every question correctly.')).toBeVisible()
  await page.getByRole('link', { name: 'Attempt history' }).click()
  await page.reload()
  await page.getByRole('link', { name: 'Review', exact: true }).click()
  await expect(page.locator('.score-card')).toContainText('38 / 38')
  const other = await browser.newPage()
  try {
    const result = await other.goto(resultUrl)
    expect(result?.status()).toBe(404)
    await expect(other.getByRole('heading', { name: 'Page unavailable' })).toBeVisible()
  } finally { await other.close() }
})

test('desktop uses two panes and a timed attempt can be resumed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Start a practice test' }).click()
  await begin(page)
  await expect(page.getByRole('timer')).toHaveText(/^(11:00|10:5[7-9])$/)
  const left = await page.getByRole('region', { name: 'Message content' }).boundingBox()
  const right = await page.getByRole('region', { name: 'Answer choices' }).boundingBox()
  expect(left!.x + left!.width).toBeLessThan(right!.x)
  await page.getByRole('combobox', { name: 'Question 1', exact: true }).selectOption('2')
  await expect(page.locator('#answer-count')).toHaveText('1 of 11 answered')
  await page.getByRole('button', { name: 'Exit test' }).click()
  await page.getByRole('link', { name: 'Exit to Reading' }).click()
  await page.getByRole('link', { name: 'Resume attempt' }).click()
  await expect(page.getByRole('combobox', { name: 'Question 1', exact: true })).toHaveValue('2')
})

test('mobile stacks the diagram and answer panel and scores a drill', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('link', { name: 'Practise Reading to Apply a Diagram' }).click()
  await begin(page)
  const left = await page.getByRole('region', { name: 'Flyer or schedule content' }).boundingBox()
  const right = await page.getByRole('region', { name: 'Answer choices' }).boundingBox()
  expect(left!.y + left!.height).toBeLessThan(right!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('combobox', { name: 'Question 1', exact: true }).selectOption('1')
  await expect(page.locator('#answer-count')).toHaveText('1 of 8 answered')
  await page.getByRole('button', { name: 'Finish test' }).click()
  await page.getByRole('button', { name: 'Submit test' }).click()
  await expect(page.locator('.score-card')).toContainText('1 / 8')
})
