import { getCookie, getRequest, setCookie, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

export function owner() {
  const value = z.uuid().safeParse(getCookie('readline_owner'))
  return value.success ? value.data : undefined
}

export function origin() {
  const request = getRequest()
  const url = new URL(request.url)
  const configured = process.env.READLINE_ORIGIN
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (!configured && !local) throw new Error('Set READLINE_ORIGIN to the public address before accepting changes.')
  // The host can still use localhost while guests use the configured tunnel.
  const expected = local ? url.origin : configured!
  if (request.headers.get('origin') !== expected) throw new Error('Open PipPrep directly to make changes.')
  return expected
}

export function ensureOwner(expected: string) {
  const existing = owner()
  if (existing) return existing
  const key = crypto.randomUUID()
  setCookie('readline_owner', key, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: expected.startsWith('https:'), maxAge: 60 * 60 * 24 * 365,
  })
  return key
}

export function requireOwner() {
  const key = owner()
  if (!key) throw new Error('Your PipPrep session has expired.')
  return key
}

export function privateRead() {
  setResponseHeader('Cache-Control', 'private, no-store')
}

export function inviteOrigin() {
  return process.env.READLINE_ORIGIN || new URL(getRequest().url).origin
}
