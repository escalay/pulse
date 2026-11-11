/** Starts Pulse: opens the database under DATA_DIR, listens on PORT, and does the daily work when a day has passed. */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { daily } from './daily.js'
import { openStore } from './db.js'

const dataDir = process.env.DATA_DIR ?? '.data'
mkdirSync(dataDir, { recursive: true })
const store = openStore(join(dataDir, 'pulse.sqlite'))
const app = createApp(store, process.env)

const HOUR = 60 * 60 * 1000
/** Once a day, by the day it last ran, so a restart neither skips a day nor does one twice. */
const tick = async () => {
  const today = new Date().toISOString().slice(0, 10)
  const [last] = store.query<{ at: string }>("select at from migrations where name = 'daily'")
  if (last?.at === today) return
  await daily(store)
  store.run("insert into migrations values ('daily', ?1) on conflict (name) do update set at = ?1", today)
}
const run = () => void tick().catch((error) => console.warn(`daily: ${error}`))
setTimeout(run, 30_000).unref()
setInterval(run, HOUR).unref()

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, () => console.log(`Pulse listening on ${port}`))
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    store.close()
    process.exit(0)
  })
