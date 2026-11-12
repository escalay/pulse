/** Mailroom (github.com/escalay/mailroom): email addresses on demand for agents and apps. Its docs say what each field is. */
import { choice, count, days, flag, type Product } from '../schema.js'

export const mailroom: Product = {
  title: 'Mailroom',
  repo: 'escalay/mailroom',
  funnel: [
    { label: 'Claimed by an owner', field: 'claimed' },
    { label: 'Mail reaches it', field: 'routing' },
    { label: 'Made an address', field: 'addresses' },
    { label: 'Received mail', field: 'mail' },
    { label: 'Connected an agent', field: 'agents' },
  ],
  schemas: {
    1: {
      // Where it runs
      install: choice('deploy-button', 'wrangler', 'other'),
      age: days,
      // How far setup got
      claimed: flag,
      domains: count,
      routing: flag,
      access: flag,
      team: count,
      // What it holds
      addresses: count,
      addresses_permanent: count,
      // Use, over the last 7 days
      mail: count,
      mail_unmatched: count,
      mail_with_code: count,
      // Who uses it
      keys: count,
      agents: count,
      webhooks: count,
      // Optional parts that are switched on
      reader: flag,
      sending: flag,
      relay: flag,
      flows: count,
      inbox_agent: flag,
    },
  },
}
