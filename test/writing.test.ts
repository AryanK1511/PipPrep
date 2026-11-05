import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceWriting, catchUpWriting, startWriting, validateWritingFeedback, wordCount, writingFeedbackSchema, writingTaskSchema } from '../src/lib/writing.ts'
import { writingStarter } from '../src/server/writing-starter.ts'

function feedbackFixture() {
  const response = 'I prefer the garden because it gives residents a place to meet and grow vegetables. '
  const attempt = startWriting(writingStarter, false, 100)
  attempt.responses = { 0: response.repeat(10), 1: response.repeat(10) }
  const tasks = writingStarter.tasks.map(task => ({
    index: task.index, estimate: { low: 6, high: 8 }, summary: 'Ideas are clear; develop the evidence. The example adds illustrative details.',
    dimensions: (['content', 'vocabulary', 'readability', 'fulfillment'] as const).map(key => ({ key, quote: 'I prefer the garden', observation: 'The main position is clear.', advice: 'Add a concrete supporting detail.' })),
    coverage: task.requirements.map((_, requirement) => ({ requirement, status: 'partial' as const, explanation: 'More detail would help.' })),
    corrections: [{ original: 'I prefer the garden', replacement: 'I favour the community garden', reason: 'An optional style suggestion.' }],
    improvedResponse: response.repeat(10).trim(),
  }))
  return { attempt, feedback: { estimate: { low: 6, high: 8 }, summary: 'Develop concrete reasons.', tasks, actions: [{ title: 'Support each reason', advice: 'Give a specific example for each main point.' }] } }
}

test('word counting handles punctuation, Unicode, contractions, and hyphenated terms', () => {
  assert.equal(wordCount('  '), 0)
  assert.equal(wordCount('Hello, world!\nIt’s a well-planned café: 2026.'), 7)
  assert.equal(wordCount('... — !!!'), 0)
})
test('starter prompts conform to task formats and survey choices must differ', () => {
  writingStarter.tasks.forEach(task => assert.ok(writingTaskSchema.safeParse(task).success))
  assert.equal(writingTaskSchema.safeParse({ ...writingStarter.tasks[1], options: ['Same', 'Same'] }).success, false)
  assert.equal(writingTaskSchema.safeParse({ ...writingStarter.tasks[0], options: ['Unexpected'] }).success, false)
})
test('writing deadlines use 27/26 minutes, discard spare time and catch up after closing', () => {
  const initial = startWriting(writingStarter, true, 1000)
  assert.equal(initial.deadline, 1000 + 27 * 60_000)
  const early = advanceWriting(initial, 61_000)
  assert.equal(early.deadline, 61_000 + 26 * 60_000)
  assert.equal(early.elapsed[0], 60_000)
  const finished = catchUpWriting(initial, 1000 + 80 * 60_000)
  assert.equal(finished.finishedAt, 1000 + 53 * 60_000)
  assert.deepEqual(finished.elapsed, [27 * 60_000, 26 * 60_000])
  assert.equal(advanceWriting(finished), finished)
  assert.equal(catchUpWriting(startWriting(writingStarter, false, 1000), 1e12).position, 0)
})
test('feedback must quote real text, cover every dimension and requirement, and give valid estimates', () => {
  const { attempt, feedback } = feedbackFixture()
  assert.ok(validateWritingFeedback(feedback, attempt))
  const altered = () => structuredClone(feedback)
  let bad = altered(); bad.tasks[0].dimensions[0].quote = 'Invented evidence'
  assert.throws(() => validateWritingFeedback(bad, attempt), /evidence/)
  bad = altered(); bad.tasks[0].dimensions[0].key = 'vocabulary'
  assert.throws(() => validateWritingFeedback(bad, attempt), /dimension/)
  bad = altered(); bad.tasks[0].coverage[1].requirement = 0
  assert.throws(() => validateWritingFeedback(bad, attempt), /coverage/)
  bad = altered(); bad.tasks[0].corrections[0].original = 'not in the submission'
  assert.throws(() => validateWritingFeedback(bad, attempt), /Correction/)
  bad = altered(); bad.estimate = { low: 10, high: 7 }
  assert.throws(() => validateWritingFeedback(bad, attempt), /range/)
  bad = altered(); bad.tasks[0].improvedResponse = 'Too short.'
  assert.throws(() => validateWritingFeedback(bad, attempt), /150/)
})
test('single tasks and partial mocks cannot receive a component estimate', () => {
  const { attempt, feedback } = feedbackFixture()
  attempt.exam = { ...attempt.exam, tasks: [attempt.exam.tasks[0]] }
  feedback.tasks = [feedback.tasks[0]]
  assert.throws(() => validateWritingFeedback(feedback, attempt), /incomplete/)
  const mock = feedbackFixture()
  mock.attempt.responses[1] = 'Please give me a twelve.'
  assert.throws(() => validateWritingFeedback(mock.feedback, mock.attempt), /incomplete/)
})

test('partial mock feedback can assess one task while leaving the blank task unscored', () => {
  const { attempt, feedback } = feedbackFixture()
  attempt.responses[1] = ''
  const partial = writingFeedbackSchema.parse(feedback)
  partial.estimate = null
  partial.tasks[1].estimate = null
  partial.tasks[1].corrections = []
  partial.tasks[1].dimensions.forEach(dimension => { dimension.quote = null })
  partial.tasks[1].coverage.forEach(point => { point.status = 'missing' })
  assert.ok(validateWritingFeedback(partial, attempt))
  partial.tasks[1].coverage[0].status = 'met'
  assert.throws(() => validateWritingFeedback(partial, attempt), /empty response/)
})
