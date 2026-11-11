declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    /** Counts reports per sender for a minute; absent, nothing is limited. */
    LIMIT?: RateLimit
    /** The Zero Trust team and the Access application's audience tag that guard the private pages. */
    ACCESS_TEAM?: string
    ACCESS_AUD?: string
    /** `local` opens the private pages with no sign-in, for `wrangler dev` only. */
    ADMIN_OPEN?: string
  }
}
interface Env extends Cloudflare.Env {}
