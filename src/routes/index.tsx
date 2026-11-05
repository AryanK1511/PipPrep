import { createFileRoute, Link } from '@tanstack/react-router'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { Shell } from '../components/Shell'
import { PARTS } from '../lib/reading'
import { readDashboard } from '../server/actions'

export const Route = createFileRoute('/')({
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  loader: () => readDashboard(),
  component: Home,
})

function Home() {
  const { active, entries, best } = Route.useLoaderData()
  return <Shell title="Reading">
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="status-dot" /> CELPIP-General · Reading</div>
        <h1>Reading practice</h1>
        <p>Take a full mock under the clock, then go back to the exact lines that explain each answer.</p>
        {active
          ? <Link to="/attempt/$id" params={{ id: active.id }} className="button primary"><Icon name="arrow" size={17} />Resume attempt</Link>
          : <Link to="/new/$part" params={{ part: 'all' }} className="button primary"><Icon name="arrow" size={17} />Start a practice test</Link>}
      </div>
      <img className="hero-art" src="/art.svg" alt="" width="372" height="300" />
    </section>
    <div className="stats" aria-label="Practice overview">
      <Stat icon="clock" label="Mock test time" value="43 min" detail="Four scored parts" />
      <Stat icon="chart" label="Completed attempts" value={entries.length} detail="Saved in your study record" />
      <Stat icon="target" label="Best full mock" value={best === null ? '—' : best + ' / 38'} detail="Raw score" />
    </div>
    <section className="part-section">
      <div className="section-heading"><div><h2>Practise by part</h2><p>Work on one format at a time.</p></div><Link to="/guide" className="button quiet">See the format <Icon name="arrow" size={17} /></Link></div>
      <div className="part-grid">{PARTS.map((part, index) => <Link to="/new/$part" params={{ part: String(index + 1) }} key={part.name} className="part-card" aria-label={'Practise ' + part.name}>
        <span className="part-card-top"><span className="icon-tile"><Icon name={part.icon} /></span><span className="part-number">Part 0{index + 1}</span></span>
        <strong>{part.name}</strong><span className="part-description">{part.description}</span>
        <span className="part-card-foot">{part.count} questions · {part.minutes} min <Icon name="arrow" size={18} /></span>
      </Link>)}</div>
    </section>
  </Shell>
}

function Stat({ icon, label, value, detail }: { icon: IconName; label: string; value: string | number; detail: string }) {
  return <div className="stat"><span className="icon-tile"><Icon name={icon} size={18} /></span><div><span className="stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}
