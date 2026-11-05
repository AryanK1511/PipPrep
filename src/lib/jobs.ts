import type { AiProvider } from './providers.ts'
import type { WritingFeedback } from './writing.ts'
export type JobKind = 'reading' | 'writing' | 'feedback' | 'room'
export type BackgroundJob = {
  provider?: AiProvider
  id: string
  kind: JobKind
  target: string
  mode: 'timed' | 'untimed'
  state: 'running' | 'ready' | 'failed'
  startedAt: number
  updates: Record<string, string>
  result?: string | WritingFeedback
  error?: string
}
