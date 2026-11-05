import { createFileRoute, Link } from '@tanstack/react-router'
import { Shell } from '../components/Shell'
import { Icon } from '../components/Icon'
import { WRITING_TASKS } from '../lib/writing'
import { readWritingDashboard } from '../server/actions'

export const Route = createFileRoute('/writing/')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }), loader: () => readWritingDashboard(), component: WritingHome,
})
function WritingHome() {
  const { active, entries } = Route.useLoaderData()
  return <Shell title="Writing">
    <section className="hero"><div className="hero-copy">
      <div className="eyebrow"><span className="status-dot" />CELPIP-General · Writing</div>
      <h1>Writing practice</h1><p>Find your words under the clock. Get a practice level estimate and feedback grounded in your writing.</p>
      {active ? <Link to="/writing/attempt/$id" params={{ id: active.id }} className="button primary"><Icon name="arrow" size={17} />Resume writing</Link>
        : <Link to="/writing/new/$task" params={{ task: 'all' }} className="button primary"><Icon name="pen" size={17} />Start a writing test</Link>}
    </div><img className="hero-art" src="/art.svg" alt="" width="372" height="300" /></section>
    <div className="stats" aria-label="Writing overview">
      <div className="stat"><span className="icon-tile"><Icon name="clock" /></span><div><span className="stat-label">Full mock</span><strong>53 min</strong><small>27-minute email · 26-minute survey</small></div></div>
      <div className="stat"><span className="icon-tile"><Icon name="pen" /></span><div><span className="stat-label">Each response</span><strong>150–200</strong><small>Words, approximately</small></div></div>
      <div className="stat"><span className="icon-tile"><Icon name="chart" /></span><div><span className="stat-label">Completed attempts</span><strong>{entries.length}</strong><small>Responses and feedback saved</small></div></div>
    </div>
    <section><div className="section-heading"><div><h2>Practise by task</h2><p>Develop one format at a time.</p></div><Link to="/writing/guide" className="button quiet">Writing guide<Icon name="arrow" size={17} /></Link></div>
      <div className="part-grid writing-task-grid">{WRITING_TASKS.map((task, index) => <Link to="/writing/new/$task" params={{ task: String(index + 1) }} key={task.name} className="part-card" aria-label={'Practise ' + task.name}>
        <span className="part-card-top"><span className="icon-tile"><Icon name={index === 0 ? 'mail' : 'comment'} /></span><span className="part-number">Task 0{index + 1}</span></span>
        <strong>{task.name}</strong><span className="part-description">{task.description}</span><span className="part-card-foot">150–200 words · {task.minutes} min<Icon name="arrow" size={18} /></span>
      </Link>)}</div>
    </section>
    <section className="card guide-notes"><h2>Feedback you can use</h2><p>Review all four CELPIP writing dimensions, check each requirement, and see specific corrections and an illustrative revision. AI estimates are for practice; official scores come from CELPIP raters.</p><Link to="/history" className="button quiet">Review past writing<Icon name="arrow" size={17} /></Link></section>
  </Shell>
}
