import { expect, test } from '@playwright/test'
import { APP_CHANGED_MESSAGE, APP_RELOAD_HEADER, APP_VERSION_HEADER } from '../src/lib/app-version.ts'

test('built servers reject development IDs and mismatched builds with reload instructions before dispatch', async ({ request, baseURL }) => {
  const html = await request.get('/rooms')
  expect(html.status()).toBe(200)
  expect(html.headers()['cache-control']).toContain('no-store')
  expect(html.headers()[APP_VERSION_HEADER]).toBeTruthy()
  const developmentId = Buffer.from(JSON.stringify({ file: '/src/server/room-actions.ts?tss-serverfn-split', export: 'createStudyRoom_createServerFn_handler' })).toString('base64url')
  for (const method of ['get', 'post'] as const) {
    const response = await request[method](`/_serverFn/${developmentId}`, { headers: { Origin: baseURL! } })
    expect(response.status()).toBe(409)
    expect(response.headers()[APP_RELOAD_HEADER]).toBe('1')
    expect(await response.text()).toBe(APP_CHANGED_MESSAGE)
    expect(response.headers()['set-cookie']).toBeUndefined()
  }
  const mismatch = await request.post(`/_serverFn/${'0'.repeat(64)}`, { headers: { Origin: baseURL!, [APP_VERSION_HEADER]: 'previous-build' } })
  expect(mismatch.status()).toBe(409)
  expect(mismatch.headers()[APP_RELOAD_HEADER]).toBe('1')
  const crossSite = await request.post(`/_serverFn/${developmentId}`, { headers: { Origin: 'https://untrusted.example' } })
  expect(crossSite.status()).toBe(403)
})

test('a stale writing tab preserves its text, stops requests, and reconnects after an explicit reload', async ({ page }) => {
  await page.goto('/writing/new/1')
  await page.getByRole('radio', { name: /^Untimed/ }).check()
  await page.getByRole('button', { name: 'Begin writing', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Your response', exact: true })).toBeVisible()
  const url = page.url()
  let rejected = 0
  await page.route('**/_serverFn/**', async route => {
    const request = route.request()
    if (request.method() !== 'POST') return route.continue()
    expect(request.headers()[APP_VERSION_HEADER]).toBeTruthy()
    rejected++
    // Reproduce an open development tab calling a newly started built server.
    await route.continue({ headers: { ...request.headers(), [APP_VERSION_HEADER]: 'development' } })
  })
  const text = 'My unsaved writing stays available while I reconnect to the updated app.'
  await page.getByRole('textbox', { name: 'Your response', exact: true }).fill(text)
  await expect(page.getByRole('alert').filter({ hasText: 'Reload PipPrep to reconnect' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Your response', exact: true })).toHaveValue(text)
  expect(page.url()).toBe(url)
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Not saved')
  // Another save fails locally instead of repeatedly calling the incompatible server.
  await page.getByRole('button', { name: 'Retry save', exact: true }).click()
  expect(rejected).toBe(1)
  await page.unroute('**/_serverFn/**')
  await page.getByRole('button', { name: 'Reload app', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Your response', exact: true })).toHaveValue(text)
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved')
  await expect(page.getByRole('button', { name: 'Reload app', exact: true })).toHaveCount(0)
})
