# Pulse

Anonymous usage reports from self-hosted Escalay products, kept by one small server: a single container with a
SQLite file. A product's instances
send one report a day: ranges and yes/no answers that say how far setup got and what is used. This repository is the
whole receiving end, so anyone can read what is accepted and what is kept.

## What is kept

- **One row per instance per day**: the product, a random instance id, the day, the version, the country the
  request came from, and the report's fields. A second report on the same day replaces the first.
- **One row per instance**: when it was first and last seen, and its first and current version.
- **Public numbers** fetched once a day from GitHub: stars and release downloads.

The tables hold nothing else: no host name, no user, and nothing a report's schema does not name.
[`migrations/`](migrations) is the whole of it.

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
| `GET /v1/<product>/latest` | instances | The newest release, `{ "latest": "1.2.3" }`: the update check. It takes no report and no id |
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
pnpm gate                 # types and tests
pnpm dev                  # http://localhost:8787, with its database in .data/
```

Or as the container the project itself runs:

```sh
docker run -p 3000:3000 -v pulse-data:/data ghcr.io/escalay/pulse:latest
```

| Setting | What it does |
|---|---|
| `PORT` | Where it listens. The image sets 3000 |
| `DATA_DIR` | Where `pulse.sqlite` lives. The image sets `/data`: mount a volume there |
| `ACCESS_TEAM`, `ACCESS_AUD` | The Cloudflare Zero Trust team and Access application that may open `/admin`. Unset, `/admin` doesn't exist |
| `ADMIN_OPEN=local` | Opens `/admin` with no sign-in, for a developer's machine only |

It is Node, [Hono](https://hono.dev), SQLite (`node:sqlite`) and [Drizzle](https://orm.drizzle.team). Opening the
database applies whatever in `migrations/` it has not seen.

## License

MIT
