import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

process.env.READLINE_E2E_DB ||= join(mkdtempSync(join(tmpdir(), 'readline-browser-')), 'test.sqlite')
const url = 'http://127.0.0.1:4275'
export default defineConfig({
  testDir: './test',
  testMatch: '*.spec.ts',
  testIgnore: 'providers.spec.ts',
  use: { baseURL: url, channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: {
    command: 'node .output/server/index.mjs',
    url,
    env: {
      HOST: '127.0.0.1', PORT: '4275', READLINE_AI: 'off',
      READLINE_DB: process.env.READLINE_E2E_DB,
    },
  },
})
