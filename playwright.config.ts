import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

const url = 'http://127.0.0.1:4275'
export default defineConfig({
  testDir: './test',
  testMatch: '*.spec.ts',
  use: { baseURL: url, channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: {
    command: 'node .output/server/index.mjs',
    url,
    env: {
      HOST: '127.0.0.1', PORT: '4275', READLINE_AI: 'off',
      READLINE_DB: join(mkdtempSync(join(tmpdir(), 'readline-browser-')), 'test.sqlite'),
    },
  },
})
