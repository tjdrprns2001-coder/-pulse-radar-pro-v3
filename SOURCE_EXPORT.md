# IGNITION original Sites source

This branch contains the original private Sites application's source, exported from source commit `abba27be105ac1a576cd25979317bee566b2f017`.

- Original source files are preserved byte-for-byte, including scanner code, UI, database schema/migrations, build configuration, pnpm lockfile, and existing validation artifacts.
- The generated TypeScript cache `tsconfig.tsbuildinfo` is omitted. Dependencies/build outputs and runtime secrets are not included.
- This is a source export, not a deployment or a Binance 403 fix.
- No production branch or service configuration was changed by this export. Do not merge this independent project branch into Pulse main.
- Private Sites runtime values must remain managed as server secrets; never commit environment files or tokens.
- The separate Render read-only API source is on branch `ignition-readonly-api`.

## Binance 403 investigation entry points

- `lib/scanner/binance.mjs`: Binance HTTP requests, caching and request budgets
- `lib/scanner/engine.mjs`: staged scan pipeline
- `lib/scanner/api.ts`: private scanner API routes
- `lib/scanner/store.mjs`: D1 persistence
- `app/api/v1/[...path]/route.ts`: route adapter
- `cloudflare-env.d.ts`: runtime bindings

The existing validation JSON files are historical validation artifacts, not current production results.
