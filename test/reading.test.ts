import test from 'node:test'
import assert from 'node:assert/strict'
import { PARTS, advance, applyAnswer, catchUp, markAttempt, referenceBands, startAttempt, validatePart } from '../src/lib/reading.ts'
import { starter } from '../src/server/starter.ts'

test('the starter has the four official scored formats', () => {
  assert.deepEqual(starter.parts.map(part => part.questions.length), [11, 8, 9, 10])
  assert.deepEqual(PARTS.map(part => part.minutes), [11, 9, 10, 13])
  assert.equal(starter.parts[1].visual?.rows.length, 4)
  assert.equal(starter.parts[2].paragraphs.length, 4)
  starter.parts.forEach((part, index) => validatePart(part, index))
})

test('a 38/38 and wrong or unanswered selections grade consistently', () => {
  const attempt = startAttempt(starter, false)
  for (const part of starter.parts) attempt.answers[part.index] = Object.fromEntries(part.questions.map((q, i) => [i, q.answer]))
  assert.equal(markAttempt(attempt).score, 38)
  attempt.answers[0]![0] = 0
  attempt.answers[2]![0] = null
  attempt.answers[3]![0] = -1
  const report = markAttempt(attempt)
  assert.equal(report.score, 35)
  assert.equal(report.unanswered, 2)
  assert.deepEqual(report.parts.map(part => part.score), [10, 8, 8, 9])
})

test('official reference bands retain overlaps and do not split levels 10 to 12', () => {
  assert.deepEqual(referenceBands(33), ['9', '10–12'])
  assert.deepEqual(referenceBands(28), ['7', '8'])
  assert.deepEqual(referenceBands(38), ['10–12'])
  assert.deepEqual(referenceBands(7), ['M'])
})

test('expired timers lock answers and account for time spent outside the tab', () => {
  const start = 1000
  let attempt = startAttempt(starter, true, start)
  attempt = applyAnswer(attempt, 0, 2, start + 100)
  const late = applyAnswer(attempt, 0, 1, start + 11 * 60_000)
  assert.equal(late.position, 1)
  assert.equal(late.answers[0]![0], 2)
  assert.equal(late.answers[1], undefined)
  const atPartFour = catchUp(late, start + 31 * 60_000)
  assert.equal(atPartFour.position, 3)
  const finished = catchUp(atPartFour, start + 45 * 60_000)
  assert.equal(finished.finishedAt, start + 43 * 60_000)
  assert.deepEqual(finished.elapsed, [11, 9, 10, 13].map(minutes => minutes * 60_000))
})

test('leaving early gives the next part its own timer', () => {
  const attempt = startAttempt(starter, true, 1000)
  const next = advance(attempt, 4000)
  assert.equal(next.deadline, 4000 + 9 * 60_000)
  assert.deepEqual(next.elapsed, [3000])
})

test('an untimed drill can clear an answer and finish on its only part', () => {
  let attempt = startAttempt({ ...starter, parts: [starter.parts[3]] }, false, 1000)
  attempt = applyAnswer(attempt, 0, 1, 2000)
  attempt = applyAnswer(attempt, 0, null, 3000)
  assert.equal(catchUp(attempt, 9_000_000), attempt)
  assert.equal(markAttempt(attempt).unanswered, 10)
  assert.equal(advance(attempt, 4000).finishedAt, 4000)
})

test('generation rejects bad evidence, paragraph keys, and misplaced blanks', () => {
  const part1 = structuredClone(starter.parts[0])
  part1.followup = part1.followup.replace('{{7}}', '{{1}}')
  assert.throws(() => validatePart(part1, 0), /blank/)
  const part2 = structuredClone(starter.parts[1])
  part2.questions[0].evidence = ['This text does not appear in the flyer.']
  assert.throws(() => validatePart(part2, 1), /exact evidence/)
  const part3 = structuredClone(starter.parts[2])
  part3.questions[0].answer = 3
  assert.throws(() => validatePart(part3, 2), /wrong paragraph/)
})
