/**
 * The numbers behind both pages, per product: who is active, how far they got, what they run. Everything counts
 * instances by the last report each sent in the window, so an instance is one vote however often it reported.
 */
import { type Product, reached } from './schema.js'

const DAY = 24 * 60 * 60 * 1000
export const dayOf = (date: Date) => date.toISOString().slice(0, 10)
const ago = (now: Date, days: number) => dayOf(new Date(now.getTime() - days * DAY))
/** The Monday of a day's week. */
export const weekOf = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`)
  return dayOf(new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY))
}

type Tally = { label: string; instances: number }[]
const tally = (values: string[]): Tally => {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].map(([label, instances]) => ({ label, instances })).sort((a, b) => b.instances - a.instances)
}

export const statsOf = async (db: D1Database, name: string, product: Product, now = new Date()) => {
  const all = <Row>(query: string, ...values: unknown[]) =>
    db
      .prepare(query)
      .bind(...values)
      .all<Row>()
      .then(({ results }) => results)
  const [latest, week, daily, firsts, cohorts, milestone, outside] = await Promise.all([
    all<{ version: string; country: string; fields: string }>(
      `select r.version, r.country, r.fields from reports r
       join (select instance, max(day) as day from reports where product = ?1 and day >= ?2 group by instance) last
         on r.instance = last.instance and r.day = last.day
       where r.product = ?1`,
      name,
      ago(now, 29),
    ),
    all<{ instances: number }>(
      'select count(distinct instance) as instances from reports where product = ?1 and day >= ?2',
      name,
      ago(now, 6),
    ),
    all<{ day: string; instances: number }>(
      'select day, count(*) as instances from reports where product = ?1 and day >= ?2 group by day order by day',
      name,
      ago(now, 89),
    ),
    all<{ first_day: string }>(
      'select first_day from instances where product = ?1 and first_day >= ?2',
      name,
      weekOf(ago(now, 7 * 11)),
    ),
    all<{ first_day: string; day: string; instance: string }>(
      `select i.first_day, r.day, r.instance from reports r
       join instances i on i.product = r.product and i.instance = r.instance
       where r.product = ?1 and i.first_day >= ?2`,
      name,
      weekOf(ago(now, 7 * 7)),
    ),
    all<{ first_day: string; reached: string | null }>(
      `select i.first_day, min(r.day) as reached from instances i
       left join reports r on r.product = i.product and r.instance = i.instance
         and json_extract(r.fields, ?3) not in ('0', 'off', 0)
       where i.product = ?1 and i.first_day >= ?2 group by i.instance`,
      name,
      ago(now, 89),
      `$.${product.funnel.at(-1)?.field ?? ''}`,
    ),
    all<{ day: string; stars: number; downloads: number }>(
      'select day, stars, downloads from outside where product = ?1 order by day desc limit 30',
      name,
    ),
  ])

  const reports = latest.map((row) => ({ ...row, fields: JSON.parse(row.fields) as Record<string, string | boolean> }))
  const schema = Object.values(product.schemas).at(-1) ?? {}

  // Weekly cohorts: of the instances first seen in a week, how many reported in each week after
  const seen = new Map<string, Map<number, Set<string>>>()
  for (const row of cohorts) {
    const cohort = weekOf(row.first_day)
    const offset = Math.round((Date.parse(weekOf(row.day)) - Date.parse(cohort)) / (7 * DAY))
    const weeks = seen.get(cohort) ?? new Map<number, Set<string>>()
    weeks.set(offset, (weeks.get(offset) ?? new Set<string>()).add(row.instance))
    seen.set(cohort, weeks)
  }
  const retention = [...seen]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, weeks]) => ({
      week,
      size: weeks.get(0)?.size ?? 0,
      // Weeks that have not happened yet are left out, not shown as nobody
      after: Array.from({ length: 8 }, (_, offset) =>
        Date.parse(week) + offset * 7 * DAY <= now.getTime() ? (weeks.get(offset)?.size ?? 0) : null,
      ),
    }))

  const days = (row: { first_day: string; reached: string | null }) =>
    row.reached ? Math.round((Date.parse(row.reached) - Date.parse(row.first_day)) / DAY) : null
  const waits = milestone.map(days)

  return {
    product: name,
    title: product.title,
    day: dayOf(now),
    active: { month: reports.length, week: week[0]?.instances ?? 0, day: daily.at(-1)?.instances ?? 0 },
    daily,
    newByWeek: tally(firsts.map(({ first_day }) => weekOf(first_day))).sort((a, b) => a.label.localeCompare(b.label)),
    versions: tally(reports.map(({ version }) => version)),
    countries: tally(reports.map(({ country }) => country)),
    funnel: product.funnel.map(({ label, field }) => ({
      label,
      instances: reports.filter(({ fields }) => reached(fields[field])).length,
    })),
    // In the order the schema lists a field's values, so ranges read from nothing upward
    fields: Object.entries(schema).map(([field, kind]) => {
      const order = kind === 'flag' ? ['true', 'false'] : kind.values
      const values = tally(reports.map(({ fields }) => String(fields[field])))
      return { field, values: values.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)) }
    }),
    activation: {
      milestone: product.funnel.at(-1)?.label ?? '',
      sameDay: waits.filter((wait) => wait === 0).length,
      withinWeek: waits.filter((wait) => wait !== null && wait > 0 && wait <= 7).length,
      later: waits.filter((wait) => wait !== null && wait > 7).length,
      notYet: waits.filter((wait) => wait === null).length,
    },
    retention,
    outside: outside.reverse(),
  }
}

export type Stats = Awaited<ReturnType<typeof statsOf>>

const FEWEST = 5
/**
 * What anyone may see: totals only, and no group smaller than five instances (a count of one is a person). Fewer than
 * five instances in all, and only that is said.
 */
export const publicOf = (stats: Stats) => {
  const fold = (rows: Tally) => {
    const shown = rows.filter(({ instances }) => instances >= FEWEST)
    const rest = rows.filter(({ instances }) => instances < FEWEST).reduce((sum, row) => sum + row.instances, 0)
    return rest ? [...shown, { label: 'Other', instances: rest }] : shown
  }
  const enough = stats.active.month >= FEWEST
  return {
    product: stats.product,
    title: stats.title,
    day: stats.day,
    enough,
    active: enough ? stats.active.month : null,
    versions: enough ? fold(stats.versions) : [],
    countries: enough ? fold(stats.countries) : [],
    outside: stats.outside.at(-1) ?? null,
  }
}
