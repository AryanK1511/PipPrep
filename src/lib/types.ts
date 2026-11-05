export type PartIndex = 0 | 1 | 2 | 3
export type Skill = 'detail' | 'paraphrase' | 'inference' | 'purpose' | 'constraints' | 'matching' | 'viewpoint' | 'tone'
export type Choice = number | null

export interface Flyer {
  heading: string
  subtitle: string
  columns: string[]
  rows: string[][]
  note: string
}

export interface Question {
  prompt: string
  options: string[]
  answer: number
  skill: Skill
  evidence: string[]
  explanation: string
}

export interface Part {
  index: PartIndex
  title: string
  paragraphs: string[]
  visual: Flyer | null
  followup: string
  questions: Question[]
}

export interface Exam {
  id: string
  title: string
  origin: 'starter' | 'generated'
  parts: Part[]
}

export interface Coaching {
  summary: string
  patterns?: string
  gaps?: string
  priority?: string
  actions: { title: string; advice: string }[]
}

export interface Attempt {
  id: string
  exam: Exam
  timed: boolean
  startedAt: number
  position: number
  answers: Partial<Record<PartIndex, Record<number, Choice>>>
  elapsed: number[]
  partStartedAt: number
  deadline: number | null
  finishedAt?: number
  coach?: Coaching
}

export type QuestionView = Pick<Question, 'prompt' | 'options'>
export type PartView = Omit<Part, 'questions'> & { questions: QuestionView[] }
export type ActiveAttempt = Omit<Attempt, 'exam' | 'finishedAt' | 'coach'> & {
  title: string
  part: PartView
  partIndices: PartIndex[]
}
