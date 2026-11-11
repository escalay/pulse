import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { fetchOutside, keptFrom, rollUp } from '../src/daily.js'
import { products } from '../src/products/index.js'
import type { Field } from '../src/schema.js'
import { publicOf, statsOf, weekOf } from '../src/stats.js'

const yardhand = products.yardhand as NonNullable<(typeof products)['yardhand']>
const NOW = new Date('2026-11-20T12:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const fields = (changes: Record<string, string | boolean> = {}) =>
  JSON.stringify({
    ...Object.fromEntries(
      Object.entries(yardhand.schemas[1] ?? {}).map(([key, field]: [string, Field]) => [
        key,
        field === 'flag' ? false : field.values[0],
      ]),
    ),
    ...changes,
  })

const report = (product: string, n: number, day: string, version: string, country: string, changes = {}) =>
  env.DB.batch([
    env.DB.prepare('insert or replace into reports values (?1, ?2, ?3, 1, ?4, ?5, ?6)').bind(
      product,
      id(n),
      day,
      version,
      country,
      fields(changes),
    ),
    env.DB.prepare(
      `insert into instances values (?1, ?2, ?3, ?3, ?4, ?4)
       on conflict (product, instance) do update set last_day = max(last_day, ?3), first_day = min(first_day, ?3)`,
    ).bind(product, id(n), day, version),
  ])

beforeAll(async () => {
  // Six instances this month: five in DE on 0.3.0, one in FR on 0.2.0; two made a call, one of them a week in
  for (const n of [1, 2, 3, 4, 5]) await report('stats', n, '2026-11-19', '0.3.0', 'DE', { claimed: n <= 3 })
  await report('stats', 6, '2026-11-18', '0.2.0', 'FR', { claimed: true })
  await report('stats', 1, '2026-11-10', '0.2.0', 'DE')
  await report('stats', 1, '2026-11-20', '0.3.0', 'DE', { claimed: true, calls: '1-10' })
  await report('stats', 2, '2026-11-19', '0.3.0', 'DE', { claimed: true, calls: '11-100' })
})

describe('the numbers', () => {
  it('count each instance once, by its latest report', async () => {
    const stats = await statsOf(env.DB, 'stats', yardhand, NOW)
    expect(stats.active).toEqual({ month: 6, week: 6, day: 1 })
    expect(stats.versions).toEqual([
      { label: '0.3.0', instances: 5 },
      { label: '0.2.0', instances: 1 },
    ])
    expect(stats.funnel.map(({ instances }) => instances)).toEqual([4, 0, 0, 0, 2])
    expect(stats.activation).toMatchObject({ sameDay: 1, withinWeek: 0, later: 1, notYet: 4 })
    expect(stats.fields.find(({ field }) => field === 'calls')?.values).toEqual([
      { label: '0', instances: 4 },
      { label: '1-10', instances: 1 },
      { label: '11-100', instances: 1 },
    ])
  })

  it('follow each week’s new instances into the weeks after', async () => {
    const { retention } = await statsOf(env.DB, 'stats', yardhand, NOW)
    expect(weekOf('2026-11-19')).toBe('2026-11-16')
    expect(retention).toEqual([
      { week: '2026-11-09', size: 1, after: [1, 1, null, null, null, null, null, null] },
      { week: '2026-11-16', size: 5, after: [5, null, null, null, null, null, null, null] },
    ])
  })

  it('are public only as totals, with no group smaller than five', async () => {
    const open = publicOf(await statsOf(env.DB, 'stats', yardhand, NOW))
    expect(open).toMatchObject({
      enough: true,
      active: 6,
      versions: [
        { label: '0.3.0', instances: 5 },
        { label: 'Other', instances: 1 },
      ],
      countries: [
        { label: 'DE', instances: 5 },
        { label: 'Other', instances: 1 },
      ],
    })
    expect(JSON.stringify(open)).not.toContain('FR')

    await report('few', 1, '2026-11-19', '0.3.0', 'DE')
    const few = publicOf(await statsOf(env.DB, 'few', yardhand, NOW))
    expect(few).toMatchObject({ enough: false, active: null, versions: [], countries: [] })
  })
})

describe('once a day', () => {
  it('reads the newest release, the stars and the downloads from GitHub', async () => {
    const answers: Record<string, unknown> = {
      'https://api.github.com/repos/escalay/yardhand': { stargazers_count: 42 },
      'https://api.github.com/repos/escalay/yardhand/releases?per_page=100': [
        { tag_name: 'v0.4.0-rc.1', draft: false, prerelease: true, assets: [{ download_count: 100 }] },
        { tag_name: 'v0.3.0', draft: false, prerelease: false, assets: [{ download_count: 7 }, { download_count: 5 }] },
        { tag_name: 'v0.2.0', draft: false, prerelease: false, assets: [{ download_count: 3 }] },
      ],
    }
    await fetchOutside(env.DB, 'outside', 'escalay/yardhand', NOW, (async (url: string) =>
      Response.json(answers[url])) as typeof fetch)
    expect(await env.DB.prepare("select stars, downloads from outside where product = 'outside'").first()).toEqual({
      stars: 42,
      downloads: 15,
    })
    expect(await env.DB.prepare("select latest from releases where product = 'outside'").first()).toEqual({
      latest: '0.3.0',
    })
  })

  it('turns daily rows older than 13 months into monthly totals, and forgets the instances', async () => {
    expect(keptFrom(NOW)).toBe('2025-10')
    await report('old', 1, '2025-09-03', '0.1.0', 'DE', { claimed: true })
    await report('old', 1, '2025-09-20', '0.1.0', 'DE', { claimed: true })
    await report('old', 2, '2025-09-21', '0.1.0', 'DE')
    expect(await rollUp(env.DB, NOW)).toBe('2025-09')
    const totals = await env.DB.prepare(
      "select field, value, instances from monthly where product = 'old' and field in ('', 'claimed') order by field, value",
    ).all()
    expect(totals.results).toEqual([
      { field: '', value: '', instances: 2 },
      { field: 'claimed', value: 'false', instances: 1 },
      { field: 'claimed', value: 'true', instances: 1 },
    ])
    expect(await env.DB.prepare("select count(*) as kept from reports where product = 'old'").first()).toEqual({ kept: 0 })
    expect(await env.DB.prepare("select count(*) as kept from instances where product = 'old'").first()).toEqual({
      kept: 0,
    })
    expect(await rollUp(env.DB, NOW)).toBeNull()
  })
})

describe('the pages', () => {
  it('show public totals to anyone and the dashboard to nobody without Access', async () => {
    expect((await SELF.fetch('https://pulse.example.test/yardhand')).status).toBe(200)
    expect((await SELF.fetch('https://pulse.example.test/yardhand.json')).headers.get('content-type')).toContain('json')
    expect((await SELF.fetch('https://pulse.example.test/admin')).status).toBe(404)
    expect((await SELF.fetch('https://pulse.example.test/admin/yardhand.json')).status).toBe(404)
    expect(
      (await SELF.fetch('https://pulse.example.test/admin', { headers: { 'cf-access-jwt-assertion': 'a.b.c' } })).status,
    ).toBe(404)
  })
})
