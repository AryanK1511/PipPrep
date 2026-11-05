import type { PartIndex } from './types'

export type PartStage = 'writing' | 'checking' | 'revising' | 'ready'
export type CoachStage = 'reviewing' | 'drafting' | 'saving'
export type ExamUpdate = { index: PartIndex; stage: PartStage }

export type JobEvent<Update, Result> =
  | { update: Update }
  | { result: Result }
  | { error: string }

export async function readJob<Update, Result>(
  response: Response, onUpdate: (update: Update) => void,
): Promise<Result> {
  if (!response.ok || !response.body) throw new Error('Could not start this request. Please try again.')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) throw new Error('The connection closed before the work finished. Please try again.')
      buffer += value
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const event = JSON.parse(buffer.slice(0, newline)) as JobEvent<Update, Result>
        buffer = buffer.slice(newline + 1)
        if ('error' in event) throw new Error(event.error)
        if ('result' in event) return event.result
        onUpdate(event.update)
        newline = buffer.indexOf('\n')
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
