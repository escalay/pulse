/**
 * What a product may send. A product lists its fields per schema number; a report must carry exactly those fields with
 * one of each field's allowed values, and anything else is refused. A released schema number never changes: a product
 * that wants another field adds a new number, and the old ones keep being accepted.
 */
export type Field = { values: readonly string[] } | 'flag'

export type Product = {
  /** As people say it. */
  title: string
  /** The GitHub repository releases come from (`owner/name`): the newest release, its downloads and the stars. */
  repo: string
  schemas: Record<number, Record<string, Field>>
  /** Setup steps in order, each a field that is reached once it is true or more than nothing. The last is "activated". */
  funnel: { label: string; field: string }[]
}

/** Whether a field's value says "this happened": true, or a range above nothing. */
export const reached = (value: string | boolean | undefined) =>
  value === true || (typeof value === 'string' && value !== '0' && value !== 'off')

/** One of a fixed list of labels. */
export const choice = (...values: string[]): Field => ({ values })

/** A number said as a range, so a report can't single out an instance by its exact counts. */
export const COUNT = ['0', '1-10', '11-100', '101-1k', '1k-10k', '10k+'] as const
export const count: Field = { values: COUNT }

export const DAYS = ['0', '1-7', '8-30', '31-90', '91-365', '365+'] as const
export const days: Field = { values: DAYS }

export const flag: Field = 'flag'

const INSTANCE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(-[0-9a-z.]{1,20})?$/

export type Report = { schema: number; instance: string; version: string; fields: Record<string, string | boolean> }

/** A report that follows its product's schema, or the list of what is wrong with it. */
export const read = (product: Product, body: unknown): { report: Report } | { problems: string[] } => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { problems: ['The body is not an object'] }
  const { schema, instance, version, report, ...rest } = body as Record<string, unknown>
  const problems: string[] = Object.keys(rest).map((key) => `Unknown field: ${key}`)
  const fields = typeof schema === 'number' ? product.schemas[schema] : undefined
  if (!fields) problems.push('schema: not a schema of this product')
  if (typeof instance !== 'string' || !INSTANCE.test(instance)) problems.push('instance: not a random UUID')
  if (typeof version !== 'string' || !VERSION.test(version)) problems.push('version: not a version (1.2.3)')
  if (typeof report !== 'object' || report === null || Array.isArray(report)) problems.push('report: not an object')
  if (problems.length || !fields) return { problems }

  const sent = report as Record<string, unknown>
  for (const key of Object.keys(sent)) if (!(key in fields)) problems.push(`report.${key}: not a field of this schema`)
  for (const [key, field] of Object.entries(fields)) {
    const value = sent[key]
    if (value === undefined) problems.push(`report.${key}: missing`)
    else if (field === 'flag' ? typeof value !== 'boolean' : typeof value !== 'string' || !field.values.includes(value))
      problems.push(`report.${key}: ${field === 'flag' ? 'true or false' : `one of ${field.values.join(', ')}`}`)
  }
  if (problems.length) return { problems }
  return {
    report: {
      schema: schema as number,
      instance: instance as string,
      version: version as string,
      fields: sent as Record<string, string | boolean>,
    },
  }
}
