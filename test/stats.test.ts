import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { fetchOutside, keptFrom, rollUp } from '../src/daily.js'
import { openStore } from '../src/db.js'
import { products } from '../src/products/index.js'
import type { Field } from '../src/schema.js'
import { publicOf, statsOf, weekOf } from '../src/stats.js'

const store = openStore(':memory:')
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

const report = (product: string, n: number, day: string, version: string, country: string, changes = {}) => {
  store.run('insert or replace into reports values (?1, ?2, ?3, 1, ?4, ?5, ?6)', product, id(n), day, version, country, fields(changes))
  store.run(
    `insert into instances values (?1, ?2, ?3, ?3, ?4, ?4)
     on conflict (product, instance) do update set last_day = max(last_day, ?3), first_day = min(first_day, ?3)`,
    product,
    id(n),
    day,
    version,
  )
}

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
    const stats = statsOf(store, 'stats', yardhand, NOW)
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
    const { retention } = statsOf(store, 'stats', yardhand, NOW)
    expect(weekOf('2026-11-19')).toBe('2026-11-16')
    expect(retention).toEqual([
      { week: '2026-11-09', size: 1, after: [1, 1, null, null, null, null, null, null] },
      { week: '2026-11-16', size: 5, after: [5, null, null, null, null, null, null, null] },
    ])
  })

  it('are public only as totals, with no group smaller than five', async () => {
    const open = publicOf(statsOf(store, 'stats', yardhand, NOW))
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
    const few = publicOf(statsOf(store, 'few', yardhand, NOW))
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
    await fetchOutside(store, 'outside', 'escalay/yardhand', NOW, (async (url: string) =>
      Response.json(answers[url])) as typeof fetch)
    expect(store.query("select stars, downloads from outside where product = 'outside'")[0]).toEqual({
      stars: 42,
      downloads: 15,
    })
    expect(store.query("select latest from releases where product = 'outside'")[0]).toEqual({
      latest: '0.3.0',
    })
  })

  it('turns daily rows older than 13 months into monthly totals, and forgets the instances', async () => {
    expect(keptFrom(NOW)).toBe('2025-10')
    await report('old', 1, '2025-09-03', '0.1.0', 'DE', { claimed: true })
    await report('old', 1, '2025-09-20', '0.1.0', 'DE', { claimed: true })
    await report('old', 2, '2025-09-21', '0.1.0', 'DE')
    expect(rollUp(store, NOW)).toBe('2025-09')
    const totals = store.query(
      "select field, value, instances from monthly where product = 'old' and field in ('', 'claimed') order by field, value",
    )
    expect(totals).toEqual([
      { field: '', value: '', instances: 2 },
      { field: 'claimed', value: 'false', instances: 1 },
      { field: 'claimed', value: 'true', instances: 1 },
    ])
    expect(store.query("select count(*) as kept from reports where product = 'old'")[0]).toEqual({ kept: 0 })
    expect(store.query("select count(*) as kept from instances where product = 'old'")[0]).toEqual({
      kept: 0,
    })
    expect(rollUp(store, NOW)).toBeNull()
  })
})

describe('the pages', () => {
  it('show public totals to anyone and the dashboard to nobody without Access', async () => {
    const app = createApp(store, { ACCESS_TEAM: 'team', ACCESS_AUD: 'audience' })
    expect((await app.request('/yardhand')).status).toBe(200)
    expect((await app.request('/yardhand.json')).headers.get('content-type')).toContain('json')
    expect((await app.request('/admin')).status).toBe(404)
    expect((await app.request('/admin/yardhand.json')).status).toBe(404)
    expect((await app.request('/admin', { headers: { 'cf-access-jwt-assertion': 'a.b.c' } })).status).toBe(404)
    expect((await createApp(store, { ADMIN_OPEN: 'local' }).request('/admin/yardhand.json')).status).toBe(200)
  })

  it('take a report over HTTP, and stop a sender that floods', async () => {
    const app = createApp(store)
    const send = () =>
      app.request('/v1/yardhand', { method: 'POST', body: '{}', headers: { 'cf-connecting-ip': '203.0.113.7' } })
    const answers = []
    for (let index = 0; index < 22; index++) answers.push((await send()).status)
    expect(answers.slice(0, 20)).toEqual(Array(20).fill(400))
    expect(answers.slice(20)).toEqual([429, 429])
    expect((await app.request('/health')).status).toBe(200)
  })
})
