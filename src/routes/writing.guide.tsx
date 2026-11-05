import { createFileRoute, Link } from '@tanstack/react-router'
import { Shell } from '../components/Shell'
import { DIMENSIONS } from '../lib/writing'

export const Route = createFileRoute('/writing/guide')({ component: Guide })
function Guide() {
  const explanations = {
    content: 'Develop your ideas with relevant details and examples. Put them in a clear, logical order.',
    vocabulary: 'Use varied, precise words naturally. Accurate everyday language works better than forced complexity.',
    readability: 'Use clear paragraphs, useful connections, and controlled sentences. Check spelling and punctuation.',
    fulfillment: 'Address the purpose and every required point. Match your tone to the reader and aim for about 150–200 words.',
  }
  return <Shell title="Writing guide"><div className="section-heading"><div><p className="eyebrow">CELPIP-General</p><h1>Writing guide</h1><p>Based on official resources checked November 5, 2026.</p></div><Link to="/writing" className="button secondary">Back to Writing</Link></div>
    <div className="guide-grid"><section className="card guide-notes"><h2>Task 1 · Email</h2><p>27 minutes. Read the situation and identify your reader and purpose. Address every point, support it with useful detail, and use an appropriate greeting and closing.</p></section>
      <section className="card guide-notes"><h2>Task 2 · Survey response</h2><p>26 minutes. Choose one of the two options, state your preference clearly, and explain your reasons with concrete support. Either choice can produce strong writing.</p></section></div>
    <section className="card guide-notes"><h2>53 minutes, two responses</h2><p>Both tasks ask for about 150–200 words. Plan before you write and leave a few minutes to proofread. The editor shows a word count and uses your browser’s spellcheck, which may differ from the test software.</p><p>Timed practice keeps a server deadline for each task. Leaving or refreshing does not pause it. Once a task is submitted or its timer expires, it locks; unused time does not carry forward. Untimed practice gives you more room to develop and revise.</p></section>
    <div className="guide-grid">{Object.entries(DIMENSIONS).map(([key, name]) => <section className="card guide-notes" key={key}><h2>{name}</h2><p>{explanations[key as keyof typeof explanations]}</p></section>)}</div>
    <section className="card guide-notes"><h2>Understanding your estimate</h2><p>Official Writing performances are assessed by multiple trained raters. CELPIP converts their ratings into a level using its own process. PipPrep’s AI uses the public criteria and descriptors to give an uncertain practice estimate with evidence; it cannot verify your official result.</p><p>Task drills receive task feedback. A component estimate needs both responses. Very short, blank, or unassessable writing may not receive a numeric estimate. Word count is one factor; there is no automatic deduction for being one word outside the suggested range.</p><div className="guide-links">
      <a href="https://www.celpip.ca/test-format-scoring/" target="_blank" rel="noreferrer">Official format</a><a href="https://www.celpip.ca/take-celpip/test-results/" target="_blank" rel="noreferrer">Standards and scoring</a><a href="https://www.celpip.ca/score-comparison-chart/" target="_blank" rel="noreferrer">Level descriptors and samples</a><a href="https://www.celpip.ca/wp-content/uploads/2026/03/Writing-Pro-Target-9-Study-Pack-2026.pdf" target="_blank" rel="noreferrer">2026 Writing study pack</a>
    </div></section>
  </Shell>
}
