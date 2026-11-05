import type { WritingExam } from '../lib/writing.ts'

export const writingStarter: WritingExam = {
  id: 'writing-starter', title: 'Writing mock · Neighborhood life', origin: 'starter',
  tasks: [
    { index: 0, title: 'A canceled community class',
      scenario: 'You registered for a Saturday cooking class at your local community center. Two days before the class, the center canceled it and offered a weekday replacement. You work during the week and had already bought ingredients for the original class.',
      audience: 'The community center coordinator',
      instruction: 'Write an email to the community center coordinator in about 150–200 words. Your email should cover all of the points below.',
      requirements: ['Explain why you registered for the original class.', 'Describe how the cancellation and replacement affect you.', 'Suggest a fair solution and ask the coordinator to respond.'], options: [] },
    { index: 1, title: 'A shared neighborhood space',
      scenario: 'Your neighborhood association has funding to improve one unused space beside the community center. It is surveying residents before choosing between two projects. The budget can pay for only one project this year.',
      audience: 'The neighborhood association',
      instruction: 'Choose the option you prefer. Write about 150–200 words explaining the reasons for your choice.',
      requirements: ['Clearly state which option you prefer.', 'Explain your reasons with relevant details or examples.'],
      options: ['Create a community garden with growing plots and shared gardening tools.', 'Create an outdoor exercise area with fitness equipment and a walking path.'] },
  ],
}
