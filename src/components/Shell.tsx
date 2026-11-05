import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

export function Brand() {
  return <span className="brand"><img src="/mark.svg" alt="" width="38" height="38" /><span>Readline</span></span>
}

export function Shell({ children }: { title: string; children: ReactNode }) {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark')
  }, [])
  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
  }
  return <div className="layout">
    <aside className="sidebar">
      <Link to="/" className="brand-button" aria-label="Readline home"><Brand /></Link>
      <div className="sidebar-content">
        <nav aria-label="Practice"><p className="nav-label">Practice</p>
          <Link to="/" activeOptions={{ exact: true }} className="nav-item" activeProps={{ className: 'selected' }}><Icon name="book" size={18} />Reading</Link>
          <div className="nav-item inactive"><Icon name="headphones" size={18} />Listening<small>Later</small></div>
          <Link to="/writing" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="pen" size={18} />Writing</Link>
          <div className="nav-item inactive"><Icon name="mic" size={18} />Speaking<small>Later</small></div>
        </nav>
        <nav aria-label="Study"><p className="nav-label">Study</p>
          <Link to="/history" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="chart" size={18} />Attempt history</Link>
          <Link to="/guide" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="help" size={18} />Reading guide</Link>
          <Link to="/writing/guide" className="nav-item" activeProps={{ className: 'selected' }}><Icon name="help" size={18} />Writing guide</Link>
        </nav>
      </div>
      <div className="sidebar-foot"><button className="theme-toggle" onClick={toggleTheme} aria-pressed={dark}>Dark mode <span aria-hidden="true">{dark ? 'On' : 'Off'}</span></button></div>
    </aside>
    <main className="workspace">
      <div className="container">{children}</div>
    </main>
  </div>
}

export function BackToReading() {
  return <Link to="/" className="button secondary"><Icon name="left" size={17} />Back to Reading</Link>
}
