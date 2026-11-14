# Azure migration: handoff note (2026-11-14)

For any engineer or coding agent continuing this work. Read this first, then `AGENTS.md`.

## Where the work is

- Work is on a **stack of branches**, newest `feature/tryout-user-switcher`. Start from it, not from `develop`.
  Order: api-db-behaviour-lock → api-db-portable-sql → api-portable-runtime → vcc-approve-closed-wo-conflict → api-node-entry → api-data-move → api-blob-store → api-local-stack → entra-signin → api-pg-ordering → api-pg-migrations → api-pg-statement-time → tryout-user-switcher (all `feature/`).
- All branches are pushed to origin as backups. No PRs yet (`gh auth login` has not been done on this machine).
- Do not commit `.vscode/settings.json` or the root `pnpm-lock.yaml` (not part of this work).

## Decisions already made (do not reopen without the user)

- Move the existing code to Microsoft/Azure. **No Power Apps rebuild.** Reason: management wants the Microsoft ecosystem (M365 Business Basic, 20-30 users).
- Database: Azure Database for PostgreSQL. Files (PDFs): Azure Blob Storage, reachable **only through our API** (keeps the file view/download audit). Login: Entra ID with company e-mail matched to the `users` table; roles/levels/departments stay in our tables.
- Cloudflare UAT keeps running until cut-over. Nothing more is invested in Cloudflare production.
- The user is not an IT person and wants short plain-Thai answers without git jargon.

## How it is built

- Handlers are untouched. The seam is `env.DB` / `env.FILES` (D1- and R2-shaped). `src/db/pgAdapter.js` gives PostgreSQL the D1 shape; `src/db/pg/compat.sql` holds the `sqlite_*` functions; `src/node/*` is the Node entry (config, server, main, Blob store, disk store).
- **The same test files run on three stores:** D1 (`pnpm test`), PGlite (`pnpm run test:pg`), real PostgreSQL 17 (`QMS_TEST_PG_URL=postgres://qms:qms@localhost:54329 pnpm run test:pg:real`, no database name in the URL). `db_contract.test.js` states the rules. **Never weaken or skip a test to make a port pass.**
- After the data move, schema changes go only in `apps/api/migrations-pg/NNNN_name.sql` (PostgreSQL dialect, forward-only, checksummed; see its README). `pnpm --dir apps/api run db:migrate:pg`. D1 migrations stay frozen.
- Data move: `scripts/migrate-data-to-pg.js` (one transaction, row counts + sha256 fingerprints read back). Files: `scripts/migrate-files-to-blob.js` (read-back hash, never overwrites).
- Entra sign-in: `src/entraAuth.js`, `AUTH_MODE=entra`. IT checklists: `docs/ops/azure-entra-signin.md`, `docs/ops/azure-database-setup.md`.

## Try it on localhost (no Azure needed)

`pnpm --dir apps/api run local:stack` then open http://localhost:8787, sign in as `dc4@t.co` / `1234`. `-- --reset` re-copies the dev data; `-- --microsoft` uses a fake Microsoft sign-in.
The sidebar has a tryout-only user switcher (web build flag `VITE_TRYOUT_SWITCHER=1`, set only by local-stack). The 41 seeded accounts get person names in the tryout copy only (`TRYOUT_NAMES` in `scripts/local-stack.js`).
Windows notes: `curl` mangles Thai (use node/fetch); stop the tryout with PowerShell, not a bash pattern; embedded PG lives in `C:\Users\Asus\qmspg` (short path on purpose).

## Not verified (needs a real Azure subscription)

Managed identity and RBAC for Blob (needs Storage Blob Data Contributor), `LC_COLLATE C` database creation, CITEXT allow-listing (`azure.extensions`), app-role grants, Linux SIGTERM shutdown, backup/restore drill, a real Entra tenant, CSP `connect-src` in `apps/web/public/_headers` (still names Cloudflare), `CLIENT_IP_HEADER` behind Azure, Azure prices.

## Still to do

1. Azure UAT once IT provides the subscription (deploy, set the settings above, real sign-in, restore drill).
2. Cut-over: final data + file move with checksums, retire Cloudflare, retire `vcc-migrate-safe` / `vcc-migrate-raw` (D1-only).
3. User-side: send IT the two `docs/ops/azure-*.md` files; `gh auth login`; QMR/DCC to confirm there is no legitimate "re-verify a closed VCC work order" flow.

## Open policy question (user said no rush)

Should a DCC user be allowed to review/approve documents of a department they belong to? Today `checkDecisionRights` blocks it (segregation of duties). Do not change it without the user's decision.

## Known intermittent tests (root cause not proven)

`vcc_multi_dept_rbac` test 4 (plan submit returns 400 once in a while; the assertion now prints the body) and `vcc_wo_safety` B1 concurrent reschedule on real PG (two sequential 200s instead of [200, 409]). Web tests can time out when the machine is busy; re-run the single file before suspecting a bug.
