/** The routes: reports in, the public totals out, and the full numbers for whoever Cloudflare Access lets through. */
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { type AccessSettings, allowed } from './access.js'
import type { Store } from './db.js'
import { ingest } from './ingest.js'
import { dashboard, home, numbers } from './pages.js'
import { products } from './products/index.js'
import { publicOf, statsOf } from './stats.js'
import { releases } from './tables.js'

const MINUTE = 60 * 1000
const PER_MINUTE = 20

/** At most 20 reports a minute from one sender. The counts live in memory for a minute. */
const limiter = () => {
  const counts = new Map<string, { since: number; seen: number }>()
  return (sender: string, now = Date.now()) => {
    if (counts.size > 10_000) for (const [key, entry] of counts) if (now - entry.since > MINUTE) counts.delete(key)
    const entry = counts.get(sender)
    if (!entry || now - entry.since > MINUTE) {
      counts.set(sender, { since: now, seen: 1 })
      return true
    }
    entry.seen += 1
    return entry.seen <= PER_MINUTE
  }
}

export const createApp = (store: Store, settings: AccessSettings & { GIT_SHA?: string } = {}) => {
  const app = new Hono()
  const within = limiter()

  app.get('/health', (c) => c.json({ ok: true, commit: settings.GIT_SHA ?? null }))

  app.post('/v1/:product', async (c) => {
    const sender = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown'
    if (!within(sender)) return c.text('Too many reports; one a day is enough', 429)
    return ingest(c.req.raw, store, c.req.param('product'))
  })

  // The update check: no report, no instance id, so it works for an instance with telemetry off
  app.get('/v1/:product/latest', async (c) => {
    const name = c.req.param('product')
    if (!products[name]) return c.text('Not found', 404)
    const sender = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown'
    if (!within(sender)) return c.text('Too many requests; once a day is enough', 429)
    const [release] = await store.db.select({ latest: releases.latest }).from(releases).where(eq(releases.product, name))
    return c.json({ latest: release?.latest ?? null }, 200, { 'cache-control': 'public, max-age=300' })
  })

  app.get('/', () => home())

  const admin = async (request: Request, name: string | undefined, asJson: boolean) => {
    if (!(await allowed(request, settings))) return new Response('Not found', { status: 404 })
    const product = products[name ?? Object.keys(products)[0] ?? '']
    if (!product) return new Response('Not found', { status: 404 })
    const stats = statsOf(store, name ?? Object.keys(products)[0] ?? '', product)
    return asJson ? Response.json(stats) : dashboard(stats)
  }
  app.get('/admin', (c) => admin(c.req.raw, undefined, false))
  app.get('/admin/:page', (c) => {
    const page = c.req.param('page')
    return admin(c.req.raw, page.replace(/\.json$/, ''), page.endsWith('.json'))
  })

  app.get('/:page', async (c) => {
    const page = c.req.param('page')
    const name = page.replace(/\.json$/, '')
    const product = products[name]
    if (!product) return c.text('Not found', 404)
    const open = publicOf(statsOf(store, name, product))
    return page.endsWith('.json') ? c.json(open) : numbers(open)
  })

  return app
}
