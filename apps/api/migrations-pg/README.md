# migrations-pg

Schema changes for PostgreSQL, made **after** the data move from Cloudflare D1 (which already contains migrations
`0001` to `0044` in `../migrations/`; those are never run on PostgreSQL).

Rules

- One file per change, named `NNNN_what_it_does.sql`, numbered after the highest one that exists (the first is `0045`).
  Lower case letters, digits and underscores only. A mistyped name stops the runner instead of being skipped.
- Written for PostgreSQL, not SQLite. The application's SQL is still translated at run time (src/db/pgAdapter.js), but the
  schema is plain PostgreSQL.
- Forward only. Never edit a file after it has been applied anywhere: the runner stores its sha256 and refuses a changed file.
  Add a new migration instead.
- Each file runs in one transaction, so a failure leaves nothing behind. That means no `CREATE INDEX CONCURRENTLY`
  and no other statement PostgreSQL refuses inside a transaction.
- A change to `../src/db/pg/compat.sql` (the sqlite_* helper functions) is applied by the runner by itself; use
  `CREATE OR REPLACE`. A function whose return type changes needs a migration that drops it first.
- Keep the table rules the application relies on: constraints for invariants, triggers that guard history, no hard deletes
  of records (see `../src/db_contract.test.js`).

Run

    DATABASE_URL=postgres://... pnpm --dir apps/api run db:migrate:pg            apply what is pending
    DATABASE_URL=postgres://... pnpm --dir apps/api run db:migrate:pg -- --status   show what is applied and pending

The API refuses to start while a migration is pending, so run this as the deployment step before starting the new version.
The test database is built from the same files, so every test run applies them.
