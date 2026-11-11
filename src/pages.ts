/**
 * Both pages as plain HTML: the private dashboard (every chart and the table behind it) and the public numbers
 * (totals only). One blue for every mark, since each chart has one series; values are written beside the marks.
 */
import { products } from './products/index.js'
import type { publicOf, Stats } from './stats.js'

const escape = (text: unknown) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

const STYLE = `
:root { --surface: #fcfcfb; --raised: #ffffff; --ink: #0b0b0b; --ink-2: #52514e; --line: #e4e3df; --mark: #2a78d6; --mark-soft: #dbe8f8; }
@media (prefers-color-scheme: dark) { :root { --surface: #1a1a19; --raised: #222221; --ink: #f0efec; --ink-2: #c3c2b7; --line: #383835; --mark: #3987e5; --mark-soft: #23364f; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
main { max-width: 1080px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 22px; margin: 0; } h2 { font-size: 15px; margin: 0 0 4px; } p { margin: 0; color: var(--ink-2); }
header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: baseline; justify-content: space-between; margin-bottom: 20px; }
nav a { color: var(--ink-2); margin-right: 12px; text-decoration: none; } nav a[aria-current] { color: var(--ink); font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 16px; }
section, .tile { background: var(--raised); border: 1px solid var(--line); border-radius: 10px; padding: 16px; min-width: 0; }
.wide { grid-column: 1 / -1; }
.tile b { display: block; font-size: 28px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.bars { display: grid; grid-template-columns: minmax(90px, max-content) 1fr max-content; gap: 6px 10px; align-items: center; margin-top: 12px; font-variant-numeric: tabular-nums; }
.bars span { color: var(--ink-2); overflow-wrap: anywhere; } .bars i { display: block; height: 10px; border-radius: 0 4px 4px 0; background: var(--mark); }
svg { display: block; width: 100%; height: auto; margin-top: 12px; } svg text { fill: var(--ink-2); font-size: 11px; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; font-variant-numeric: tabular-nums; font-size: 13px; }
th, td { text-align: right; padding: 4px 6px; border-bottom: 1px solid var(--line); } th:first-child, td:first-child { text-align: left; }
th { color: var(--ink-2); font-weight: 500; } .scroll { overflow-x: auto; }
details { margin-top: 12px; } summary { cursor: pointer; color: var(--ink-2); }
.fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
footer { margin-top: 24px; color: var(--ink-2); font-size: 13px; } a { color: inherit; }
`

const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )

const tile = (label: string, value: unknown, note = '') =>
  `<div class="tile"><p>${escape(label)}</p><b>${escape(value)}</b>${note ? `<p>${escape(note)}</p>` : ''}</div>`

/** Labelled horizontal bars with the count written at the end of each. */
const bars = (rows: { label: string; instances: number }[], of?: number) => {
  if (!rows.length) return '<p>Nothing yet.</p>'
  const most = Math.max(...rows.map((row) => row.instances), 1)
  return `<div class="bars">${rows
    .map(
      ({ label, instances }) =>
        `<span>${escape(label)}</span><i style="width:${instances ? Math.max((instances / most) * 100, 1) : 0}%" title="${escape(label)}: ${instances}"></i><span>${instances}${of ? ` · ${Math.round((instances / of) * 100)}%` : ''}</span>`,
    )
    .join('')}</div>`
}

/** One line over time, with the first, highest and last values labelled and each day readable on hover. */
const line = (points: { day: string; instances: number }[]) => {
  if (points.length < 2) return '<p>Needs two days of reports.</p>'
  const [width, height, left, top, bottom] = [720, 180, 32, 12, 22]
  const most = Math.max(...points.map((point) => point.instances), 1)
  const x = (index: number) => left + (index / (points.length - 1)) * (width - left - 8)
  const y = (value: number) => top + (1 - value / most) * (height - top - bottom)
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(point.instances).toFixed(1)}`).join(' ')
  const step = (width - left - 8) / (points.length - 1)
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Instances reporting per day">
    <line x1="${left}" x2="${width - 8}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/><line x1="${left}" x2="${width - 8}" y1="${y(most)}" y2="${y(most)}" stroke="var(--line)" stroke-dasharray="2 4"/>
    <text x="${left - 6}" y="${y(most) + 4}" text-anchor="end">${most}</text><text x="${left - 6}" y="${y(0) + 4}" text-anchor="end">0</text>
    <text x="${left}" y="${height - 4}">${escape(points[0]?.day)}</text><text x="${width - 8}" y="${height - 4}" text-anchor="end">${escape(points.at(-1)?.day)}</text>
    <path d="${path}" fill="none" stroke="var(--mark)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(points.length - 1)}" cy="${y(points.at(-1)?.instances ?? 0)}" r="4" fill="var(--mark)" stroke="var(--raised)" stroke-width="2"/>
    ${points.map((point, index) => `<rect x="${(x(index) - step / 2).toFixed(1)}" y="${top}" width="${step.toFixed(1)}" height="${height - top - bottom}" fill="transparent"><title>${escape(point.day)}: ${point.instances}</title></rect>`).join('')}
  </svg>`
}

/** Cohorts as a table: the share of each week's new instances that reported again, shaded by that share. */
const retention = (rows: Stats['retention']) => {
  if (!rows.length) return '<p>Needs a week of reports.</p>'
  return `<div class="scroll"><table><thead><tr><th>First seen, week of</th><th>New</th>${Array.from({ length: 7 }, (_, index) => `<th>+${index + 1} wk</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      ({ week, size, after }) =>
        `<tr><td>${escape(week)}</td><td>${size}</td>${after
          .slice(1)
          .map((kept) => {
            if (kept === null) return '<td></td>'
            const share = size ? kept / size : 0
            return `<td style="background: color-mix(in srgb, var(--mark) ${Math.round(share * 45)}%, transparent)" title="${kept} of ${size}">${Math.round(share * 100)}%</td>`
          })
          .join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`
}

const tabs = (current: string, base: string) =>
  `<nav>${Object.entries(products)
    .map(([name, product]) => `<a href="${base}/${name}"${name === current ? ' aria-current="page"' : ''}>${escape(product.title)}</a>`)
    .join('')}</nav>`

export const dashboard = (stats: Stats) => {
  const { active, activation } = stats
  const outside = stats.outside.at(-1)
  const activated = stats.funnel.at(-1)?.instances ?? 0
  return page(
    `${stats.title} · Pulse`,
    `<header><div><h1>${escape(stats.title)}</h1><p>Instances that sent a usage report. Each counts once, by its latest report in the last 30 days.</p></div>${tabs(stats.product, '/admin')}</header>
    <div class="tiles">
      ${tile('Active, 30 days', active.month)}${tile('Active, 7 days', active.week)}${tile('Reported today', active.day)}
      ${tile('Activated', active.month ? `${Math.round((activated / active.month) * 100)}%` : '–', activation.milestone)}
      ${outside ? tile('Stars', outside.stars) + tile('Release downloads', outside.downloads) : ''}
    </div>
    <div class="grid">
      <section class="wide"><h2>Instances reporting per day</h2><p>The last 90 days.</p>${line(stats.daily)}</section>
      <section><h2>How far setup got</h2><p>Of the ${active.month} active instances.</p>${bars(stats.funnel, active.month)}</section>
      <section><h2>Time to: ${escape(activation.milestone.toLowerCase())}</h2><p>Instances first seen in the last 90 days.</p>${bars([
        { label: 'Same day', instances: activation.sameDay },
        { label: 'Within a week', instances: activation.withinWeek },
        { label: 'Later', instances: activation.later },
        { label: 'Not yet', instances: activation.notYet },
      ])}</section>
      <section><h2>New instances per week</h2><p>By the week they first reported.</p>${bars(stats.newByWeek)}</section>
      <section><h2>Versions</h2><p>What active instances run.</p>${bars(stats.versions, active.month)}</section>
      <section><h2>Countries</h2><p>Where reports arrive from; no address is kept.</p>${bars(stats.countries.slice(0, 12), active.month)}</section>
      <section class="wide"><h2>Coming back</h2><p>Of the instances first seen in a week, the share that reported in each later week.</p>${retention(stats.retention)}</section>
      <section class="wide"><h2>Every field</h2><p>How many active instances sent each value.</p><div class="fields">${stats.fields
        .map(({ field, values }) => `<div><h2>${escape(field)}</h2>${bars(values, active.month)}</div>`)
        .join('')}</div>
        <details><summary>The numbers as JSON</summary><p><a href="/admin/${stats.product}.json">/admin/${stats.product}.json</a></p></details></section>
    </div>
    <footer>As of ${escape(stats.day)} (UTC). Public totals: <a href="/${stats.product}">/${stats.product}</a></footer>`,
  )
}

export const numbers = (shown: ReturnType<typeof publicOf>) =>
  page(
    `${shown.title} in numbers`,
    `<header><div><h1>${escape(shown.title)} in numbers</h1><p>Totals from the anonymous usage reports self-hosted instances send. No group smaller than five is shown.</p></div>${tabs(shown.product, '')}</header>
    ${
      shown.enough
        ? `<div class="tiles">${tile('Instances active, 30 days', shown.active)}${shown.outside ? tile('Stars', shown.outside.stars) + tile('Release downloads', shown.outside.downloads) : ''}</div>
           <div class="grid"><section><h2>Versions</h2><p>What active instances run.</p>${bars(shown.versions, shown.active ?? 0)}</section>
           <section><h2>Countries</h2><p>Where reports arrive from; no address is kept.</p>${bars(shown.countries, shown.active ?? 0)}</section></div>`
        : `<div class="tiles">${tile('Instances active, 30 days', 'Fewer than 5', 'Shown once five instances report.')}${shown.outside ? tile('Stars', shown.outside.stars) + tile('Release downloads', shown.outside.downloads) : ''}</div>`
    }
    <footer>As of ${escape(shown.day)} (UTC). What a report holds, and the code that keeps it: <a href="https://github.com/escalay/pulse">github.com/escalay/pulse</a></footer>`,
  )

export const home = () =>
  page(
    'Pulse',
    `<header><div><h1>Pulse</h1><p>Anonymous usage reports from self-hosted Escalay products: ranges and yes/no answers, once a day, never a name or an address.</p></div></header>
    <div class="grid">${Object.entries(products)
      .map(([name, product]) => `<section><h2><a href="/${name}">${escape(product.title)} in numbers</a></h2><p>Public totals.</p></section>`)
      .join('')}</div>
    <footer>Source and every field: <a href="https://github.com/escalay/pulse">github.com/escalay/pulse</a></footer>`,
  )
