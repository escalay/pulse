/** Pulse: anonymous usage reports from self-hosted Escalay products, kept in D1. README.md says what is kept and why. */
import { ingest } from './ingest.js'

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    const report = /^\/v1\/([a-z0-9-]{1,40})$/.exec(pathname)
    if (report?.[1] && request.method === 'POST') return ingest(request, env, report[1])
    if (pathname === '/health') return new Response('ok')
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
