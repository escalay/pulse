# Pulse

Anonymous usage reports from self-hosted Escalay products, kept in one small Cloudflare Worker. A product's instances
send one report a day: ranges and yes/no answers that say how far setup got and what is used. This repository is the
whole receiving end, so anyone can read what is accepted and what is kept.

## What is kept

- **One row per instance per day**: the product, a random instance id, the day, the version, the country Cloudflare
  saw the request come from, and the report's fields. A second report on the same day replaces the first.
- **One row per instance**: when it was first and last seen, and its first and current version.
- **Public numbers** fetched once a day from GitHub: stars and release downloads.

Not kept: the sender's address (it counts requests for one minute to stop floods, and is never written), request
logs (they are off in the deploy config), host names, user names, or anything a report's schema does not name.

Daily rows are kept 13 months. Older months become totals ("this many instances had this value") with no instance
id, and the rows and lapsed instances are deleted.

## What a product may send

Each product has one file in [`src/products`](src/products) listing its fields and the values each allows. A report
that carries any other field, or any other value, is refused whole. A released schema number never changes: a new
field is a new number, and every number ever released keeps being accepted.

Yardhand's fields: [`src/products/yardhand.ts`](src/products/yardhand.ts), explained in
[its telemetry doc](https://github.com/escalay/yardhand/blob/main/docs/telemetry.md).

## The pages

| Path | Who | What |
|---|---|---|
| `POST /v1/<product>` | instances | Takes a report; answers `{ "ok": true, "latest": "1.2.3" }` with the newest release |
| `/<product>` and `/<product>.json` | anyone | Totals only: active instances, versions, countries. No group smaller than five is shown |
| `/admin/<product>` and `.json` | the maintainers, through Cloudflare Access | Activity, the setup funnel, retention, every field |

## A new product

1. Add `src/products/<name>.ts`: its title, repository, schema 1 and funnel (copy Yardhand's).
2. Add it to `src/products/index.ts`, run `pnpm gate`, deploy.
3. In the product, send once a day:

   ```sh
   curl -X POST https://pulse.escalay.space/v1/<name> -H 'content-type: application/json' \
     -d '{"schema": 1, "instance": "<a random UUID the instance keeps>", "version": "1.2.3", "report": { … }}'
   ```

   Make it easy to switch off (`DO_NOT_TRACK=1` at least), say what is sent, and never send a name.

## Run it

```sh
pnpm install
pnpm gate                 # types and tests, inside the Workers runtime
pnpm dev                  # http://localhost:8787, with a local database
```

`wrangler.example.jsonc` is the deploy config without the account's ids. To see the private pages locally, put
`ADMIN_OPEN=local` in `.dev.vars`.

## License

MIT
