import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Readline · CELPIP practice' }],
    links: [{ rel: 'icon', href: '/mark.svg' }, { rel: 'stylesheet', href: '/styles.css' }],
  }),
  component: () => <Document><Outlet /></Document>,
  notFoundComponent: () => <main className="container"><h1>Page unavailable</h1><Link to="/">Back to Reading</Link></main>,
})

function Document({ children }: { children: ReactNode }) {
  return <html lang="en-CA">
    <head><HeadContent /><script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}" }} /></head>
    <body>{children}<Scripts /></body>
  </html>
}
