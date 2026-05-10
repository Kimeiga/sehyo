# Standalone Workers

This directory contains Cloudflare Workers that deploy **separately** from
the main SvelteKit app (which lives at the repo root and ships to Cloudflare
**Pages**). Pages Functions cannot have cron triggers, so anything that
needs to run on a schedule lives here.

Each subdirectory is its own deploy unit with its own `wrangler.toml`. They
do not share code or bindings with the SvelteKit app — they reach it over
HTTP via the admin endpoints under `/api/admin/*`.

## Workers

| Path | Trigger | What it does |
|------|---------|--------------|
| `prompt-rotator/` | Cron `0 11 * * *` (11:00 UTC = 6 AM EST) | POSTs `/api/admin/rotate-prompt` to generate the day's prompt + seed bot answers |

## Secrets

Every worker symlinks its `.dev.vars` to the repo root:

```
workers/<name>/.dev.vars -> ../../.dev.vars
```

This means `wrangler dev` reads the same `ADMIN_SECRET` (and other vars)
that the SvelteKit app uses — single source of truth, no copy-paste. The
root `.dev.vars` is gitignored; the symlink itself stores only a relative
path, no secret contents.

For **production** deploys, secrets must be uploaded to Cloudflare's secret
store separately. Non-interactive (reuses the same `.dev.vars`):

```bash
cd workers/<name>
grep -E '^ADMIN_SECRET=' .dev.vars | cut -d= -f2- | npx wrangler secret put ADMIN_SECRET
```

The `ADMIN_SECRET` value must match the one set on the Pages deployment
hosting `/api/admin/*`, otherwise the worker will get 401s.

## Local smoke test (cron workers)

From inside the worker's directory:

```bash
cd workers/prompt-rotator
npx wrangler dev --test-scheduled
```

In a second terminal, fire the scheduled handler manually:

```bash
curl "http://localhost:8787/__scheduled?cron=0+11+*+*+*"
```

The first terminal logs the response. A `200` means the worker reached the
admin endpoint and got success. A `401` means `ADMIN_SECRET` mismatch on
the target side (not the worker side).

### "But my code changes aren't taking effect"

By default the worker's `fetch` targets the production URL set in
`wrangler.toml` (`API_BASE_URL = "https://sehyo.com"`). When you run
`wrangler dev` for the worker, **the worker code runs locally but its HTTP
call still goes to the deployed Pages app.** Edits you make to the
SvelteKit app under `/api/admin/*` won't be visible until you either
deploy the Pages app or redirect the worker at a local SvelteKit dev
server.

To redirect at local SvelteKit dev, add a line to the root `.dev.vars`:

```
API_BASE_URL=http://localhost:5174
```

(Use whatever port `npm run dev` actually picked — Vite prints it on
startup.) The symlinked `.dev.vars` in the worker dir picks it up
automatically; restart `wrangler dev` after editing.

**Telltale signs you're still hitting prod by accident:**

- The response body contains fields you've already removed in your edits
  (e.g. `"created": false` on `rotate-prompt` — that field doesn't exist
  in the current code).
- Repeated curls return identical `prompt_id` UUIDs (you're reading the
  same prod D1 row, not generating new ones).
- The terminal running `npm run dev` shows no incoming request when you
  curl the worker.

**Caveat about D1 in local SvelteKit dev.** The root `wrangler.toml` has
`remote = true` on the D1 binding, so even when `vite dev` runs locally
it reads from and writes to the production `sehyo-db` instance — there
is no local SQLite shim in this project. Tests that exercise admin
endpoints still mutate real prod data; treat them with the same care as
a prod deploy.

## Deploy

```bash
cd workers/<name>
# First time only — upload the secret:
grep -E '^ADMIN_SECRET=' .dev.vars | cut -d= -f2- | npx wrangler secret put ADMIN_SECRET
npx wrangler deploy
```

`wrangler deploy` prints the deployed worker URL and confirms the cron is
registered (look for `Schedule:` in the output).

## Monitoring + debugging deployed workers

```bash
cd workers/<name>
npx wrangler tail
```

Leave this running — every invocation, `console.log`, and unhandled error
shows up in real time. This is the primary debugger for scheduled
workers, since there's no UI for inspecting their state.

## Forcing a run in production

Two ways, depending on what you actually want to test:

**Hit the admin endpoint directly** (tests the rotation logic, bypassing
the worker — this is what the worker would have called anyway):

```bash
export ADMIN_SECRET=$(grep -E '^ADMIN_SECRET=' workers/prompt-rotator/.dev.vars | cut -d= -f2-)

curl -X POST -H "x-admin-secret: $ADMIN_SECRET" \
  https://sehyo.com/api/admin/rotate-prompt
```

**This is NOT idempotent.** Every call burns a fresh LLM generation and
inserts a new `daily_prompts` row. Throttling is the caller's
responsibility — only the cron should hit this in steady state. Note
that `daily_prompts.active_date` is `UNIQUE`, so a second call on the
same UTC day will fail with a constraint error; clear the existing row
with `DELETE FROM daily_prompts WHERE active_date = '...'` first if you
need to re-roll the same day during testing.

Add `?bots=force` to re-roll seed-author answers on the existing prompt
without regenerating the prompt itself (preserves user posts):

```bash
curl -X POST -H "x-admin-secret: $ADMIN_SECRET" \
  "https://sehyo.com/api/admin/rotate-prompt?bots=force"
```

**Trigger the worker itself** (tests the worker's code path, including its
secret/binding wiring): Cloudflare dashboard → **Workers & Pages → the
worker → Triggers → Cron Triggers → Send/Test**. There is currently no
CLI for forcing a production cron invocation; the dashboard button is the
supported path.

## Adding a new scheduled worker

1. `mkdir -p workers/<name>/src && cd workers/<name>`
2. Symlink the secrets file: `ln -s ../../.dev.vars .dev.vars`
3. Create `wrangler.toml` with `name`, `main`, `compatibility_date`,
   a `[triggers] crons = [...]` block, and any `[vars]` you need.
4. Create `src/index.ts` exporting `default { scheduled(...) {...} }`.
5. Wrap any async work in `ctx.waitUntil(...)` — `scheduled` handlers
   are killed as soon as they return, so LLM calls and other long
   operations need `waitUntil` or they'll be cut off.
6. Test locally with `npx wrangler dev --test-scheduled` + the curl
   pattern above before deploying.

## A note on cron times

Wrangler crons are **UTC only** — there's no timezone field. `0 11 * * *`
gives you:

- 6 AM EST in winter (UTC−5)
- 7 AM EDT in summer (UTC−4)

We intentionally don't handle DST. If you ever need exact local-time
firing across DST, you'd schedule both the EST and EDT UTC times
(`0 10,11 * * *`) — but be aware that `rotate-prompt` is not idempotent,
so doing so would trip the `daily_prompts.active_date` UNIQUE constraint
on the second call and surface as an error in `wrangler tail`. The
single-cron `0 11 * * *` is the simplest correct setup.
