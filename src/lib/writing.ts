import { z } from 'zod'

export const WRITING_TASKS = [
  { name: 'Writing an Email', short: 'Email', minutes: 27, description: 'Write to a specific reader and cover every requested point.' },
  { name: 'Responding to Survey Questions', short: 'Survey response', minutes: 26, description: 'Choose between two options and support your preference with reasons.' },
] as const
export const DIMENSIONS = {
  content: 'Content / Coherence', vocabulary: 'Vocabulary', readability: 'Readability', fulfillment: 'Task Fulfillment',
} as const
export type WritingIndex = 0 | 1
export type WritingScope = WritingIndex | 'all'
export const MAX_RESPONSE_LENGTH = 12_000
export const wordCount = (text: string) => text.match(/[\p{L}\p{N}]+(?:[’'‐‑-][\p{L}\p{N}]+)*/gu)?.length ?? 0
const text = (max: number) => z.string().trim().min(1).max(max)
export const writingTaskSchema = z.object({
  index: z.union([z.literal(0), z.literal(1)]), title: text(120), scenario: text(2000),
  audience: text(200), instruction: text(700), requirements: z.array(text(350)).min(2).max(4),
  options: z.array(text(400)).max(2),
}).strict().superRefine((task, ctx) => {
  if (task.requirements.length !== (task.index === 0 ? 3 : 2)) ctx.addIssue({ code: 'custom', message: 'Email needs three requirements; survey needs two.' })
  if (task.options.length !== (task.index === 1 ? 2 : 0)) ctx.addIssue({ code: 'custom', message: 'Email has no options; survey needs exactly two options.' })
  if (new Set(task.options.map(option => option.toLowerCase())).size !== task.options.length) ctx.addIssue({ code: 'custom', message: 'Survey options must differ.' })
})
export type WritingTask = z.infer<typeof writingTaskSchema>
export interface WritingExam { id: string; title: string; origin: 'starter' | 'generated'; tasks: WritingTask[] }
const band = z.object({ low: z.number().int().min(0).max(12), high: z.number().int().min(0).max(12) }).strict()
export const writingFeedbackSchema = z.object({
  estimate: band.nullable(), summary: text(1200),
  tasks: z.array(z.object({
    index: z.union([z.literal(0), z.literal(1)]), estimate: band.nullable(), summary: text(1000),
    dimensions: z.array(z.object({
      key: z.enum(['content', 'vocabulary', 'readability', 'fulfillment']),
      observation: text(900), quote: text(500).nullable(), advice: text(700),
    }).strict()).length(4),
    coverage: z.array(z.object({ requirement: z.number().int().min(0).max(3), status: z.enum(['met', 'partial', 'missing']), explanation: text(600) }).strict()).min(2).max(4),
    corrections: z.array(z.object({ original: text(500), replacement: text(700), reason: text(600) }).strict()).max(5),
    improvedResponse: text(4000),
  }).strict()).min(1).max(2),
  actions: z.array(z.object({ title: text(100), advice: text(700) }).strict()).min(1).max(3),
}).strict()
export type WritingFeedback = z.infer<typeof writingFeedbackSchema>
export interface WritingAttempt {
  id: string; exam: WritingExam; timed: boolean; startedAt: number; position: number;
  responses: Partial<Record<WritingIndex, string>>; revision: number; elapsed: number[];
  taskStartedAt: number; deadline: number | null; finishedAt?: number; feedback?: WritingFeedback;
}
export type ActiveWritingAttempt = Omit<WritingAttempt, 'exam' | 'feedback'> & { title: string; task: WritingTask; taskIndices: WritingIndex[] }

export function startWriting(exam: WritingExam, timed: boolean, now = Date.now(), id: string = crypto.randomUUID()): WritingAttempt {
  return { id, exam, timed, startedAt: now, position: 0, responses: {}, revision: 0, elapsed: [], taskStartedAt: now,
    deadline: timed ? now + WRITING_TASKS[exam.tasks[0].index].minutes * 60_000 : null }
}
export function advanceWriting(attempt: WritingAttempt, now = Date.now()): WritingAttempt {
  if (attempt.finishedAt !== undefined) return attempt
  const end = attempt.deadline === null ? now : Math.min(now, attempt.deadline)
  const elapsed = [...attempt.elapsed, Math.max(0, end - attempt.taskStartedAt)]
  const position = attempt.position + 1
  const task = attempt.exam.tasks[position]
  if (!task) return { ...attempt, elapsed, deadline: null, finishedAt: end, revision: attempt.revision + 1 }
  return { ...attempt, position, elapsed, taskStartedAt: end, revision: attempt.revision + 1,
    deadline: attempt.timed ? end + WRITING_TASKS[task.index].minutes * 60_000 : null }
}
export function catchUpWriting(attempt: WritingAttempt, now = Date.now()) {
  while (attempt.deadline !== null && attempt.deadline <= now && attempt.finishedAt === undefined) attempt = advanceWriting(attempt, attempt.deadline)
  return attempt
}
export function validateWritingFeedback(candidate: unknown, attempt: WritingAttempt): WritingFeedback {
  const feedback = writingFeedbackSchema.parse(candidate)
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
  const checkBand = (value: WritingFeedback['estimate']) => check(value === null || value.low <= value.high, 'Invalid estimate range')
  checkBand(feedback.estimate)
  check(feedback.tasks.length === attempt.exam.tasks.length, 'Missing task feedback')
  // A task drill or a substantially incomplete mock cannot predict a component level.
  if (attempt.exam.tasks.length !== 2 || attempt.exam.tasks.some(task => wordCount(attempt.responses[task.index] || '') < 30)) {
    check(feedback.estimate === null, 'Do not estimate an incomplete component')
  }
  attempt.exam.tasks.forEach((task, i) => {
    const item = feedback.tasks[i]
    const response = attempt.responses[task.index] || ''
    check(item.index === task.index, 'Feedback task order does not match')
    checkBand(item.estimate)
    if (wordCount(response) < 30) check(item.estimate === null, 'Insufficient text for a task estimate')
    check(new Set(item.dimensions.map(dimension => dimension.key)).size === 4, 'Missing scoring dimension')
    for (const dimension of item.dimensions) {
      check(dimension.quote === null || response.includes(dimension.quote), 'Feedback evidence is not in the response')
      if (response.trim()) check(dimension.quote !== null, 'Nonempty responses need evidence for each dimension')
    }
    check(item.coverage.length === task.requirements.length && new Set(item.coverage.map(point => point.requirement)).size === task.requirements.length &&
      item.coverage.every(point => point.requirement < task.requirements.length), 'Missing requirement coverage')
    if (!response.trim()) check(item.coverage.every(point => point.status === 'missing'), 'An empty response cannot cover requirements')
    for (const correction of item.corrections) check(response.includes(correction.original), 'Correction is not in the response')
    check(wordCount(item.improvedResponse) >= 150 && wordCount(item.improvedResponse) <= 200, 'Example must be 150–200 words')
  })
  return feedback
}
