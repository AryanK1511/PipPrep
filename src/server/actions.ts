import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequest, setCookie, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import type { Exam, Part, PartIndex } from '../lib/types.ts'
import { generateCoach, generatePart, ProviderError, providerAvailable } from './ai.server.js'
import * as store from './store.server.ts'
import * as writingStore from './writing-store.server.ts'
import { evaluateWriting, generateWritingTasks } from './writing-ai.server.ts'
import { MAX_RESPONSE_LENGTH } from '../lib/writing.ts'
import type { WritingExam, WritingIndex } from '../lib/writing.ts'

const id = z.uuid()
const partIndex = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
const scope = z.union([partIndex, z.literal('all')])
const writingScope = z.union([z.literal(0), z.literal(1), z.literal('all')])
const cookieName = 'readline_owner'

function owner() {
  const value = id.safeParse(getCookie(cookieName))
  return value.success ? value.data : undefined
}

function origin() {
  const request = getRequest()
  const url = new URL(request.url)
  const configured = process.env.READLINE_ORIGIN
  if (!configured && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Set READLINE_ORIGIN to the public address before accepting changes.')
  }
  const expected = configured || url.origin
  if (request.headers.get('origin') !== expected) throw new Error('Open Readline directly to make changes.')
  return expected
}

function ensureOwner(expected: string) {
  const existing = owner()
  if (existing) return existing
  const key = crypto.randomUUID()
  setCookie(cookieName, key, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: expected.startsWith('https:'), maxAge: 60 * 60 * 24 * 365,
  })
  return key
}

function requireOwner() {
  const key = owner()
  if (!key) throw new Error('Your Readline session has expired.')
  return key
}

function privateRead() {
  setResponseHeader('Cache-Control', 'private, no-store')
}

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
    return { ai: await providerAvailable(), ready: exam ? { id: exam.id, title: exam.title } : null }
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
    return key ? store.getAttempt(key, data) : null
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
    store.deleteAttempt(requireOwner(), data)
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
  .validator(z.object({ part: scope, difficulty: z.enum(['standard', 'challenge']) }))
  .handler(async ({ data }) => {
    const key = ensureOwner(origin())
    if (process.env.READLINE_AI === 'off') return { error: 'AI is switched off for this Readline server.' }
    if (generating.has(key) || generating.size >= 2) return { error: 'A test is already generating. Please try again in a moment.' }
    generating.add(key)
    const draftKey = JSON.stringify([key, data.part, data.difficulty])
    const prior = drafts.get(draftKey)
    drafts.delete(draftKey)
    const completed = prior && prior.expiresAt > Date.now() ? prior.parts : new Map<PartIndex, Part>()
    try {
      const indices: PartIndex[] = data.part === 'all' ? [0, 1, 2, 3] : [data.part]
      const signal = getRequest().signal
      const outcomes = await Promise.allSettled(indices.filter(index => !completed.has(index)).map(async index => {
        const part = await generatePart(index, data.difficulty, store.recentTitles(key, index), signal)
        completed.set(index, part)
      }))
      const failed = outcomes.find(outcome => outcome.status === 'rejected')
      if (failed) throw failed.reason
      const parts = indices.map(index => completed.get(index)!)
      const title = parts.length === 1 ? parts[0].title : `Reading mock · ${data.difficulty === 'challenge' ? 'Challenge' : 'Standard'}`
      const exam: Exam = { id: crypto.randomUUID(), title, origin: 'generated', parts }
      store.saveExam(key, exam)
      return { id: exam.id }
    } catch (error) {
      if (completed.size) rememberDraft(draftKey, completed)
      return { error: error instanceof ProviderError ? error.message : 'Readline could not generate a test. Please try again.' }
    } finally {
      generating.delete(key)
    }
  })

const coaching = new Set<string>()
export const requestCoaching = createServerFn({ method: 'POST' })
  .validator(id)
  .handler(async ({ data }) => {
    origin()
    const key = requireOwner()
    const attempt = store.result(key, data)
    if (!attempt) return { error: 'This completed attempt could not be found.' }
    if (attempt.coach) return { feedback: attempt.coach }
    if (process.env.READLINE_AI === 'off') return { error: 'AI coaching is switched off for this Readline server.' }
    if (coaching.has(data) || coaching.size >= 4) return { error: 'Coaching is already running. Try again in a moment.' }
    coaching.add(data)
    try {
      const feedback = await generateCoach(attempt)
      store.saveCoaching(key, data, feedback)
      return { feedback }
    } catch (error) {
      return { error: error instanceof ProviderError ? error.message : 'Readline could not prepare coaching. Please try again.' }
    } finally {
      coaching.delete(data)
    }
  })

export const readAiStatus = createServerFn({ method: 'GET' }).handler(() => providerAvailable())

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
    return { ai: await providerAvailable(), ready: exam ? { id: exam.id, title: exam.title } : null }
  })
export const beginWritingAttempt = createServerFn({ method: 'POST' })
  .validator(z.object({ task: writingScope, timed: z.boolean(), examId: id.optional() }))
  .handler(({ data }) => writingStore.beginWriting(ensureOwner(origin()), data.task, data.timed, data.examId))
export const readWritingAttempt = createServerFn({ method: 'GET' }).validator(id).handler(({ data }) => {
  privateRead()
  const key = owner()
  return key ? writingStore.getWritingAttempt(key, data) : null
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
  writingStore.deleteWriting(requireOwner(), data)
})
export const newWritingExam = createServerFn({ method: 'POST' }).validator(z.object({ task: writingScope })).handler(async ({ data }) => {
  const key = ensureOwner(origin())
  if (process.env.READLINE_AI === 'off') return { error: 'AI is switched off for this Readline server.' }
  if (generating.has(key) || generating.size >= 2) return { error: 'A test is already generating. Please try again in a moment.' }
  generating.add(key)
  try {
    const indices: WritingIndex[] = data.task === 'all' ? [0, 1] : [data.task]
    const tasks = await generateWritingTasks(indices, writingStore.recentWritingTitles(key), getRequest().signal)
    const exam: WritingExam = { id: crypto.randomUUID(), origin: 'generated', tasks, title: tasks.length === 1 ? tasks[0].title : 'Writing mock · Fresh prompts' }
    writingStore.saveWritingExam(key, exam)
    return { id: exam.id }
  } catch (error) {
    return { error: error instanceof ProviderError ? error.message : 'Readline could not generate writing prompts. Please try again.' }
  } finally { generating.delete(key) }
})
export const requestWritingFeedback = createServerFn({ method: 'POST' }).validator(id).handler(async ({ data }) => {
  origin()
  const key = requireOwner()
  const attempt = writingStore.writingResult(key, data)
  if (!attempt) return { error: 'This completed writing attempt could not be found.' }
  if (attempt.feedback) return { feedback: attempt.feedback }
  if (!attempt.exam.tasks.some(task => (attempt.responses[task.index] || '').trim())) return { error: 'Both responses are empty. Start another attempt to get writing feedback.' }
  if (process.env.READLINE_AI === 'off') return { error: 'AI feedback is switched off for this Readline server.' }
  if (coaching.has(data) || coaching.size >= 4) return { error: 'Feedback is already running. Try again in a moment.' }
  coaching.add(data)
  try {
    const feedback = await evaluateWriting(attempt, getRequest().signal)
    writingStore.saveWritingFeedback(key, data, feedback)
    return { feedback }
  } catch (error) {
    return { error: error instanceof ProviderError ? error.message : 'Readline could not assess your writing. Your responses are saved; please retry.' }
  } finally { coaching.delete(data) }
})
