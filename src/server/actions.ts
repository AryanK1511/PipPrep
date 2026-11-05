import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequest, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { providerSettings } from './providers.server.ts'
import { PROVIDERS } from '../lib/providers.ts'
import type { Coaching, Exam, Part, PartIndex } from '../lib/types.ts'
import { generateCoach, generatePart, ProviderError, providerAvailable } from './ai.server.js'
import type { CoachStage, ExamUpdate } from '../lib/progress.ts'
import { streamJob } from './progress.server.ts'
import * as store from './store.server.ts'
import { listJobs, startJob, dismissJob } from './jobs.server.ts'
import * as writingStore from './writing-store.server.ts'
import { evaluateWriting, generateWritingTasks } from './writing-ai.server.ts'
import { MAX_RESPONSE_LENGTH } from '../lib/writing.ts'
import type { WritingExam, WritingIndex } from '../lib/writing.ts'
import { owner, origin, ensureOwner, requireOwner, privateRead } from './session.server.ts'
import { roomForAttempt, withdrawAttempt } from './rooms.server.ts'

const id = z.uuid()
const partIndex = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
const scope = z.union([partIndex, z.literal('all')])
const writingScope = z.union([z.literal(0), z.literal(1), z.literal('all')])

const providerCookie = 'pipprep_provider'
const currentProvider = async () => (await providerSettings(getCookie(providerCookie))).selected

export const readProviderSettings = createServerFn({ method: 'GET' })
  .validator(z.object({ refresh: z.boolean().default(false) }))
  .handler(({ data }) => {
    privateRead()
    return providerSettings(getCookie(providerCookie), data.refresh)
  })
export const selectProvider = createServerFn({ method: 'POST' })
  .validator(z.enum(PROVIDERS))
  .handler(async ({ data }) => {
    const expected = origin()
    setCookie(providerCookie, data, {
      httpOnly: true, sameSite: 'lax', path: '/', secure: expected.startsWith('https:'), maxAge: 60 * 60 * 24 * 365,
    })
    return providerSettings(data)
  })

export const readDashboard = createServerFn({ method: 'GET' }).handler(() => {
  privateRead()
  return store.dashboard(owner())
})

export const readSetup = createServerFn({ method: 'GET' })
  .validator(z.object({ ready: id.optional() }))
  .handler(async ({ data }) => {
    privateRead()
    const key = owner()
    const exam = key && data.ready ? store.getExam(key, data.ready) : null
    return { ai: await providerAvailable(await currentProvider()), ready: exam ? { id: exam.id, title: exam.title } : null }
  })

export const beginAttempt = createServerFn({ method: 'POST' })
  .validator(z.object({ part: scope, timed: z.boolean(), examId: id.optional() }))
  .handler(({ data }) => {
    const key = ensureOwner(origin())
    return store.begin(key, data.part, data.timed, data.examId)
  })

export const readAttempt = createServerFn({ method: 'GET' })
  .validator(id)
  .handler(({ data }) => {
    privateRead()
    const key = owner()
    const response = key ? store.getAttempt(key, data) : null
    return response ? { ...response, roomCode: roomForAttempt(key!, data)?.code ?? null } : null
  })

export const mutateAttempt = createServerFn({ method: 'POST' })
  .validator(z.object({
    id, position: z.number().int().min(0).max(3),
    action: z.enum(['answer', 'next', 'sync']),
    question: z.number().int().min(0).max(10).optional(),
    choice: z.number().int().min(0).max(4).nullable().optional(),
  }))
  .handler(({ data }) => {
    origin()
    return store.updateAttempt(requireOwner(), data.id, data.position, data.action, data.question, data.choice)
  })

export const readResult = createServerFn({ method: 'GET' })
  .validator(id)
  .handler(({ data }) => {
    privateRead()
    const key = owner()
    return key ? store.result(key, data) : null
  })

export const deleteSavedAttempt = createServerFn({ method: 'POST' })
  .validator(id)
  .handler(({ data }) => {
    origin()
    const key = requireOwner()
    if (!withdrawAttempt(key, data)) store.deleteAttempt(key, data)
  })

const generating = new Set<string>()
const drafts = new Map<string, { parts: Map<PartIndex, Part>; expiresAt: number }>()

function rememberDraft(key: string, parts: Map<PartIndex, Part>) {
  const now = Date.now()
  for (const [draftKey, draft] of drafts) {
    if (draft.expiresAt <= now) drafts.delete(draftKey)
  }
  if (drafts.size >= 20) {
    const oldest = drafts.keys().next().value
    if (oldest) drafts.delete(oldest)
  }
  drafts.set(key, { parts, expiresAt: now + 15 * 60_000 })
}
export const newExam = createServerFn({ method: 'POST' })
  .validator(z.object({ part: scope, difficulty: z.enum(['standard', 'challenge']), mode: z.enum(['timed', 'untimed']).default('timed') }))
  .handler(async ({ data }) => {
    const key = ensureOwner(origin())
    const provider = await currentProvider()
    return startJob(key, { kind: 'reading', target: String(data.part === 'all' ? 'all' : data.part + 1), mode: data.mode, provider }, 'Could not generate a test. Please try again.', async (report, signal) => {
      const update = ({ index, stage }: ExamUpdate) => report(String(index), stage)
      if (process.env.READLINE_AI === 'off') throw new ProviderError('AI generation is switched off.')
      if (generating.has(key) || generating.size >= 2) throw new ProviderError('A test is already generating. Please try again in a moment.')
      generating.add(key)
      const draftKey = JSON.stringify([key, data.part, data.difficulty, provider])
      const prior = drafts.get(draftKey)
      drafts.delete(draftKey)
      const completed = prior && prior.expiresAt > Date.now() ? prior.parts : new Map<PartIndex, Part>()
      try {
        const indices: PartIndex[] = data.part === 'all' ? [0, 1, 2, 3] : [data.part]
        const outcomes = await Promise.allSettled(indices.map(async index => {
          if (!completed.has(index)) {
            const part = await generatePart(index, data.difficulty, store.recentTitles(key, index), signal, stage => update({ index, stage }), provider)
            completed.set(index, part)
          }
          update({ index, stage: 'ready' })
        }))
        const failed = outcomes.find(outcome => outcome.status === 'rejected')
        if (failed) throw failed.reason
        signal.throwIfAborted()
        const parts = indices.map(index => completed.get(index)!)
        const title = parts.length === 1 ? parts[0].title : `Reading mock · ${data.difficulty === 'challenge' ? 'Challenge' : 'Standard'}`
        const exam: Exam = { id: crypto.randomUUID(), title, origin: 'generated', parts }
        store.saveExam(key, exam)
        return exam.id
      } catch (error) {
        if (completed.size) rememberDraft(draftKey, completed)
        throw error
      } finally {
        generating.delete(key)
      }
    })
  })

const coaching = new Set<string>()
export const requestCoaching = createServerFn({ method: 'POST' })
  .validator(id)
  .handler(async ({ data }) => {
    origin()
    const key = requireOwner()
    const provider = roomForAttempt(key, data)?.provider ?? await currentProvider()
    return streamJob<CoachStage, Coaching>(getRequest(), 'Could not prepare coaching. Please try again.', async (update, signal) => {
      const attempt = store.result(key, data)
      if (!attempt) throw new ProviderError('This completed attempt could not be found.')
      if (attempt.coach) return attempt.coach
      if (process.env.READLINE_AI === 'off') throw new ProviderError('AI coaching is switched off.')
      if (coaching.has(data) || coaching.size >= 4) throw new ProviderError('Coaching is already running. Try again in a moment.')
      coaching.add(data)
      try {
        update('reviewing')
        const feedback = await generateCoach(attempt, signal, () => update('drafting'), provider)
        signal.throwIfAborted()
        update('saving')
        store.saveCoaching(key, data, feedback)
        return feedback
      } finally {
        coaching.delete(data)
      }
    })
  })

export const readAiStatus = createServerFn({ method: 'GET' }).handler(async () => {
  privateRead()
  return providerAvailable(await currentProvider())
})

// Writing uses the same private browser record and origin checks as Reading.
export const readWritingDashboard = createServerFn({ method: 'GET' }).handler(() => {
  privateRead()
  return writingStore.writingDashboard(owner())
})
export const readWritingSetup = createServerFn({ method: 'GET' })
  .validator(z.object({ ready: id.optional() }))
  .handler(async ({ data }) => {
    privateRead()
    const key = owner()
    const exam = key && data.ready ? writingStore.getWritingExam(key, data.ready) : null
    return { ai: await providerAvailable(await currentProvider()), ready: exam ? { id: exam.id, title: exam.title } : null }
  })
export const beginWritingAttempt = createServerFn({ method: 'POST' })
  .validator(z.object({ task: writingScope, timed: z.boolean(), examId: id.optional() }))
  .handler(({ data }) => writingStore.beginWriting(ensureOwner(origin()), data.task, data.timed, data.examId))
export const readWritingAttempt = createServerFn({ method: 'GET' }).validator(id).handler(({ data }) => {
  privateRead()
  const key = owner()
  const response = key ? writingStore.getWritingAttempt(key, data) : null
  return response ? { ...response, roomCode: roomForAttempt(key!, data)?.code ?? null } : null
})
export const mutateWritingAttempt = createServerFn({ method: 'POST' })
  .validator(z.object({ id, position: z.number().int().min(0).max(1), revision: z.number().int().min(0), action: z.enum(['save', 'next', 'sync']), response: z.string().max(MAX_RESPONSE_LENGTH).optional() }))
  .handler(({ data }) => {
    origin()
    return writingStore.updateWriting(requireOwner(), data.id, data.position, data.revision, data.action, data.response)
  })
export const readWritingResult = createServerFn({ method: 'GET' }).validator(id).handler(({ data }) => {
  privateRead()
  const key = owner()
  return key ? writingStore.writingResult(key, data) : null
})
export const deleteWritingAttempt = createServerFn({ method: 'POST' }).validator(id).handler(({ data }) => {
  origin()
  const key = requireOwner()
  if (!withdrawAttempt(key, data)) writingStore.deleteWriting(key, data)
})
export const readBackgroundJobs = createServerFn({ method: 'GET' }).handler(() => {
  privateRead()
  return listJobs(owner())
})
export const dismissBackgroundJob = createServerFn({ method: 'POST' }).validator(id).handler(({ data }) => {
  origin()
  dismissJob(requireOwner(), data)
})
export const newWritingExam = createServerFn({ method: 'POST' })
  .validator(z.object({ task: writingScope, mode: z.enum(['timed', 'untimed']).default('timed') }))
  .handler(async ({ data }) => {
    const key = ensureOwner(origin())
    const provider = await currentProvider()
    return startJob(key, { kind: 'writing', target: data.task === 'all' ? 'all' : String(data.task + 1), mode: data.mode, provider }, 'Could not generate writing prompts. Please retry.', async (update, signal) => {
      if (process.env.READLINE_AI === 'off') throw new ProviderError('AI is switched off for this PipPrep server.')
      update('prompts', 'Writing prompts')
      const indices: WritingIndex[] = data.task === 'all' ? [0, 1] : [data.task]
      const tasks = await generateWritingTasks(indices, writingStore.recentWritingTitles(key), signal, () => update('prompts', 'Checking prompt format'), provider)
      update('prompts', 'Saving prompts')
      const exam: WritingExam = { id: crypto.randomUUID(), origin: 'generated', tasks, title: tasks.length === 1 ? tasks[0].title : 'Writing mock · Fresh prompts' }
      writingStore.saveWritingExam(key, exam)
      return exam.id
    })
  })
export const requestWritingFeedback = createServerFn({ method: 'POST' }).validator(id).handler(async ({ data }) => {
  origin()
  const key = requireOwner()
  const provider = roomForAttempt(key, data)?.provider ?? await currentProvider()
  return startJob(key, { kind: 'feedback', target: data, mode: 'untimed', provider }, 'Could not assess your writing. Your responses are saved; please retry.', async (update, signal) => {
    const attempt = writingStore.writingResult(key, data)
    if (!attempt) throw new ProviderError('This completed writing attempt could not be found.')
    if (attempt.feedback) return attempt.feedback
    if (!attempt.exam.tasks.some(task => (attempt.responses[task.index] || '').trim())) throw new ProviderError('No writing was submitted. Start another attempt to get feedback.')
    if (process.env.READLINE_AI === 'off') throw new ProviderError('AI feedback is switched off for this PipPrep server.')
    update('feedback', 'Assessing all four writing dimensions')
    const feedback = await evaluateWriting(attempt, signal, () => update('feedback', 'Checking evidence and score format'), provider)
    update('feedback', 'Saving feedback')
    writingStore.saveWritingFeedback(key, data, feedback)
    return feedback
  })
})
