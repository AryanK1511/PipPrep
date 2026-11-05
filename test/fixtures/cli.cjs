#!/usr/bin/env node
// A real subprocess with the same input/output contracts as the two CLIs.
// Used only by tests; it never calls a model or reads real CLI credentials.
const { readFileSync, writeFileSync, appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
const state = JSON.parse(readFileSync(process.env.PIPPREP_TEST_CLI_STATE, 'utf8'))
if (args.includes('--version')) { console.log('test-cli 1.0'); process.exit(0) }
const provider = args[0] === 'auth' || args.includes('-p') ? 'claude' : 'codex'
if (args[1] === 'status') {
  const status = state[provider] || 'online'
  if (status === 'error') { console.error('Status check failed'); process.exit(2) }
  if (provider === 'claude') console.log(JSON.stringify({ loggedIn: status === 'online' }))
  else console.error(status === 'online' ? 'Logged in using ChatGPT' : 'Not logged in')
  process.exit(status === 'online' ? 0 : 1)
}
let prompt = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { prompt += chunk })
process.stdin.on('end', async () => {
  const schema = provider === 'codex' ? JSON.parse(readFileSync(args[args.indexOf('--output-schema') + 1], 'utf8')) : JSON.parse(args[args.indexOf('--json-schema') + 1])
  const partMatch = prompt.match(/^Part (\d+),/m)
  const part = partMatch ? Number(partMatch[1]) - 1 : undefined
  const response = part !== undefined && state.readingParts ? state.readingParts[part] : state.response
  if (process.env.PIPPREP_TEST_CLI_LOG) appendFileSync(process.env.PIPPREP_TEST_CLI_LOG, JSON.stringify({ provider, args, prompt, schema, part, cwd: process.cwd() }) + '\n')
  if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay))
  if (state.failure) { console.error(state.failure); process.exit(1) }
  if (part !== undefined && state.failReadingPart === part) { console.error('Temporary test provider failure'); process.exit(1) }
  if (state.malformed) { console.log('not json'); process.exit(0) }
  if (provider === 'codex') writeFileSync(args[args.indexOf('-o') + 1], JSON.stringify(response))
  else console.log(JSON.stringify(state.envelope || { subtype: 'success', is_error: false, structured_output: response }))
})
