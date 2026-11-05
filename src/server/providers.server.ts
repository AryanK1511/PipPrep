import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { defaultProvider, PROVIDERS, PROVIDER_LABELS } from '../lib/providers.ts'
import type { AiProvider, CliStatus, ProviderSettings } from '../lib/providers.ts'

const run = promisify(execFile)
export class ProviderError extends Error {}
const executable = (provider: AiProvider) => provider === 'codex'
  ? process.env.READLINE_CODEX || 'codex' : process.env.READLINE_CLAUDE || 'claude'

async function probe(provider: AiProvider): Promise<CliStatus> {
  const command = executable(provider)
  try { await run(command, ['--version'], { timeout: 5000, maxBuffer: 64_000 }) }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'error' }
  try {
    const { stdout, stderr } = await run(command, provider === 'codex' ? ['login', 'status'] : ['auth', 'status'], { timeout: 5000, maxBuffer: 64_000 })
    if (provider === 'claude') return JSON.parse(stdout).loggedIn === true ? 'online' : 'signed-out'
    return /logged in/i.test(stdout + stderr) ? 'online' : 'error'
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number }
    if (provider === 'claude') {
      try { if (JSON.parse(failure.stdout || '{}').loggedIn === false) return 'signed-out' } catch { /* Not an auth response. */ }
    }
    if (/not logged in|not authenticated|please (?:log|sign) in/i.test((failure.stdout || '') + (failure.stderr || ''))) return 'signed-out'
    return 'error'
  }
}

// Share in-flight checks and briefly cache them across page loaders and tabs.
let cached: { key: string; expires: number; result: Promise<ProviderSettings['providers']> } | undefined
export async function providerSettings(preference?: unknown, refresh = false): Promise<ProviderSettings> {
  const key = JSON.stringify(PROVIDERS.map(executable))
  if (!cached || cached.key !== key || (cached.expires <= Date.now()) || (refresh && cached.expires !== Infinity)) {
    const entry = { key, expires: Infinity, result: Promise.all(PROVIDERS.map(probe)).then(values => ({ codex: values[0], claude: values[1] })) }
    cached = entry
    void entry.result.finally(() => { entry.expires = Date.now() + 15_000 })
  }
  const providers = await cached.result
  return { selected: defaultProvider(preference, providers), providers, enabled: process.env.READLINE_AI !== 'off' }
}
export async function providerAvailable(provider: AiProvider = 'codex') {
  const settings = await providerSettings(provider)
  return settings.enabled && settings.providers[provider] === 'online'
}

export async function requestModel(prompt: string, schema: unknown, signal?: AbortSignal, provider: AiProvider = 'codex'): Promise<any> {
  if (process.env.READLINE_AI === 'off') throw new ProviderError('AI is switched off for this PipPrep server.')
  signal?.throwIfAborted()
  const label = PROVIDER_LABELS[provider]
  const login = provider === 'codex' ? 'codex login' : 'claude auth login'
  const dir = await mkdtemp(join(tmpdir(), 'pipprep-'))
  try {
    let flags: string[]
    const outputPath = join(dir, 'result.json')
    if (provider === 'codex') {
      const schemaPath = join(dir, 'schema.json')
      await writeFile(schemaPath, JSON.stringify(schema))
      flags = [
        '-a', 'never', 'exec', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
        '--ephemeral', '-C', dir, '-s', 'read-only', '--color', 'never',
        '-c', 'features.hooks=false', '-c', 'features.apps=false', '-c', 'features.plugins=false',
        '-c', 'features.memories=false', '-c', 'mcp_servers={}',
        '--output-schema', schemaPath, '-o', outputPath,
      ]
      if (process.env.READLINE_MODEL) flags.push('-m', process.env.READLINE_MODEL)
      flags.push('-')
    } else {
      flags = [
        '-p', '--output-format', 'json', '--json-schema', JSON.stringify(schema),
        '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--setting-sources', '', '--settings', '{"disableAllHooks":true}',
        '--disable-slash-commands', '--no-session-persistence', '--no-chrome',
      ]
      if (process.env.READLINE_CLAUDE_MODEL) flags.push('--model', process.env.READLINE_CLAUDE_MODEL)
    }
    const child = run(executable(provider), flags, { cwd: dir, timeout: 180_000, maxBuffer: 4_000_000, signal })
    child.child.stdin?.on('error', () => {})
    child.child.stdin?.end(prompt)
    const { stdout } = await child
    if (provider === 'codex') return JSON.parse(await readFile(outputPath, 'utf8'))
    const result = JSON.parse(stdout)
    if (result.is_error || result.subtype !== 'success') {
      throw Object.assign(new Error('Claude request failed'), { stderr: JSON.stringify(result.errors || result.result || result.subtype) })
    }
    if (!result.structured_output || typeof result.structured_output !== 'object') throw new Error('Missing structured output')
    return result.structured_output
  } catch (error) {
    if (signal?.aborted) throw error
    const failure = error as { code?: string; name?: string; killed?: boolean; stderr?: string; stdout?: string }
    if (failure.code === 'ENOENT') throw new ProviderError(`Install ${label}, run ${login}, then refresh CLI status in the sidebar.`)
    if (failure.killed) throw new ProviderError(`${label} took too long. Please try again.`)
    const detail = (failure.stderr || '') + (failure.stdout || '')
    if (/sign in|unauthorized|401|not logged in|authentication|login required|invalid.*(?:key|token)|token.*expired/i.test(detail)) {
      throw new ProviderError(`${label} could not authenticate. Run ${login} and refresh CLI status in the sidebar.`)
    }
    if (/rate.limit|usage.limit|hit your limit|credit balance|too many requests|429/i.test(detail)) {
      throw new ProviderError(`${label} reached a usage limit. Try again when your limit resets, or select another CLI in the sidebar.`)
    }
    console.warn('PipPrep AI request failed', provider, failure.code || failure.name)
    throw new ProviderError(`${label} could not finish this request. Check your CLI sign-in and connection, then try again.`)
  } finally { await rm(dir, { recursive: true, force: true }) }
}
