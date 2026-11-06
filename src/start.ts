import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import type { CustomFetch } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { APP_CHANGED_MESSAGE, APP_RELOAD_HEADER, APP_VERSION_HEADER, isAppOutdated, markAppOutdated } from './lib/app-version'

const version = import.meta.env.PIPPREP_BUILD_ID
const versionMiddleware = createMiddleware().server(({ request, next, handlerType }) => {
  setResponseHeader('Cache-Control', 'private, no-store')
  setResponseHeader(APP_VERSION_HEADER, version)
  if (handlerType === 'serverFn') {
    const clientVersion = request.headers.get(APP_VERSION_HEADER)
    const functionId = new URL(request.url).pathname.split('/_serverFn/')[1] || ''
    // Tabs opened before version headers existed can still carry Vite's
    // development-only file/export IDs into the built server.
    const legacyDevelopmentTab = import.meta.env.PROD && functionId.startsWith('eyJmaWxlI')
    if ((clientVersion && clientVersion !== version) || legacyDevelopmentTab) {
      return new Response(APP_CHANGED_MESSAGE, { status: 409, headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', [APP_VERSION_HEADER]: version, [APP_RELOAD_HEADER]: '1',
      } })
    }
  }
  return next()
})

const versionedFetch: CustomFetch = async (url, init) => {
  if (isAppOutdated()) throw new Error(APP_CHANGED_MESSAGE)
  const headers = new Headers(init?.headers)
  headers.set(APP_VERSION_HEADER, version)
  const response = await fetch(url, { ...init, headers, cache: 'no-store' })
  const serverVersion = response.headers.get(APP_VERSION_HEADER)
  if (response.headers.get(APP_RELOAD_HEADER) === '1' || (serverVersion && serverVersion !== version)) {
    markAppOutdated()
    throw new Error(APP_CHANGED_MESSAGE)
  }
  return response
}

export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: ({ handlerType }) => handlerType === 'serverFn' }), versionMiddleware],
  serverFns: { fetch: versionedFetch },
}))
