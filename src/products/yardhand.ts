/** Yardhand (github.com/escalay/yardhand): a self-hosted gateway for AI agents. Its docs/telemetry.md explains each field. */
import { choice, count, days, flag, type Product } from '../schema.js'

export const yardhand: Product = {
  repo: 'escalay/yardhand',
  schemas: {
    1: {
      // Where it runs
      install: choice('compose', 'cloud-init', 'render', 'fly', 'source', 'other'),
      arch: choice('x64', 'arm64', 'other'),
      age: days,
      https: flag,
      database: choice('<10MB', '10-100MB', '100MB-1GB', '1GB+'),
      // How far setup got
      claimed: flag,
      connections: count,
      connections_mcp: flag,
      connections_http: flag,
      connections_composio: flag,
      tools: count,
      clients_key: count,
      clients_oauth: count,
      packs: count,
      reviews_waiting: count,
      // Use, over the last 7 days unless named otherwise
      calls_1d: count,
      calls: count,
      calls_mcp: count,
      calls_rest: count,
      calls_app: count,
      calls_tool_error: count,
      calls_refused: count,
      calls_failed: count,
      searches: count,
      clients_active: count,
      // Optional parts that are switched on
      meaning_search: flag,
      ai_grouping: choice('off', 'openrouter', 'openai', 'local', 'custom'),
      langfuse: flag,
      discord: flag,
      access_signin: flag,
    },
  },
}
