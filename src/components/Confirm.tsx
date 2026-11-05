import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

export function Confirm({ title, text, onClose, children }: { title: string; text: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const label = useId()
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} aria-labelledby={label} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="dialog-top"><h2 id={label}>{title}</h2></div>
    <p>{text}</p>
    <div className="dialog-actions"><button className="button secondary" onClick={onClose}>Cancel</button>{children}</div>
  </dialog>
}
