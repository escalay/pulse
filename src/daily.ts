/**
 * Once a day: each product's newest release, stars and release downloads from GitHub (public numbers, asked without
 * a token), and the roll-up that turns daily rows older than 13 months into monthly totals with no instance ids.
 */
import { products } from './products/index.js'
import { dayOf } from './stats.js'

const KEEP_MONTHS = 13
const GITHUB = { accept: 'application/vnd.github+json', 'user-agent': 'escalay-pulse' }

type Release = { tag_name: string; draft: boolean; prerelease: boolean; assets: { download_count: number }[] }

export const fetchOutside = async (db: D1Database, name: string, repo: string, now: Date, fetchImpl = fetch) => {
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
  await db.batch([
    db
      .prepare(
        `insert into outside (product, day, stars, downloads) values (?1, ?2, ?3, ?4)
         on conflict (product, day) do update set stars = ?3, downloads = ?4`,
      )
      .bind(name, dayOf(now), Number((about as { stargazers_count: number }).stargazers_count), downloads),
    ...(latest
      ? [
          db
            .prepare(
              `insert into releases (product, latest, fetched_at) values (?1, ?2, ?3)
               on conflict (product) do update set latest = ?2, fetched_at = ?3`,
            )
            .bind(name, latest, now.toISOString()),
        ]
      : []),
  ])
}

/** The first month whose daily rows are still kept. */
export const keptFrom = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - KEEP_MONTHS, 1)).toISOString().slice(0, 7)

/** Rolls up the oldest month past keeping, one a run: its totals are written, then its rows and lapsed instances go. */
export const rollUp = async (db: D1Database, now: Date) => {
  const oldest = await db
    .prepare('select min(day) as day from reports where day < ?1')
    .bind(`${keptFrom(now)}-01`)
    .first<{ day: string | null }>()
  const month = oldest?.day?.slice(0, 7)
  if (!month) return null
  const { results } = await db
    .prepare(
      `select r.product, r.fields from reports r
       join (select product, instance, max(day) as day from reports where substr(day, 1, 7) = ?1 group by product, instance) last
         on r.product = last.product and r.instance = last.instance and r.day = last.day`,
    )
    .bind(month)
    .all<{ product: string; fields: string }>()
  const totals = new Map<string, number>()
  const add = (product: string, field: string, value: string) => {
    const key = JSON.stringify([product, field, value])
    totals.set(key, (totals.get(key) ?? 0) + 1)
  }
  for (const row of results) {
    add(row.product, '', '')
    for (const [field, value] of Object.entries(JSON.parse(row.fields) as Record<string, unknown>))
      add(row.product, field, String(value))
  }
  const insert = db.prepare(
    `insert into monthly (product, month, field, value, instances) values (?1, ?2, ?3, ?4, ?5)
     on conflict (product, month, field, value) do update set instances = ?5`,
  )
  const writes = [...totals].map(([key, instances]) => {
    const [product, field, value] = JSON.parse(key) as [string, string, string]
    return insert.bind(product, month, field, value, instances)
  })
  // D1 takes a batch of at most a hundred statements at a time
  for (let index = 0; index < writes.length; index += 90) await db.batch(writes.slice(index, index + 90))
  await db.batch([
    db.prepare('delete from reports where substr(day, 1, 7) = ?1').bind(month),
    db.prepare('delete from instances where last_day < ?1').bind(`${keptFrom(now)}-01`),
  ])
  return month
}

export const daily = async (env: Env, now = new Date()) => {
  for (const [name, product] of Object.entries(products))
    await fetchOutside(env.DB, name, product.repo, now).catch((error) => console.warn(`outside ${name}: ${error}`))
  await rollUp(env.DB, now)
}
