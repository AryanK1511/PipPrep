import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Icon } from './Icon'

export function Dropdown({ id, label, options, value, onChange, disabled }: {
  id: string
  label: string
  options: string[]
  value: number
  onChange: (index: number) => void
  disabled?: boolean
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLSpanElement>(null)
  const search = useRef({ text: '', time: 0 })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(value)
  const listId = id + '-options'
  const optionId = (index: number) => `${listId}-${index}`

  function placePopup() {
    const anchor = trigger.current!
    const list = popup.current!
    const rect = anchor.getBoundingClientRect()
    const width = Math.min(window.innerWidth - 24, Math.max(rect.width, 248))
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const flip = below < 260 && above > below
    Object.assign(list.style, {
      width: width + 'px',
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px',
      top: flip ? 'auto' : rect.bottom + 5 + 'px',
      bottom: flip ? window.innerHeight - rect.top + 5 + 'px' : 'auto',
      maxHeight: Math.max(0, Math.min(280, (flip ? above : below) - 5)) + 'px',
    })
  }

  function show(index: number) {
    placePopup()
    setActive(index)
    setOpen(true)
    search.current = { text: '', time: 0 }
    popup.current?.showPopover()
  }

  function choose(index: number) {
    popup.current?.hidePopover()
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
    if (!disabled && value !== index) onChange(index)
  }

  useEffect(() => {
    const list = popup.current!
    function sync() { setOpen(list.matches(':popover-open')) }
    list.addEventListener('toggle', sync)
    return () => list.removeEventListener('toggle', sync)
  }, [])

  useEffect(() => {
    if (!open) return
    const list = popup.current!
    function reposition(event: Event) {
      if (event.target === list) return
      const anchor = trigger.current!
      const rect = anchor.getBoundingClientRect()
      const pane = anchor.closest('.pane-scroll')?.getBoundingClientRect()
      const top = Math.max(0, pane?.top ?? 0)
      const bottom = Math.min(window.innerHeight, pane?.bottom ?? window.innerHeight)
      if (rect.bottom <= top || rect.top >= bottom) list.hidePopover()
      else placePopup()
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  useEffect(() => {
    if (disabled) popup.current?.hidePopover()
  }, [disabled])

  useEffect(() => {
    const list = popup.current
    const option = list?.children[active] as HTMLElement | undefined
    if (!open || !list || !option) return
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop
    if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight
    }
  }, [open, active])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    const { key } = event
    if (key === 'Tab') {
      popup.current?.hidePopover()
      return
    }
    if (key === 'Escape' && open) {
      event.preventDefault()
      popup.current?.hidePopover()
      setOpen(false)
      return
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      if (open) choose(active)
      else show(value)
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault()
      const last = options.length - 1
      const next = key === 'Home' ? 0 : key === 'End' ? last
        : open ? Math.max(0, Math.min(last, active + (key === 'ArrowDown' ? 1 : -1)))
          : key === 'ArrowUp' && value === 0 ? last : value
      if (open) setActive(next)
      else show(next)
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const time = performance.now()
      const text = (open && time - search.current.time < 650 ? search.current.text : '') + key.toLowerCase()
      const index = options.findIndex(option => option.toLowerCase().startsWith(text))
      if (index < 0) return
      event.preventDefault()
      if (open) setActive(index)
      else show(index)
      search.current = { text, time }
    }
  }

  return <span className="dropdown">
    <button ref={trigger} type="button" id={id} role="combobox" aria-label={label}
      aria-haspopup="listbox" aria-controls={listId} aria-expanded={open} aria-disabled={disabled}
      aria-activedescendant={open ? optionId(active) : undefined} data-selected={value > 0 || undefined}
      className="dropdown-trigger" popoverTarget={listId} onKeyDown={onKeyDown}
      onBlur={() => popup.current?.hidePopover()} onClick={event => {
        event.preventDefault()
        if (disabled) return
        if (open) popup.current?.hidePopover()
        else show(value)
      }}>
      <span>{options[value]}</span><Icon name="chevron" size={16} />
    </button>
    <span ref={popup} className="dropdown-list" id={listId} popover="auto" role="listbox" aria-label={label}>
      {options.map((option, index) => <span key={index} id={optionId(index)} role="option"
        aria-selected={index === value} data-active={index === active || undefined}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
        <span>{option}</span>{index === value && <Icon name="check" size={16} />}
      </span>)}
    </span>
  </span>
}
