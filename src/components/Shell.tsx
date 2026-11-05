import { AiProviderToggle } from './AiProvider'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { BackgroundJobs } from './BackgroundJobs'
import { ThemeToggle } from './ThemeToggle'

export function Brand() {
  return <span className="brand"><img src="/pipprep-mark.png" alt="" width="38" height="38" /><span>PipPrep</span></span>
}

export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return <div className="layout">
    <aside className="sidebar">
      <Link to="/" className="brand-button" aria-label="PipPrep home"><Brand /></Link>
      <div className="sidebar-content">
        <nav aria-label="Practice"><p className="nav-label">Practice</p>
          <Link to="/" activeOptions={{ exact: true }} className="nav-item" activeProps={{ className: 'selected' }}><Icon name="book" size={18} />Reading</Link>
          <div className="nav-item inactive"><Icon name="headphones" size={18} />Listening<small>Later</small></div>
          <Link to="/writing" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="pen" size={18} />Writing</Link>
          <div className="nav-item inactive"><Icon name="mic" size={18} />Speaking<small>Later</small></div>
        </nav>
        <nav aria-label="Study"><p className="nav-label">Study</p>
          <Link to="/rooms" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="comment" size={18} />Study rooms</Link>
          <Link to="/history" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="chart" size={18} />Attempt history</Link>
          <Link to="/guide" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="help" size={18} />Reading guide</Link>
          <Link to="/writing/guide" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="help" size={18} />Writing guide</Link>
        </nav>
      </div>
      <div className="sidebar-foot"><AiProviderToggle /><ThemeToggle /></div>
    </aside>
    <main className="workspace" aria-label={title}>
      <div className="container"><BackgroundJobs />{children}</div>
    </main>
  </div>
}

export function BackToReading() {
  return <Link to="/" className="button secondary"><Icon name="left" size={17} />Back to Reading</Link>
}
