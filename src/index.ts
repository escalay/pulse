/** Pulse: anonymous usage reports from self-hosted Escalay products, kept in D1. README.md says what is kept and why. */
import { allowed } from './access.js'
import { daily } from './daily.js'
import { ingest } from './ingest.js'
import { dashboard, home, numbers } from './pages.js'
import { products } from './products/index.js'
import { publicOf, statsOf } from './stats.js'

const notFound = () => new Response('Not found', { status: 404 })

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    const report = /^\/v1\/([a-z0-9-]{1,40})$/.exec(pathname)
    if (report?.[1] && request.method === 'POST') {
      // The sender's address counts its requests for a minute and is never written anywhere
      const sender = request.headers.get('cf-connecting-ip') ?? 'unknown'
      if (env.LIMIT && !(await env.LIMIT.limit({ key: sender })).success)
        return new Response('Too many reports; one a day is enough', { status: 429 })
      return ingest(request, env, report[1])
    }
    if (request.method !== 'GET') return notFound()
    if (pathname === '/health') return new Response('ok')
    if (pathname === '/') return home()

    const admin = /^\/admin(?:\/([a-z0-9-]{1,40}?)(\.json)?)?$/.exec(pathname)
    if (admin) {
      if (!(await allowed(request, env))) return notFound()
      const name = admin[1] ?? Object.keys(products)[0] ?? ''
      const product = products[name]
      if (!product) return notFound()
      const stats = await statsOf(env.DB, name, product)
      return admin[2] ? Response.json(stats) : dashboard(stats)
    }

    const shown = /^\/([a-z0-9-]{1,40}?)(\.json)?$/.exec(pathname)
    const product = shown?.[1] ? products[shown[1]] : undefined
    if (shown?.[1] && product) {
      const open = publicOf(await statsOf(env.DB, shown[1], product))
      return shown[2] ? Response.json(open) : numbers(open)
    }
    return notFound()
  },
  async scheduled(_event, env, context) {
    context.waitUntil(daily(env))
  },
} satisfies ExportedHandler<Env>
