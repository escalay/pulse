/**
 * Once a day: each product's newest release, stars and release downloads from GitHub (public numbers, asked without
 * a token), and the roll-up that turns daily rows older than 13 months into monthly totals with no instance ids.
 */
import type { Store } from './db.js'
import { products } from './products/index.js'
import { dayOf } from './stats.js'

const KEEP_MONTHS = 13
const GITHUB = { accept: 'application/vnd.github+json', 'user-agent': 'escalay-pulse' }

type Release = { tag_name: string; draft: boolean; prerelease: boolean; assets: { download_count: number }[] }

export const fetchOutside = async (store: Pick<Store, 'run' | 'together'>, name: string, repo: string, now: Date, fetchImpl = fetch) => {
  const [about, releases] = await Promise.all(
    [`https://api.github.com/repos/${repo}`, `https://api.github.com/repos/${repo}/releases?per_page=100`].map((url) =>
      fetchImpl(url, { headers: GITHUB }).then((response) => {
        if (!response.ok) throw new Error(`${url} answered ${response.status}`)
        return response.json()
      }),
    ),
  )
  const published = (releases as Release[]).filter((release) => !release.draft && !release.prerelease)
  const downloads = published.flatMap((release) => release.assets).reduce((sum, asset) => sum + asset.download_count, 0)
  const latest = published[0]?.tag_name.replace(/^v/, '')
  store.together(() => {
    store.run(
      `insert into outside (product, day, stars, downloads) values (?1, ?2, ?3, ?4)
       on conflict (product, day) do update set stars = ?3, downloads = ?4`,
      name,
      dayOf(now),
      Number((about as { stargazers_count: number }).stargazers_count),
      downloads,
    )
    if (latest)
      store.run(
        `insert into releases (product, latest, fetched_at) values (?1, ?2, ?3)
         on conflict (product) do update set latest = ?2, fetched_at = ?3`,
        name,
        latest,
        now.toISOString(),
      )
  })
}

/** The first month whose daily rows are still kept. */
export const keptFrom = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - KEEP_MONTHS, 1)).toISOString().slice(0, 7)

/** Rolls up the oldest month past keeping, one a run: its totals are written, then its rows and lapsed instances go. */
export const rollUp = (store: Pick<Store, 'query' | 'run' | 'together'>, now: Date) => {
  const cutoff = `${keptFrom(now)}-01`
  const month = store.query<{ day: string | null }>('select min(day) as day from reports where day < ?1', cutoff)[0]?.day?.slice(0, 7)
  if (!month) return null
  const rows = store.query<{ product: string; fields: string }>(
    `select r.product, r.fields from reports r
     join (select product, instance, max(day) as day from reports where substr(day, 1, 7) = ?1 group by product, instance) last
       on r.product = last.product and r.instance = last.instance and r.day = last.day`,
    month,
  )
  const totals = new Map<string, number>()
  const add = (product: string, field: string, value: string) => {
    const key = JSON.stringify([product, field, value])
    totals.set(key, (totals.get(key) ?? 0) + 1)
  }
  for (const row of rows) {
    add(row.product, '', '')
    for (const [field, value] of Object.entries(JSON.parse(row.fields) as Record<string, unknown>))
      add(row.product, field, String(value))
  }
  store.together(() => {
    for (const [key, instances] of totals) {
      const [product, field, value] = JSON.parse(key) as [string, string, string]
      store.run(
        `insert into monthly (product, month, field, value, instances) values (?1, ?2, ?3, ?4, ?5)
         on conflict (product, month, field, value) do update set instances = ?5`,
        product,
        month,
        field,
        value,
        instances,
      )
    }
    store.run('delete from reports where substr(day, 1, 7) = ?1', month)
    store.run('delete from instances where last_day < ?1', cutoff)
  })
  return month
}

/** Every hour: each product's stars, downloads and newest release, so an instance hears of a release within the hour. */
export const hourly = async (store: Store, now = new Date(), fetchImpl = fetch) => {
  for (const [name, product] of Object.entries(products))
    await fetchOutside(store, name, product.repo, now, fetchImpl).catch((error) =>
      console.warn(`outside ${name}: ${error}`),
    )
}

export const daily = async (store: Store, now = new Date()) => rollUp(store, now)
