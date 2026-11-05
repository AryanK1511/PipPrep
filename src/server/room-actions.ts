import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { ensureOwner, inviteOrigin, origin, owner, privateRead, requireOwner } from './session.server.ts'
import * as rooms from './rooms.server.ts'
import { providerSettings } from './providers.server.ts'
import { generatePart, providerAvailable, ProviderError } from './ai.server.js'
import { generateWritingTasks } from './writing-ai.server.ts'
import { listJobs, startJob } from './jobs.server.ts'
import { recentTitles } from './store.server.ts'
import { recentWritingTitles } from './writing-store.server.ts'
import { starter } from './starter.ts'
import { writingStarter } from './writing-starter.ts'
import type { Exam, PartIndex } from '../lib/types.ts'
import type { WritingExam, WritingIndex } from '../lib/writing.ts'

const code = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{8}$/)
const name = z.string().trim().min(1, 'Enter your name.').max(32).regex(/^[^\p{Cc}\p{Cf}]+$/u, 'Use a name without control characters.')
const roundInput = z.object({ code, roundId: z.uuid() })

export const readRooms = createServerFn({ method: 'GET' }).handler(() => {
  privateRead()
  return { rooms: rooms.listRooms(owner()), inviteOrigin: inviteOrigin() }
})
export const createStudyRoom = createServerFn({ method: 'POST' }).validator(z.object({ name })).handler(({ data }) => {
  const key = ensureOwner(origin())
  return rooms.createRoom(key, data.name)
})
export const joinStudyRoom = createServerFn({ method: 'POST' }).validator(z.object({ code, name })).handler(({ data }) => {
  rooms.joinRoom(ensureOwner(origin()), data.code, data.name)
})
export const readStudyRoom = createServerFn({ method: 'GET' }).validator(code).handler(({ data }) => {
  privateRead()
  const preview = rooms.previewRoom(data)
  return { ...preview, room: rooms.readRoom(owner(), data), inviteOrigin: inviteOrigin() }
})
export const readAttemptRoom = createServerFn({ method: 'GET' }).validator(z.uuid()).handler(({ data }) => {
  privateRead()
  const key = owner()
  const link = key && rooms.roomForAttempt(key, data)
  return link ? rooms.readRoom(key, link.code) : null
})
export const readAttemptAiStatus = createServerFn({ method: 'GET' }).validator(z.uuid()).handler(async ({ data }) => {
  privateRead()
  const key = owner()
  const link = key && rooms.roomForAttempt(key, data)
  return providerAvailable(link ? link.provider : (await providerSettings(getCookie('pipprep_provider'))).selected)
})
export const readyForRoomTest = createServerFn({ method: 'POST' }).validator(roundInput.extend({ ready: z.boolean() })).handler(({ data }) => {
  origin()
  rooms.setReady(requireOwner(), data.code, data.roundId, data.ready)
})
export const startRoomTest = createServerFn({ method: 'POST' }).validator(roundInput).handler(({ data }) => {
  origin()
  rooms.startRound(requireOwner(), data.code, data.roundId)
})
export const endRoomTest = createServerFn({ method: 'POST' }).validator(roundInput).handler(({ data }) => {
  origin()
  rooms.endRound(requireOwner(), data.code, data.roundId)
})
export const closeStudyRoom = createServerFn({ method: 'POST' }).validator(code).handler(({ data }) => {
  origin(); rooms.closeRoom(requireOwner(), data)
})
export const leaveStudyRoom = createServerFn({ method: 'POST' }).validator(z.object({ code, removeName: name.optional() })).handler(({ data }) => {
  origin(); rooms.leaveRoom(requireOwner(), data.code, data.removeName)
})
const settings = z.object({
  code, kind: z.enum(['reading', 'writing']), scope: z.union([z.literal('all'), z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  timed: z.boolean(), source: z.enum(['starter', 'generated']), difficulty: z.enum(['standard', 'challenge']),
}).refine(data => data.kind === 'reading' || data.scope === 'all' || data.scope < 2, { message: 'Writing has only two tasks.' })
export const prepareRoomTest = createServerFn({ method: 'POST' }).validator(settings).handler(async ({ data }) => {
  const key = requireOwner()
  origin(); rooms.requireRoomHost(key, data.code)
  const provider = (await providerSettings(getCookie('pipprep_provider'))).selected
  if (data.source === 'generated' && !await providerAvailable(provider)) throw new Error('Select a signed-in CLI on the host to generate a test.')
  if (data.source === 'generated' && listJobs(key).some(job => job.state === 'running' && job.kind !== 'feedback')) throw new Error('Wait for your current generation to finish first.')
  let exam: Exam | WritingExam | null = null
  if (data.source === 'starter') {
    if (data.kind === 'reading') {
      const parts = data.scope === 'all' ? starter.parts : [starter.parts[data.scope]]
      exam = { ...starter, id: crypto.randomUUID(), parts, title: parts.length === 1 ? parts[0].title : starter.title }
    } else {
      const tasks = data.scope === 'all' ? writingStarter.tasks : [writingStarter.tasks[data.scope as WritingIndex]]
      exam = { ...writingStarter, id: crypto.randomUUID(), tasks, title: tasks.length === 1 ? tasks[0].title : writingStarter.title }
    }
  }
  const roundId = rooms.prepareRound(key, data.code, data, provider, exam)
  if (exam) return
  try {
    const job = startJob(key, { kind: 'room', target: `${data.code}:${roundId}`, mode: data.timed ? 'timed' : 'untimed', provider }, 'Could not generate the room test. Prepare another test to retry.', async (update, signal) => {
      try {
        let generated: Exam | WritingExam
        if (data.kind === 'reading') {
          const indices: PartIndex[] = data.scope === 'all' ? [0, 1, 2, 3] : [data.scope]
          const results = await Promise.allSettled(indices.map(index => generatePart(index, data.difficulty, recentTitles(key, index), signal, stage => update(String(index), `Part ${index + 1}: ${stage}`), provider)))
          const failed = results.find(result => result.status === 'rejected')
          if (failed) throw failed.reason
          const parts = results.map(result => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof generatePart>>>).value)
          generated = { id: crypto.randomUUID(), origin: 'generated', title: parts.length === 1 ? parts[0].title : `Reading mock · ${data.difficulty === 'challenge' ? 'Challenge' : 'Standard'}`, parts }
        } else {
          const indices: WritingIndex[] = data.scope === 'all' ? [0, 1] : [data.scope as WritingIndex]
          update('prompts', 'Writing shared prompts')
          const tasks = await generateWritingTasks(indices, recentWritingTitles(key), signal, () => update('prompts', 'Checking shared prompts'), provider)
          generated = { id: crypto.randomUUID(), origin: 'generated', tasks, title: tasks.length === 1 ? tasks[0].title : 'Writing mock · Fresh prompts' }
        }
        signal.throwIfAborted()
        rooms.finishRoomGeneration(data.code, roundId, generated)
        return roundId
      } catch (failure) {
        rooms.failRoomGeneration(data.code, roundId, failure instanceof ProviderError ? failure.message : 'Could not generate this test. The host can retry or choose a starter test.')
        throw failure
      }
    })
    rooms.attachRoomJob(key, data.code, roundId, job.id)
  } catch (failure) {
    rooms.failRoomGeneration(data.code, roundId, failure instanceof Error ? failure.message : 'Could not start generation.')
    throw failure
  }
})
