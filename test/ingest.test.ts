import { describe, expect, it } from 'vitest'
import { openStore } from '../src/db.js'
import { ingest } from '../src/ingest.js'
import { products } from '../src/products/index.js'
import type { Field } from '../src/schema.js'

const store = openStore(':memory:')
const INSTANCE = '3f0c1a52-7b1e-4c7a-9d53-0a6f1b2c3d4e'

/** A report with the first allowed value of every field of the product's schema. */
const reportOf = (product: string, schema: number) =>
  Object.fromEntries(
    Object.entries(products[product]?.schemas[schema] ?? {}).map(([key, field]: [string, Field]) => [
      key,
      field === 'flag' ? false : field.values[0],
    ]),
  )

const body = (changes: Record<string, unknown> = {}) => ({
  schema: 1,
  instance: INSTANCE,
  version: '0.3.0',
  report: reportOf('yardhand', 1),
  ...changes,
})

const send = (payload: unknown, at = '2026-11-12T08:00:00Z', product = 'yardhand') =>
  ingest(
    new Request(`https://pulse.example.test/v1/${product}`, {
      method: 'POST',
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
      headers: { 'cf-ipcountry': 'DE' },
    }),
    store,
    product,
    new Date(at),
  )

const rows = (sql: string) => store.query<Record<string, unknown>>(sql)

describe('a report', () => {
  it('is kept once a day per instance, with the day and country set here', async () => {
    expect((await send(body())).status).toBe(200)
    await send(body({ version: '0.3.1' }), '2026-11-12T20:00:00Z')
    await send(body({ version: '0.3.1' }), '2026-11-13T08:00:00Z')

    expect(await rows(`select day, version, country from reports where instance = '${INSTANCE}' order by day`)).toEqual([
      { day: '2026-11-12', version: '0.3.1', country: 'DE' },
      { day: '2026-11-13', version: '0.3.1', country: 'DE' },
    ])
    expect(await rows('select first_day, last_day, first_version, version from instances')).toEqual([
      { first_day: '2026-11-12', last_day: '2026-11-13', first_version: '0.3.0', version: '0.3.1' },
    ])
  })

  it('is answered with the newest release once one is known', async () => {
    expect(await (await send(body())).json()).toEqual({ ok: true, latest: null })
    store.run("insert into releases values ('yardhand', '0.4.0', '2026-11-12T00:00:00Z')")
    expect(await (await send(body())).json()).toEqual({ ok: true, latest: '0.4.0' })
  })

  it('is refused whole when it carries anything its schema does not name', async () => {
    const before = await rows('select count(*) as kept from reports')
    const extra = await send(body({ report: { ...reportOf('yardhand', 1), host: 'gateway.example.test' } }))
    expect(extra.status).toBe(400)
    expect(await extra.json()).toEqual({ problems: ['report.host: not a field of this schema'] })

    const outside = await send(body({ email: 'someone@example.test' }))
    expect(await outside.json()).toEqual({ problems: ['Unknown field: email'] })
    expect(await rows('select count(*) as kept from reports')).toEqual(before)
  })

  it('is refused when a value is not one the field allows, a field is missing, or the sender is not a random id', async () => {
    const { calls, ...missing } = reportOf('yardhand', 1)
    const response = await send(body({ instance: 'my-server', report: { ...missing, tools: '37', claimed: 'yes' } }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ problems: ['instance: not a random UUID'] })

    const fields = await send(body({ report: { ...missing, tools: '37', claimed: 'yes' } }))
    expect(await fields.json()).toEqual({
      problems: [
        'report.claimed: true or false',
        'report.tools: one of 0, 1-10, 11-100, 101-1k, 1k-10k, 10k+',
        'report.calls: missing',
      ],
    })
  })

  it('is refused when it is too big, not JSON, of a schema never released, or for a product nobody registered', async () => {
    expect((await send('x'.repeat(5000))).status).toBe(413)
    expect((await send('{nope')).status).toBe(400)
    expect(await (await send(body({ schema: 9 }))).json()).toEqual({ problems: ['schema: not a schema of this product'] })
    expect((await send(body(), undefined, 'unknown')).status).toBe(404)
  })
})

describe('a Mailroom report', () => {
  const mailroomBody = (report: Record<string, unknown> = reportOf('mailroom', 1)) => ({
    schema: 1,
    instance: '9b2d4f61-1c3e-4a5b-8c7d-6e5f4a3b2c1d',
    version: '0.4.0',
    report,
  })

  it('is kept when it has every field of schema 1', async () => {
    expect((await send(mailroomBody(), '2026-11-12T08:00:00Z', 'mailroom')).status).toBe(200)
  })

  it('is refused with a field its schema does not name', async () => {
    const response = await send(mailroomBody({ ...reportOf('mailroom', 1), address_names: 'x' }), '2026-11-12T08:00:00Z', 'mailroom')
    expect(response.status).toBe(400)
  })
})
