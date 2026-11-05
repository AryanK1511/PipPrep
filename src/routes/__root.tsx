import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import stylesUrl from '../styles.css?url'
import { themeScript } from '../components/ThemeToggle'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'PipPrep · CELPIP practice' }],
    links: [{ rel: 'icon', href: '/pipprep-mark.png' }, { rel: 'stylesheet', href: stylesUrl }],
  }),
  component: () => <Document><Outlet /></Document>,
  notFoundComponent: () => <main className="container"><h1>Page unavailable</h1><Link to="/">Back to Reading</Link></main>,
})

function Document({ children }: { children: ReactNode }) {
  return <html lang="en-CA" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /><HeadContent /></head>
    <body>{children}<Scripts /></body>
  </html>
}
