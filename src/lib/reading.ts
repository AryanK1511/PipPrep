import type { Attempt, Choice, Exam, Flyer, Part, PartView, QuestionView, Skill } from './types.ts'

export const PARTS = [
  { name: 'Reading Correspondence', short: 'Correspondence', icon: 'mail', minutes: 11, count: 11, blanks: 5, label: 'Message', description: 'Read a message and complete the reply.', tip: 'Identify the writer, recipient, and purpose before looking up details.' },
  { name: 'Reading to Apply a Diagram', short: 'Apply a Diagram', icon: 'grid', minutes: 9, count: 8, blanks: 5, label: 'Flyer or schedule', description: 'Use a visual and an email to make a decision.', tip: 'Check every constraint in the message against the same row or option.' },
  { name: 'Reading for Information', short: 'Information', icon: 'list', minutes: 10, count: 9, blanks: 0, label: 'Passage', description: 'Match statements to paragraphs A–D, or choose E.', tip: 'Match the entire claim to a paragraph. Shared keywords alone are weak evidence.' },
  { name: 'Reading for Viewpoints', short: 'Viewpoints', icon: 'comment', minutes: 13, count: 10, blanks: 5, label: 'Article', description: 'Compare opinions and complete a reader comment.', tip: 'Keep track of who holds each opinion and where they qualify it.' },
] as const

export const PARAGRAPH_OPTIONS = ['A', 'B', 'C', 'D', 'E — Not stated']
export const SKILLS: Record<Skill, string> = {
  detail: 'Finding details',
  paraphrase: 'Recognizing paraphrases',
  inference: 'Making inferences',
  purpose: 'Identifying purpose',
  constraints: 'Applying constraints',
  matching: 'Matching information',
  viewpoint: 'Comparing viewpoints',
  tone: 'Reading tone',
}

const BANDS = [
  [0, 7, 'M'], [8, 11, '3'], [10, 16, '4'], [15, 20, '5'],
  [19, 25, '6'], [24, 28, '7'], [28, 31, '8'], [31, 33, '9'], [33, 38, '10–12'],
] as const
export const referenceBands = (score: number) => BANDS.filter(([min, max]) => score >= min && score <= max).map(([, , band]) => band)

export function optionsFor(part: PartView, question: QuestionView) {
  return part.index === 2 ? PARAGRAPH_OPTIONS : question.options
}

export function markAttempt(attempt: Attempt) {
  const parts = attempt.exam.parts.map(part => {
    const items = part.questions.map((question, index) => {
      const selected = attempt.answers[part.index]?.[index]
      const answered = typeof selected === 'number' && Number.isInteger(selected) && optionsFor(part, question)[selected] !== undefined
      return { question, index, selected: answered ? selected : null, correct: answered && selected === question.answer }
    })
    return { part, items, score: items.filter(item => item.correct).length, total: items.length }
  })
  const items = parts.flatMap(part => part.items)
  return {
    parts,
    score: parts.reduce((total, part) => total + part.score, 0),
    total: items.length,
    unanswered: items.filter(item => item.selected === null).length,
  }
}

export function startAttempt(exam: Exam, timed: boolean, now = Date.now(), id: string = crypto.randomUUID()): Attempt {
  return {
    id, exam, timed, startedAt: now, position: 0, answers: {}, elapsed: [],
    partStartedAt: now, deadline: timed ? now + PARTS[exam.parts[0].index].minutes * 60_000 : null,
  }
}

export function advance(attempt: Attempt, now = Date.now()): Attempt {
  if (attempt.finishedAt) return attempt
  const end = attempt.deadline === null ? now : Math.min(now, attempt.deadline)
  const elapsed = [...attempt.elapsed, Math.max(0, end - attempt.partStartedAt)]
  const position = attempt.position + 1
  const part = attempt.exam.parts[position]
  if (!part) return { ...attempt, elapsed, deadline: null, finishedAt: end }
  return {
    ...attempt, position, elapsed, partStartedAt: end,
    deadline: attempt.timed ? end + PARTS[part.index].minutes * 60_000 : null,
  }
}

export function catchUp(attempt: Attempt, now = Date.now()): Attempt {
  while (attempt && attempt.deadline !== null && attempt.deadline <= now && !attempt.finishedAt) {
    attempt = advance(attempt, attempt.deadline)
  }
  return attempt
}

export function applyAnswer(attempt: Attempt, questionIndex: number, choice: Choice, now = Date.now()) {
  const current = catchUp(attempt, now)
  if (current !== attempt || current.finishedAt) return current
  const part = current.exam.parts[current.position]
  const question = part.questions[questionIndex]
  if (!question || (choice !== null && (!Number.isInteger(choice) || !optionsFor(part, question)[choice]))) return current
  return {
    ...current,
    answers: { ...current.answers, [part.index]: { ...current.answers[part.index], [questionIndex]: choice } },
  }
}

export function visualText(visual: Flyer) {
  return [visual.heading, visual.subtitle, ...visual.columns, ...visual.rows.flat(), visual.note].join('\n')
}

export function sourceText(part: PartView) {
  return part.visual ? visualText(part.visual) : part.paragraphs.join('\n')
}

export function promptFor(part: PartView, index: number) {
  if (part.questions[index].prompt) return part.questions[index].prompt
  const sentence = part.followup.match(new RegExp('(?:^|[.!?]\\s+|\\n)([^.!?\\n]*\\{\\{' + (index + 1) + '\\}\\}[^.!?\\n]*[.!?]?)'))
  return sentence?.[1]?.trim() || `Fill in blank ${index + 1}.`
}

export function blankIndices(index: number) {
  const { blanks, count } = PARTS[index]
  const start = index === 1 ? 0 : count - blanks
  return Array.from({ length: blanks }, (_, offset) => start + offset)
}

function ensure(condition: unknown, description: string): asserts condition {
  if (!condition) throw new Error(description)
}

function validText(value: unknown, max = 2000) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

export function validatePart(part: Part, index: number) {
  ensure(part?.index === index && validText(part.title, 100), 'Invalid part title or index')
  if (index === 1) {
    const v = part.visual
    ensure(Array.isArray(part.paragraphs) && part.paragraphs.length === 0, 'Diagram part must use the flyer')
    ensure(v && validText(v.heading, 120), 'Missing or long flyer heading')
    ensure(validText(v.subtitle, 300), 'Missing or long flyer subtitle')
    ensure(validText(v.note, 1200), 'Missing or long flyer note')
    ensure(Array.isArray(v.columns) && v.columns.length >= 2 && v.columns.length <= 5 && v.columns.every(c => validText(c, 30)), 'Invalid flyer columns')
    ensure(Array.isArray(v.rows) && v.rows.length >= 3 && v.rows.length <= 8, 'Invalid flyer rows')
    ensure(v.rows.every(row => Array.isArray(row) && row.length === v.columns.length && row.every(cell => validText(cell, 120))), 'Invalid flyer cells')
  } else {
    ensure(part.visual === null, 'Unexpected diagram')
    ensure(Array.isArray(part.paragraphs) && part.paragraphs.every(p => validText(p)), 'Invalid passage')
    ensure(index === 2 ? part.paragraphs.length === 4 : part.paragraphs.length >= 3 && part.paragraphs.length <= 10, 'Invalid paragraph count')
  }
  const blanks = blankIndices(index)
  ensure(typeof part.followup === 'string' && part.followup.length <= 2500, 'Invalid follow-up')
  const markerNumbers = Array.from(part.followup.matchAll(/\{\{(\d+)\}\}/g), match => Number(match[1]))
  ensure(markerNumbers.length === blanks.length && markerNumbers.every((marker, i) => marker === blanks[i] + 1), 'Incorrect blank order or count')
  ensure(blanks.length > 0 || part.followup === '', 'Unexpected follow-up')
  ensure(Array.isArray(part.questions) && part.questions.length === PARTS[index].count, 'Incorrect question count')
  const source = sourceText(part)
  part.questions.forEach((q, i) => {
    ensure(q && (blanks.includes(i) ? q.prompt === '' : validText(q.prompt, 350)), `Question ${i + 1} has an invalid prompt`)
    ensure(Array.isArray(q.options) && q.options.length === (index === 2 ? 0 : 4) && q.options.every(o => validText(o, 180)), `Question ${i + 1} has invalid options`)
    ensure(new Set(q.options.map(o => o.trim().toLowerCase())).size === q.options.length, `Question ${i + 1} has repeated options`)
    ensure(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < optionsFor(part, q).length, `Question ${i + 1} has an invalid answer`)
    ensure(Object.hasOwn(SKILLS, q.skill) && validText(q.explanation, 750), `Question ${i + 1} needs an explanation and skill`)
    ensure(Array.isArray(q.evidence) && q.evidence.length >= 1 && q.evidence.length <= 3 && q.evidence.every(quote => validText(quote, 450) && source.includes(quote)), `Question ${i + 1} needs exact evidence from the source`)
    if (index === 2 && q.answer < 4) ensure(q.evidence.every(quote => part.paragraphs[q.answer].includes(quote)), `Question ${i + 1} quotes the wrong paragraph`)
  })
  return part
}
