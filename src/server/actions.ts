import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequest, setCookie, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import type { Coaching, Exam, Part, PartIndex } from '../lib/types.ts'
import { generateCoach, generatePart, ProviderError, providerAvailable } from './ai.server.js'
import type { CoachStage, ExamUpdate } from '../lib/progress.ts'
import { streamJob } from './progress.server.ts'
import * as store from './store.server.ts'

const id = z.uuid()
const partIndex = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
const scope = z.union([partIndex, z.literal('all')])
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
  if (request.headers.get('origin') !== expected) throw new Error('Open PipPrep directly to make changes.')
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
  if (!key) throw new Error('Your PipPrep session has expired.')
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
  .handler(({ data }) => {
    const key = ensureOwner(origin())
    return streamJob<ExamUpdate, string>(getRequest(), 'Could not generate a test. Please try again.', async (update, signal) => {
      if (process.env.READLINE_AI === 'off') throw new ProviderError('AI generation is switched off.')
      if (generating.has(key) || generating.size >= 2) throw new ProviderError('A test is already generating. Please try again in a moment.')
      generating.add(key)
      const draftKey = JSON.stringify([key, data.part, data.difficulty])
      const prior = drafts.get(draftKey)
      drafts.delete(draftKey)
      const completed = prior && prior.expiresAt > Date.now() ? prior.parts : new Map<PartIndex, Part>()
      try {
        const indices: PartIndex[] = data.part === 'all' ? [0, 1, 2, 3] : [data.part]
        const outcomes = await Promise.allSettled(indices.map(async index => {
          if (!completed.has(index)) {
            const part = await generatePart(index, data.difficulty, store.recentTitles(key, index), signal, stage => update({ index, stage }))
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
  .handler(({ data }) => {
    origin()
    const key = requireOwner()
    return streamJob<CoachStage, Coaching>(getRequest(), 'Could not prepare coaching. Please try again.', async (update, signal) => {
      const attempt = store.result(key, data)
      if (!attempt) throw new ProviderError('This completed attempt could not be found.')
      if (attempt.coach) return attempt.coach
      if (process.env.READLINE_AI === 'off') throw new ProviderError('AI coaching is switched off.')
      if (coaching.has(data) || coaching.size >= 4) throw new ProviderError('Coaching is already running. Try again in a moment.')
      coaching.add(data)
      try {
        update('reviewing')
        const feedback = await generateCoach(attempt, signal, () => update('drafting'))
        signal.throwIfAborted()
        update('saving')
        store.saveCoaching(key, data, feedback)
        return feedback
      } finally {
        coaching.delete(data)
      }
    })
  })

export const readAiStatus = createServerFn({ method: 'GET' }).handler(() => providerAvailable())
