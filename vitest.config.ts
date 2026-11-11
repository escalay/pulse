import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.example.jsonc' },
      // The local-only open switch a developer may keep in .dev.vars never reaches the tests
      miniflare: { bindings: { MIGRATIONS: await readD1Migrations('./migrations'), ADMIN_OPEN: '' } },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
}))
