# Archived migrations (fb-portfolio era, Oct 2025)

These 21 migration files were the original fb-portfolio history. They contained:

- Inconsistent FK targets (`users` plural vs `user` singular)
- Two pairs of files that shared the same prefix (`0003_*`, `0014_*`)
- Migrations that contradicted each other (e.g. `0016_fix_foreign_keys` rewrote
  `friendships` to use `user_id`/`friend_id` while the app code used
  `requester_id`/`addressee_id`, and dropped the e2ee `cipher_text`/`aes_key`/
  `iv` columns the app needed on `messages`)

On 2026-05-10 they were consolidated into a clean baseline:

- [`../0001_baseline.sql`](../0001_baseline.sql) — full schema (idempotent)
- [`../0002_seed_bots.sql`](../0002_seed_bots.sql) — three AI bot user rows + bot_profiles

These files are kept here for historical reference only. Do not run them.
