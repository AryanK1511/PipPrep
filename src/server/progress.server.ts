import type { JobEvent } from '../lib/progress.ts'
import { ProviderError } from './ai.server.js'

export function streamJob<Update, Result>(
  request: Request,
  fallback: string,
  work: (update: (event: Update) => void, signal: AbortSignal) => Promise<Result>,
) {
  const encoder = new TextEncoder()
  const cancellation = new AbortController()
  const signal = AbortSignal.any([request.signal, cancellation.signal])
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      function send(event: JobEvent<Update, Result>) {
        if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }
      void work(update => send({ update }), signal)
        .then(result => send({ result }))
        .catch(error => send({ error: error instanceof ProviderError ? error.message : fallback }))
        .finally(() => {
          if (!cancellation.signal.aborted) controller.close()
        })
    },
    cancel() {
      cancellation.abort()
    },
  })
  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
