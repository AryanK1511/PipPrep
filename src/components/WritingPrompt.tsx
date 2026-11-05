import type { WritingTask } from '../lib/writing'

export function WritingPrompt({ task }: { task: WritingTask }) {
  return <div className="writing-prompt"><h2>{task.title}</h2><p>{task.scenario}</p>
    {task.options.length > 0 && <div className="survey-options">{task.options.map((option, i) => <p key={option}><strong>Option {i === 0 ? 'A' : 'B'}</strong><span>{option}</span></p>)}</div>}
    <p><strong>Your reader:</strong> {task.audience}</p><p>{task.instruction}</p>
    <ul>{task.requirements.map(point => <li key={point}>{point}</li>)}</ul>
  </div>
}
