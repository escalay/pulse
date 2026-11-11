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
