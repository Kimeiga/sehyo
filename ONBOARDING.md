# Sehyo — Onboarding for New Contributors

Welcome. This guide gets a brand-new machine from zero to "I can run the
app locally against the production Cloudflare resources, query the prod
D1, and ship a deploy."

If something here is out of date, **fix this file in the same PR** that
fixes the underlying setup. Future-you will thank present-you.

---

## 0. What you're working on

Sehyo is a daily-question social app:

- **Frontend / server:** SvelteKit (Svelte 5 runes), TypeScript.
- **Hosting:** Cloudflare Pages — the SvelteKit server runs as
  Cloudflare Pages Functions (`adapter-cloudflare`).
- **Database:** Cloudflare D1 (`sehyo-db`).
- **Object storage:** Cloudflare R2 (`sehyo-images`) for uploaded
  avatars / header images.
- **AI:** Cloudflare Workers AI (Llama 3.3 70B Instruct fp8-fast) —
  generates daily prompts, seed-bot answers, and inter-bot comments.
- **Auth:** `better-auth` with Google OAuth + an anonymous-user plugin
  for read-only browsing that converts on first interaction.
- **KV:** A small KV namespace (`SESSIONS`) is bound but currently
  unused by the active session strategy.

Everything in this stack is on a single Cloudflare account. The new
collaborator needs read+write access to that account before any of the
remote commands below will work — see Step 2.

---

## 1. Prerequisites

Install these on the new machine:

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.x | Match what the project uses (`node --version` should report `v22.x`). Use [`nvm`](https://github.com/nvm-sh/nvm) if you want easy switching. |
| npm | bundled with Node 22 | `npm --version` should be 10+. |
| Git | any recent | `git --version`. |
| Wrangler | 4.x | Installed as a project devDependency, so `npx wrangler` works after `npm install`. The global install is optional. |

You also want a real terminal — the `wrangler login` flow opens a browser tab to authorize the CLI.

```bash
node --version    # expect v22.x
npm --version     # expect 10+
git --version     # any recent version
```

---

## 2. Get access to the Cloudflare account

This is the step that's easiest to forget, and without it none of the
remote `wrangler` commands work.

1. **Hakan** invites the new contributor to the Cloudflare account that
   owns the `sehyo` Pages project, the `sehyo-db` D1 database, the
   `sehyo-images` R2 bucket, and the `SESSIONS` KV namespace. Role:
   *Super Administrator* for now (we can tighten later).
2. The new contributor **accepts the email invite** and confirms they
   can log in to <https://dash.cloudflare.com> and see the `sehyo`
   project.
3. They'll also need access to the **Google Cloud OAuth client** for
   login to work end-to-end. Hakan has the credentials in
   `.dev.vars` — share them privately (1Password / signal / similar),
   never via a PR. See Step 5.

If `wrangler whoami` says you're authenticated but `wrangler d1 list`
returns no databases, your account access is the problem — go back to
this step.

---

## 3. Clone and install

```bash
git clone https://github.com/Kimeiga/sehyo.git
cd sehyo
npm install
```

Things you should see after `npm install`:

- `node_modules/` populated.
- `wrangler` available at `./node_modules/.bin/wrangler` and via
  `npx wrangler …`.
- `svelte-kit sync` runs as a `prepare` script; if it fails the build
  won't work, so resolve any errors before continuing.

---

## 4. Authenticate Wrangler

```bash
npx wrangler login
```

This pops a browser tab. Authorize the same Cloudflare account from
Step 2. Sanity-check:

```bash
npx wrangler whoami        # should print your email + account name
npx wrangler d1 list       # should list "sehyo-db"
npx wrangler r2 bucket list # should list "sehyo-images"
```

If any of those return empty, your account isn't actually a member of
the Sehyo Cloudflare account — go back to Step 2.

---

## 5. Local secrets (`.dev.vars`)

The Cloudflare bindings (D1, R2, AI, KV) come from `wrangler.toml`,
which is committed. **Secrets** — the Google OAuth credentials and the
`ADMIN_SECRET` used to gate `/api/admin/rotate-prompt` — live in a
`.dev.vars` file that is **gitignored** and must be created locally.

Create `/Users/<you>/code/sehyo/.dev.vars` with:

```bash
GOOGLE_CLIENT_ID=<get from Hakan>
GOOGLE_CLIENT_SECRET=<get from Hakan>
# Leave empty so better-auth uses the request origin.
GOOGLE_REDIRECT_URI=
ADMIN_SECRET=<get from Hakan>
```

These same values are stored as Cloudflare Pages secrets on the
production project (`wrangler pages secret list --project-name=sehyo`
will list them, but won't reveal values).

> **Never commit `.dev.vars`.** It's already in `.gitignore`. If you
> ever accidentally `git add` it, rotate every value immediately.

---

## 6. Database: connect to production D1

The ID of the prod D1 database is already in `wrangler.toml`:

```toml
[[d1_databases]]
binding       = "DB"
database_name = "sehyo-db"
database_id   = "5effc8ea-6563-45ee-a7d7-ef4b950fd7e8"
```

That `database_id` is the **production** database. Every `wrangler d1`
command supports `--remote` (run against prod) or `--local` (run
against a local SQLite file under `.wrangler/`). **Default is local.**

### Quick smoke test against prod D1

```bash
npx wrangler d1 execute sehyo-db --remote \
  --command "SELECT COUNT(*) AS users FROM user"
```

If that returns a number, you're connected to prod. If it errors out
about authentication, recheck Step 2 and Step 4.

### Seeding your local D1 from prod (recommended for dev)

`vite dev` (the SvelteKit dev server) uses the **local** D1 by default.
That local D1 is empty until you populate it. Two options:

**Option A — Apply migrations to local D1 (clean slate):**

```bash
# Run every migration in order.
for f in migrations/*.sql; do
  echo "→ $f"
  npx wrangler d1 execute sehyo-db --local --file="$f"
done
```

This gives you a fresh local DB matching the schema, but with no
prompts, posts, or users. Good for testing migrations and edge cases.

**Option B — Snapshot prod into local (most realistic):**

```bash
# 1. Dump prod into a SQL file.
npx wrangler d1 export sehyo-db --remote --output=./tmp/prod-snapshot.sql

# 2. Wipe local + reload from snapshot.
rm -rf .wrangler/state/v3/d1
npx wrangler d1 execute sehyo-db --local --file=./tmp/prod-snapshot.sql
```

This gives you an exact copy of prod data on your machine. Use this
when you want to debug "why does this look weird on prod" — chances
are you can reproduce it locally with the snapshot.

> ⚠️ **Be careful with `--remote`.** Anything you `INSERT`, `UPDATE`,
> or `DELETE` with `--remote` hits production immediately. Read-only
> `SELECT`s are safe; everything else, double-check the flag before
> hitting enter.

---

## 7. Running the app locally

```bash
npm run dev
```

This starts Vite on <http://localhost:5173>. The SvelteKit
`adapter-cloudflare` integration injects `platform.env` with bindings
to your **local** D1, R2, KV, and Workers AI. Workers AI is special —
even in local mode it proxies real inference calls to Cloudflare, so
prompt/answer generation will actually work locally and bill the
account.

If you want server-side errors to surface during development, watch
the terminal that's running `npm run dev` — most server-side errors
print there with a stack trace.

### Sign-in locally

The OAuth callback URL in dev is dynamically based on the request
origin (because we left `GOOGLE_REDIRECT_URI` empty in `.dev.vars`).
Make sure `http://localhost:5173/auth/callback` is registered as an
authorized redirect URI in the Google Cloud Console for the OAuth
client whose credentials you got from Hakan. If it isn't, ask him to
add it.

### Hitting prod from local code (optional)

For risky changes, prefer deploying to a preview branch (Step 9) over
running local code against prod data. But if you really need to:
`npx wrangler pages dev .svelte-kit/cloudflare --remote` after a
build will run the bundled functions with **remote** bindings. Treat
this like prod — every write goes to the real DB.

---

## 8. Common workflows

### Adding a database migration

1. Find the highest existing migration number in `migrations/`
   (e.g. `0019_…`).
2. Add `migrations/00NN_<description>.sql` with your statements.
3. Apply locally first:
   ```bash
   npx wrangler d1 execute sehyo-db --local --file=./migrations/00NN_<description>.sql
   ```
4. Smoke test against `npm run dev`.
5. Apply to prod:
   ```bash
   npx wrangler d1 execute sehyo-db --remote --file=./migrations/00NN_<description>.sql
   ```
6. Commit the SQL file.

There is no automatic migration runner — applying is manual on both
local and remote. If you need to verify a migration applied, query
`sqlite_master` or just `SELECT` the new column / table.

### Regenerating today's bot answers

If you've changed the AI prompt in `src/lib/server/ai-bots.ts` and want
to see the effect on today's already-rotated prompt without waiting
for tomorrow:

```bash
curl -X POST "https://sehyo.com/api/admin/rotate-prompt?bots=force" \
  -H "x-admin-secret: $ADMIN_SECRET"
```

This calls `generateSeedAnswers()` — it deletes only seed-author
posts/comments on the most recent prompt (preserving any human
content), then regenerates the bot answers + Pass-2/Pass-3 inter-bot
comments. The prompt itself is *not* re-generated; only the bot seed
content attached to it.

To also re-roll the prompt text (e.g. you don't like today's
question), you'd manually `DELETE FROM daily_prompts WHERE
active_date = '<today UTC>'` first, then call the same endpoint
without `?bots=force`. This **destroys human posts attached to that
prompt**, so don't do it casually.

### Inspecting prod data

```bash
# What were the last few daily prompts?
npx wrangler d1 execute sehyo-db --remote \
  --command "SELECT active_date, prompt_text FROM daily_prompts ORDER BY active_date DESC LIMIT 14"

# Who has posted recently?
npx wrangler d1 execute sehyo-db --remote \
  --command "SELECT u.username, p.content, datetime(p.created_at, 'unixepoch') AS at \
             FROM posts p JOIN user u ON u.id = p.user_id \
             ORDER BY p.created_at DESC LIMIT 10"

# Inspect a table's schema:
npx wrangler d1 execute sehyo-db --remote \
  --command "SELECT sql FROM sqlite_master WHERE name='friendships'"
```

### Tailing production logs

```bash
npx wrangler pages deployment tail --project-name=sehyo
```

Lets you see `console.log` / errors from the live functions in real
time. Indispensable for debugging "why is this 500ing in prod."

---

## 9. Building and deploying

CI is **not** wired up — deploys are manual via wrangler.

```bash
# Build (output lands in .svelte-kit/cloudflare).
npm run build

# Deploy to production (the live sehyo.com).
npx wrangler pages deploy .svelte-kit/cloudflare \
  --project-name=sehyo \
  --branch=main

# Or deploy to a preview branch first to QA without touching prod:
npx wrangler pages deploy .svelte-kit/cloudflare \
  --project-name=sehyo \
  --branch=<your-feature-name>
```

Preview branches get a unique `<hash>.sehyo.pages.dev` URL. They share
the same D1 / R2 / AI bindings as production (Cloudflare Pages doesn't
do per-branch bindings without explicit env config), so any writes
from a preview deploy still hit prod. Prefer **read-only / UI-only**
work on previews; for anything that mutates data, snapshot prod
locally and test there.

`npm run build` also runs `node scripts/fix-routes.js`, which patches
the generated `_routes.json` so the service worker and asset paths
get excluded from function invocations correctly. If the build claims
"Dropping NN exclude rules — this will cause unnecessary function
invocations" you can usually ignore it; the post-build script handles
the necessary trimming.

---

## 10. Project structure tour

```
src/
├── app.css                # Tailwind base + CSS variables (light/dark theme)
├── app.d.ts               # SvelteKit App.Locals + App.Platform types
├── app.html               # Document shell (font preconnect, OG meta)
├── hooks.server.ts        # better-auth session hydration
├── lib/
│   ├── auth-client.ts         # client-side better-auth wrapper
│   ├── components/            # reusable Svelte components
│   ├── crypto.ts              # E2EE message encryption (browser-side)
│   ├── header-gradient.ts     # mesh-gradient generator for profile banners
│   ├── server/
│   │   ├── ai-bots.ts         # AI prompt + answer + comment generation
│   │   ├── auth.ts            # better-auth server config
│   │   ├── better-auth.ts     # auth provider setup (Google + anon)
│   │   ├── comments.ts        # eager comment-load helper
│   │   ├── usernames.ts       # validation, reserved list, slug generator
│   │   └── …
│   └── stores/                # Svelte stores (sign-in modal, etc.)
└── routes/
    ├── +layout.server.ts      # global load: today's prompt + viewer state
    ├── +layout.svelte         # nav bar, sign-in modal mount
    ├── +page.server.ts        # past-days + world-feed for the home page
    ├── +page.svelte           # the home feed (the daily-prompt page)
    ├── [username]/            # /<username> profile page
    ├── about/                 # static about page
    ├── api/                   # all server-side endpoints
    │   ├── admin/rotate-prompt/   # ADMIN_SECRET-gated prompt regen
    │   ├── auth/                  # better-auth handlers
    │   ├── friends/               # friend request + accept/reject
    │   ├── messages/              # E2EE messaging
    │   ├── og/                    # dynamic OG image generator
    │   ├── posts/                 # CRUD on posts + comments
    │   ├── prompt/answer          # post your answer to today's prompt
    │   ├── user/                  # user-by-id helpers
    │   └── users/search           # username search
    ├── friends/               # /friends — friend list + Find tab
    ├── messages/              # /messages — DM thread UI
    └── prototype/             # exploratory layouts; not linked from prod nav
migrations/                    # one .sql file per migration, applied manually
scripts/                       # one-off node scripts (PWA icons, bot triggers)
static/                        # images / icons served as-is
wrangler.toml                  # Cloudflare bindings + project config
.dev.vars                      # local secrets (gitignored)
```

The two heavy files to read first:

- `src/lib/server/ai-bots.ts` — the LLM pipeline. Prompt + answer
  generation, multi-pass inter-bot comments, the `pickAuthors`
  stratifier, the cleanLine defensive parsing.
- `src/routes/+page.svelte` — the home feed including the
  Twitter-style threading layout. Most of the recent visual work
  has been here.

---

## 11. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `wrangler whoami` says you're logged in but `wrangler d1 list` is empty | You're authenticated but not a member of the Sehyo Cloudflare account. Step 2. |
| `npm run dev` boots but every DB call returns "Database not available" | Local D1 binding hasn't been populated. Run the migrations or restore the prod snapshot (Step 6). |
| Local sign-in redirects loop or 400s on the callback | The redirect URL `http://localhost:5173/auth/callback` isn't registered as an authorized redirect URI on the Google OAuth client. |
| `npm run build` fails with "Rollup failed to resolve import @chenglou/pretext" | Run `npm install` again; this is a real dep used by the `/prototype` masonry page. |
| Profile page 500s with `ReferenceError: locals is not defined` | The page-server load is missing `locals` in its destructured event arg. Has bitten us before. |
| `wrangler pages deploy` says "Dropping NN exclude rules" | Cosmetic warning; the post-build `scripts/fix-routes.js` handles routing. Verify the deploy URL works. |

When in doubt, **`wrangler pages deployment tail --project-name=sehyo`** is your friend — it will show the actual server-side error.

---

## 12. Where to ask

- Day-to-day questions: ping Hakan directly.
- Architectural / "why is this designed like this" questions: check
  `docs/ARCHITECTURE_ANALYSIS.md` and `docs/BOT_SYSTEM.md` first.
- The `CHANGELOG.md` and recent commits on `main` are the most
  authoritative description of what's currently shipped — when this
  document and the code disagree, the code wins, and **fix this
  document in the same PR**.

Welcome aboard. Have fun.
