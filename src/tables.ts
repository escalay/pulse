/** The tables, as Drizzle sees them; migrations/ creates them and says what each is for. */
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const reports = sqliteTable(
  'reports',
  {
    product: text('product').notNull(),
    instance: text('instance').notNull(),
    day: text('day').notNull(),
    schema: integer('schema').notNull(),
    version: text('version').notNull(),
    country: text('country').notNull(),
    fields: text('fields').notNull(),
  },
  (table) => [primaryKey({ columns: [table.product, table.instance, table.day] })],
)

export const instances = sqliteTable(
  'instances',
  {
    product: text('product').notNull(),
    instance: text('instance').notNull(),
    firstDay: text('first_day').notNull(),
    lastDay: text('last_day').notNull(),
    firstVersion: text('first_version').notNull(),
    version: text('version').notNull(),
  },
  (table) => [primaryKey({ columns: [table.product, table.instance] })],
)

export const releases = sqliteTable('releases', {
  product: text('product').primaryKey(),
  latest: text('latest').notNull(),
  fetchedAt: text('fetched_at').notNull(),
})

export const outside = sqliteTable(
  'outside',
  {
    product: text('product').notNull(),
    day: text('day').notNull(),
    stars: integer('stars').notNull(),
    downloads: integer('downloads').notNull(),
  },
  (table) => [primaryKey({ columns: [table.product, table.day] })],
)

export const monthly = sqliteTable(
  'monthly',
  {
    product: text('product').notNull(),
    month: text('month').notNull(),
    field: text('field').notNull(),
    value: text('value').notNull(),
    instances: integer('instances').notNull(),
  },
  (table) => [primaryKey({ columns: [table.product, table.month, table.field, table.value] })],
)
