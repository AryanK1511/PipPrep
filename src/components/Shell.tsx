import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function Brand() {
  return <span className="brand"><img src="/mark.svg" alt="" width="38" height="38" /><span>Readline</span></span>
}

export function Shell({ title, children }: { title: string; children: ReactNode }) {
  return <div className="layout">
    <aside className="sidebar">
      <Link to="/" className="brand-button" aria-label="Readline home"><Brand /></Link>
      <div className="sidebar-content">
        <nav aria-label="Practice"><p className="nav-label">Practice</p>
          <Link to="/" activeOptions={{ exact: true }} className="nav-item" activeProps={{ className: 'selected' }}><Icon name="book" size={18} />Reading</Link>
          <div className="nav-item inactive"><Icon name="headphones" size={18} />Listening<small>Later</small></div>
          <div className="nav-item inactive"><Icon name="pen" size={18} />Writing<small>Later</small></div>
          <div className="nav-item inactive"><Icon name="mic" size={18} />Speaking<small>Later</small></div>
        </nav>
        <nav aria-label="Study"><p className="nav-label">Study</p>
          <Link to="/history" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="chart" size={18} />Attempt history</Link>
          <Link to="/guide" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="help" size={18} />Reading guide</Link>
        </nav>
      </div>
      <div className="sidebar-foot"><span className="status-dot" /> CELPIP-General practice</div>
    </aside>
    <main className="workspace">
      <div className="workspace-top"><span>Study room <span className="slash">/</span> {title}</span></div>
      <div className="container">{children}</div>
      <footer className="workspace-foot">Independent CELPIP practice tool</footer>
    </main>
  </div>
}

export function BackToReading() {
  return <Link to="/" className="button secondary"><Icon name="left" size={17} />Back to Reading</Link>
}
