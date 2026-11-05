import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { defaultProvider } from '../src/lib/providers.ts'
import { providerSettings, requestModel, ProviderError } from '../src/server/providers.server.ts'

const dir = mkdtempSync(join(tmpdir(), 'pipprep-providers-'))
const statePath = join(dir, 'state.json')
const logPath = join(dir, 'log.jsonl')
const cli = new URL('./fixtures/cli.cjs', import.meta.url).pathname
process.env.READLINE_CODEX = cli
process.env.READLINE_CLAUDE = cli
process.env.PIPPREP_TEST_CLI_STATE = statePath
process.env.PIPPREP_TEST_CLI_LOG = logPath
const state = (value: object) => writeFileSync(statePath, JSON.stringify(value))
const logs = () => existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
const schema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false }

test.after(() => rmSync(dir, { recursive: true, force: true }))
test('default uses the available CLI and preserves explicit choices even when unavailable', () => {
  assert.equal(defaultProvider(undefined, { codex: 'missing', claude: 'online' }), 'claude')
  assert.equal(defaultProvider(undefined, { codex: 'online', claude: 'online' }), 'codex')
  assert.equal(defaultProvider('claude', { codex: 'online', claude: 'missing' }), 'claude')
  assert.equal(defaultProvider('bad-input', { codex: 'missing', claude: 'signed-out' }), 'claude')
})
test('status distinguishes signed in, signed out, missing and broken CLIs without model calls', async () => {
  state({ codex: 'online', claude: 'signed-out' })
  let settings = await providerSettings(undefined, true)
  assert.deepEqual(settings.providers, { codex: 'online', claude: 'signed-out' })
  state({ codex: 'signed-out', claude: 'online' })
  settings = await providerSettings(undefined, true)
  assert.equal(settings.selected, 'claude')
  assert.deepEqual(settings.providers, { codex: 'signed-out', claude: 'online' })
  const saved = process.env.READLINE_CODEX
  process.env.READLINE_CODEX = join(dir, 'absent')
  state({ claude: 'error' })
  settings = await providerSettings(undefined, true)
  assert.deepEqual(settings.providers, { codex: 'missing', claude: 'error' })
  process.env.READLINE_CODEX = saved
  assert.equal(logs().length, 0)
})
test('both providers pass prompts over stdin, use schemas, isolate work and return structured data', async () => {
  state({ response: { answer: 'ok' } })
  process.env.READLINE_MODEL = 'codex-test-model'
  process.env.READLINE_CLAUDE_MODEL = 'claude-test-model'
  const values = await Promise.all([
    requestModel('Codex prompt $() `literal`', schema, undefined, 'codex'),
    requestModel('Claude prompt', schema, undefined, 'claude'),
  ])
  assert.deepEqual(values, [{ answer: 'ok' }, { answer: 'ok' }])
  const calls = logs()
  const codex = calls.find(call => call.provider === 'codex')!
  const claude = calls.find(call => call.provider === 'claude')!
  assert.equal(codex.prompt, 'Codex prompt $() `literal`')
  assert.equal(claude.prompt, 'Claude prompt')
  assert.deepEqual(claude.schema, schema)
  assert.ok(codex.args.includes('read-only'))
  assert.equal(claude.args[claude.args.indexOf('--tools') + 1], '')
  assert.ok(claude.args.includes('--strict-mcp-config'))
  assert.ok(claude.args.includes('--no-session-persistence'))
  assert.ok(codex.args.includes('codex-test-model'))
  assert.ok(claude.args.includes('claude-test-model'))
  assert.notEqual(codex.cwd, claude.cwd)
  assert.equal(existsSync(codex.cwd), false)
  assert.equal(existsSync(claude.cwd), false)
})
test('provider errors are actionable, do not expose output and never fall back to the other CLI', async () => {
  for (const provider of ['claude', 'codex'] as const) {
    for (const [failure, message] of [['401 token expired secret-value', /authenticate/], ['429 rate_limit secret-value', /usage limit/]] as const) {
      state({ failure })
      const before = logs().length
      await assert.rejects(requestModel('prompt', schema, undefined, provider), error => {
        assert.ok(error instanceof ProviderError)
        assert.match(error.message, message)
        assert.ok(!error.message.includes('secret-value'))
        return true
      })
      assert.equal(logs().length, before + 1)
      assert.equal(logs().at(-1).provider, provider)
    }
  }
  state({ envelope: { subtype: 'error_max_structured_output_retries', is_error: true } })
  await assert.rejects(requestModel('prompt', schema, undefined, 'claude'), ProviderError)
  state({ response: { answer: 'ok' }, delay: 3000 })
  const controller = new AbortController()
  const request = requestModel('prompt', schema, controller.signal, 'claude')
  setTimeout(() => controller.abort(), 100)
  await assert.rejects(request, { name: 'AbortError' })
  state({ malformed: true })
  await assert.rejects(requestModel('prompt', schema, undefined, 'claude'), ProviderError)
})
test('server AI-off prevents model execution for either CLI while retaining installation status', async () => {
  state({ codex: 'online', claude: 'online' })
  process.env.READLINE_AI = 'off'
  const before = logs().length
  assert.equal((await providerSettings('claude', true)).enabled, false)
  for (const provider of ['codex', 'claude'] as const) await assert.rejects(requestModel('prompt', schema, undefined, provider), /switched off/)
  assert.equal(logs().length, before)
  delete process.env.READLINE_AI
})
