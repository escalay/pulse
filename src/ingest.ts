/**
 * `POST /v1/<product>`: one report from one instance. The day and the country are set here, never by the sender. A
 * second report on the same day replaces the first, so sending twice is harmless.
 */
import { eq } from 'drizzle-orm'
import type { Store } from './db.js'
import { products } from './products/index.js'
import { read } from './schema.js'
import { instances, releases, reports } from './tables.js'

const MAX_BYTES = 4096

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export const ingest = async (request: Request, { db }: Pick<Store, 'db'>, name: string, now = new Date()) => {
  const product = products[name]
  if (!product) return json(404, { problems: ['No such product'] })
  const text = await request.text()
  if (text.length > MAX_BYTES) return json(413, { problems: [`A report is at most ${MAX_BYTES} bytes`] })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json(400, { problems: ['The body is not JSON'] })
  }
  const result = read(product, body)
  if ('problems' in result) return json(400, { problems: result.problems })

  const { report } = result
  const day = now.toISOString().slice(0, 10)
  // The country Cloudflare saw the request come from, when it passed through Cloudflare
  const seen = request.headers.get('cf-ipcountry') ?? ''
  const country = /^[A-Z]{2}$/.test(seen) ? seen : 'XX'
  const row = { schema: report.schema, version: report.version, country, fields: JSON.stringify(report.fields) }
  await db
    .insert(reports)
    .values({ product: name, instance: report.instance, day, ...row })
    .onConflictDoUpdate({ target: [reports.product, reports.instance, reports.day], set: row })
  await db
    .insert(instances)
    .values({
      product: name,
      instance: report.instance,
      firstDay: day,
      lastDay: day,
      firstVersion: report.version,
      version: report.version,
    })
    .onConflictDoUpdate({
      target: [instances.product, instances.instance],
      set: { lastDay: day, version: report.version },
    })
  const [release] = await db.select({ latest: releases.latest }).from(releases).where(eq(releases.product, name))
  return json(200, { ok: true, latest: release?.latest ?? null })
}
