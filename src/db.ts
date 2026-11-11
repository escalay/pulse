/**
 * The database: one SQLite file (node:sqlite, nothing to compile) with Drizzle on top. Opening it applies whatever
 * in migrations/ it has not seen. `db` is Drizzle, for rows that come and go; `query` reads with plain SQL, for the
 * counting the pages do.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

const MIGRATIONS = new URL('../migrations/', import.meta.url).pathname

export const openStore = (file: string) => {
  const sqlite = new DatabaseSync(file)
  sqlite.exec('pragma journal_mode = wal; pragma busy_timeout = 5000')
  sqlite.exec('create table if not exists migrations (name text primary key, at text not null)')
  const applied = new Set(sqlite.prepare('select name from migrations').all().map((row) => String(row.name)))
  for (const name of readdirSync(MIGRATIONS).filter((entry) => entry.endsWith('.sql')).sort()) {
    if (applied.has(name)) continue
    sqlite.exec('begin')
    sqlite.exec(readFileSync(join(MIGRATIONS, name), 'utf8'))
    sqlite.prepare('insert into migrations values (?, ?)').run(name, new Date().toISOString())
    sqlite.exec('commit')
  }
  const db = drizzle(async (query, params: SQLInputValue[], method) => {
    const statement = sqlite.prepare(query)
    if (method === 'run') {
      statement.run(...params)
      return { rows: [] }
    }
    statement.setReturnArrays(true)
    const rows = statement.all(...params) as unknown as unknown[][]
    return { rows: method === 'get' ? (rows[0] ?? []) : rows }
  })
  return {
    db,
    /** Rows of a plain SQL query, by column name; `?1`, `?2`… take the values in order. */
    query: <Row>(query: string, ...values: SQLInputValue[]) => sqlite.prepare(query).all(...values) as Row[],
    run: (query: string, ...values: SQLInputValue[]) => sqlite.prepare(query).run(...values),
    /** Everything inside happens, or none of it. */
    together: <Result>(work: () => Result) => {
      sqlite.exec('begin')
      try {
        const result = work()
        sqlite.exec('commit')
        return result
      } catch (error) {
        sqlite.exec('rollback')
        throw error
      }
    },
    close: () => sqlite.close(),
  }
}

export type Store = ReturnType<typeof openStore>
