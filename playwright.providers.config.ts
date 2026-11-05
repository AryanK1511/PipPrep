import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

process.env.PIPPREP_PROVIDER_E2E_DIR ||= mkdtempSync(join(tmpdir(), 'pipprep-cli-browser-'))
const dir = process.env.PIPPREP_PROVIDER_E2E_DIR
const state = join(dir, 'state.json')
if (!process.env.TEST_WORKER_INDEX) {
  writeFileSync(state, JSON.stringify({ codex: 'online', claude: 'online' }))
  for (const provider of ['codex', 'claude']) copyFileSync('test/fixtures/cli.cjs', join(dir, provider))
}
export default defineConfig({
  testDir: './test', testMatch: 'providers.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4276', channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: {
    command: 'node .output/server/index.mjs', url: 'http://127.0.0.1:4276',
    env: {
      HOST: '127.0.0.1', PORT: '4276', READLINE_AI: 'on', READLINE_DB: join(dir, 'test.sqlite'),
      READLINE_CODEX: join(dir, 'codex'), READLINE_CLAUDE: join(dir, 'claude'),
      PIPPREP_TEST_CLI_STATE: state, PIPPREP_TEST_CLI_LOG: join(dir, 'log.jsonl'),
    },
  },
})
