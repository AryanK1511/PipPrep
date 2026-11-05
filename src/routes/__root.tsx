import { AiProviderContext } from '../components/AiProvider'
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { BackgroundJobsProvider } from '../components/BackgroundJobs'
import stylesUrl from '../styles.css?url'
import { themeScript } from '../components/ThemeToggle'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'PipPrep · CELPIP practice' }],
    links: [{ rel: 'icon', href: '/pipprep-mark.png' }, { rel: 'stylesheet', href: stylesUrl }],
  }),
  component: () => <Document><AiProviderContext><BackgroundJobsProvider><Outlet /></BackgroundJobsProvider></AiProviderContext></Document>,
  notFoundComponent: () => <main className="container"><h1>Page unavailable</h1><Link to="/">Back to Reading</Link></main>,
})

function Document({ children }: { children: ReactNode }) {
  return <html lang="en-US" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /><HeadContent /></head>
    <body>{children}<Scripts /></body>
  </html>
}
