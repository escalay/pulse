import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { openStore } from '../src/db.js'

const store = openStore(':memory:')
const app = createApp(store)
const ask = (product: string) => app.request(`/v1/${product}/latest`)

describe('the update check', () => {
  it('answers null before any release is known', async () => {
    expect(await (await ask('yardhand')).json()).toEqual({ latest: null })
  })

  it('names the newest release without taking anything from the asker', async () => {
    store.run(
      'insert into releases (product, latest, fetched_at) values (?1, ?2, ?3)',
      'yardhand',
      '0.3.0',
      '2026-11-12T08:00:00Z',
    )
    const response = await ask('yardhand')
    expect(await response.json()).toEqual({ latest: '0.3.0' })
    expect(response.headers.get('cache-control')).toContain('max-age=300')
    expect(store.query('select count(*) as n from instances')).toEqual([{ n: 0 }])
  })

  it('knows only its own products', async () => {
    expect((await ask('nothing')).status).toBe(404)
  })

  it('stops one sender asking over and over', async () => {
    const asks = await Promise.all(Array.from({ length: 25 }, () => ask('yardhand')))
    expect(asks.some((response) => response.status === 429)).toBe(true)
  })
})

describe('the hourly look outside', () => {
  it('learns of a new release the next hour, not the next day', async () => {
    const { hourly } = await import('../src/daily.js')
    const github = (async (url: string) =>
      Response.json(
        String(url).endsWith('/releases?per_page=100')
          ? [{ tag_name: 'v0.4.0', draft: false, prerelease: false, assets: [] }]
          : { stargazers_count: 3 },
      )) as typeof fetch
    await hourly(store, new Date('2026-11-12T09:00:00Z'), github)
    expect(store.query("select latest from releases where product = 'yardhand'")).toEqual([{ latest: '0.4.0' }])
  })
})
