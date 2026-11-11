/**
 * Who may see the private pages: a request that came through Cloudflare Access for this application, proved by the
 * signed token Access adds. Without the team and audience set, the private pages don't exist.
 */
type Key = { kid: string } & JsonWebKey
let keys: { at: number; byId: Map<string, CryptoKey> } | null = null

const decode = (part: string) => Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const parse = <T>(part: string) => JSON.parse(new TextDecoder().decode(decode(part))) as T

const keysOf = async (team: string) => {
  if (keys && Date.now() - keys.at < 60 * 60 * 1000) return keys.byId
  const response = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`)
  const { keys: published } = (await response.json()) as { keys: Key[] }
  const byId = new Map<string, CryptoKey>()
  for (const key of published)
    byId.set(
      key.kid,
      await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
    )
  keys = { at: Date.now(), byId }
  return byId
}

/** The Zero Trust team, the Access application's audience tag, and `local` to open the pages on a developer's machine. */
export type AccessSettings = { ACCESS_TEAM?: string; ACCESS_AUD?: string; ADMIN_OPEN?: string }

export const allowed = async (request: Request, env: AccessSettings) => {
  if (env.ADMIN_OPEN === 'local') return true
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) return false
  const [head, body, signature] = (request.headers.get('cf-access-jwt-assertion') ?? '').split('.')
  if (!head || !body || !signature) return false
  try {
    const { kid } = parse<{ kid: string }>(head)
    const claims = parse<{ aud: string[] | string; exp: number; iss: string }>(body)
    const key = (await keysOf(env.ACCESS_TEAM)).get(kid)
    if (!key) return false
    const signed = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      decode(signature),
      new TextEncoder().encode(`${head}.${body}`),
    )
    return (
      signed &&
      [claims.aud].flat().includes(env.ACCESS_AUD) &&
      claims.exp * 1000 > Date.now() &&
      claims.iss === `https://${env.ACCESS_TEAM}.cloudflareaccess.com`
    )
  } catch {
    return false
  }
}
