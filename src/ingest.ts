/**
 * `POST /v1/<product>`: one report from one instance. The day and the country are set here, never by the sender; the
 * sender's address is not read. A second report on the same day replaces the first, so sending twice is harmless.
 */
import { products } from './products/index.js'
import { read } from './schema.js'

const MAX_BYTES = 4096

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export const ingest = async (request: Request, env: Env, name: string, now = new Date()) => {
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
  const country = /^[A-Z]{2}$/.test(String(request.cf?.country ?? '')) ? String(request.cf?.country) : 'XX'
  const [, , latest] = await env.DB.batch<{ latest: string }>([
    env.DB.prepare(
      `insert into reports (product, instance, day, schema, version, country, fields) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       on conflict (product, instance, day) do update set schema = ?4, version = ?5, country = ?6, fields = ?7`,
    ).bind(name, report.instance, day, report.schema, report.version, country, JSON.stringify(report.fields)),
    env.DB.prepare(
      `insert into instances (product, instance, first_day, last_day, first_version, version) values (?1, ?2, ?3, ?3, ?4, ?4)
       on conflict (product, instance) do update set last_day = ?3, version = ?4`,
    ).bind(name, report.instance, day, report.version),
    env.DB.prepare('select latest from releases where product = ?1').bind(name),
  ])
  return json(200, { ok: true, latest: latest?.results[0]?.latest ?? null })
}
