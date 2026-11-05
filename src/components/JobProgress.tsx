import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export function JobProgress({ title, detail, steps, icon = 'sparkle' }: {
  title: string
  detail: string
  steps: { label: string; status: string; done?: boolean }[]
  icon?: IconName
}) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const start = performance.now()
    const timer = window.setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return <div className="job-progress">
    <div className="job-heading">
      <span className="icon-tile"><Icon name={icon} /></span>
      <div><strong>{title}</strong><p>{detail}</p></div>
      <span className="job-time" aria-hidden="true"><Icon name="clock" size={14} />{elapsed}</span>
    </div>
    <div className="job-track" aria-hidden="true"><span /></div>
    <ul className="job-steps" aria-live="polite">
      {steps.map(step => <li key={step.label} data-done={step.done || undefined}>
        <span className="job-dot" aria-hidden="true">{step.done && <Icon name="check" size={12} />}</span>
        <span>{step.label}</span><small>{step.status}</small>
      </li>)}
    </ul>
  </div>
}
