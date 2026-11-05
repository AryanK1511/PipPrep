import { createFileRoute } from '@tanstack/react-router'
import { Shell } from '../components/Shell'
import { Icon } from '../components/Icon'
import { PARTS } from '../lib/reading'

export const Route = createFileRoute('/guide')({ component: Guide })

function Guide() {
  return <Shell title="Reading guide">
    <div className="section-heading"><div><p className="eyebrow">Test format</p><h1>Reading guide</h1><p>Four scored parts, 38 questions, 43 minutes in this mock.</p></div></div>
    <div className="guide-grid">{PARTS.map((part, index) => <article className="card guide-card" key={part.name}>
      <span className="icon-tile"><Icon name={part.icon} /></span><div><span className="eyebrow">Part 0{index + 1} · {part.count} questions · {part.minutes} min</span>
        <h2>{part.name}</h2><p>{part.description} {part.tip}</p></div></article>)}</div>
    <section className="card guide-notes"><h2>Timing and scoring</h2>
      <p>CELPIP lists 43–56 minutes for Reading. The live test may include unscored items. This mock uses the four approximate part timers published in the Reading Pro study pack.</p>
      <p>You can revise answers within the current part. When time runs out or you move forward, the part locks. Each correct answer earns one point. Wrong and unanswered choices earn zero.</p>
      <p>CELPIP’s reference bands overlap because the official test equates forms by difficulty. Use the raw score to compare your work and the explanations to review your mistakes.</p>
      <div className="guide-links">
        <a href="https://www.celpip.ca/celpip-general/" target="_blank" rel="noreferrer">Official test format <Icon name="external" size={15} /></a>
        <a href="https://instructionalproducts.paragontesting.ca/InstructionalProducts/FreeOnlineSampleTest/FOST" target="_blank" rel="noreferrer">Official practice tests <Icon name="external" size={15} /></a>
        <a href="https://www.celpip.ca/take-celpip/test-results/" target="_blank" rel="noreferrer">Official scoring chart <Icon name="external" size={15} /></a>
      </div>
    </section>
  </Shell>
}
