import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createServer } from 'node:net'

const port = Number(process.env.PORT || 4175)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a number between 1 and 65535.')
let tunnel
let server
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  server?.kill('SIGTERM')
  tunnel?.kill('SIGTERM')
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())

try {
  // Refuse to tunnel an unrelated process that already owns this port.
  await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', () => reject(new Error(`Port ${port} is already in use. Stop that server or choose a different PORT.`)))
    probe.listen(port, '127.0.0.1', () => probe.close(resolve))
  })
  console.log('Starting the ngrok tunnel…')
  tunnel = spawn('ngrok', ['http', `http://127.0.0.1:${port}`, '--log=stdout', '--log-format=json', '--inspect=false'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('ngrok did not open a tunnel within 30 seconds. Check your ngrok sign-in and connection.')), 30_000)
    let failure = ''
    const lines = createInterface({ input: tunnel.stdout })
    lines.on('line', line => {
      try {
        const record = JSON.parse(line)
        if (record.url?.startsWith('https://')) { clearTimeout(timeout); resolve(new URL(record.url).origin) }
        if (record.lvl === 'eror' || record.lvl === 'error') failure = record.err || record.msg
      } catch { /* Ignore non-JSON startup messages. */ }
    })
    tunnel.stderr.on('data', chunk => { failure = (failure + chunk.toString()).slice(-4000) })
    tunnel.once('error', error => { clearTimeout(timeout); reject(new Error(error.code === 'ENOENT' ? 'Install ngrok and sign in before running pnpm host:room.' : error.message)) })
    tunnel.once('exit', code => {
      clearTimeout(timeout)
      reject(new Error(failure.trim() || `ngrok exited before opening a tunnel (${code}).`))
      if (server && !stopping) { console.error('The ngrok tunnel stopped. Closing the room server.'); stop(1) }
    })
  })
  if (!stopping) {
    server = spawn(process.execPath, ['.output/server/index.mjs'], {
      stdio: 'inherit', env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), READLINE_ORIGIN: url },
    })
    server.once('error', error => { console.error(error.message); stop(1) })
    server.once('exit', code => stop(code || 0))
    console.log(`\nHost your room at http://127.0.0.1:${port}/rooms`)
    console.log(`Friends connect at ${url}/rooms`)
    console.log('Create a room, then copy its invite link. Keep this terminal open. Press Ctrl+C to stop.\n')
  }
} catch (error) {
  if (!stopping) console.error(error instanceof Error ? error.message : 'Could not start room hosting.')
  stop(stopping ? 0 : 1)
}
