# Hosted Persistence Operations

The optional hosted runtime is a single-node, single-authoritative-executor
deployment. PostgreSQL is its system of record. Browser IndexedDB remains a
standalone-mode store and must not be used as shared hosted authority.

## Durable records

`hosted_runs` and `hosted_jobs` retain relational operational metadata beside
canonical JSON payloads. `hosted_telemetry_batches` retains the meaningful
events and statistic samples produced with a run snapshot. Each payload is:

1. serialized with the engine's canonical JSON ordering;
2. compressed as `gzip-json-v1`;
3. checksummed over the uncompressed canonical bytes using SHA-256; and
4. decoded only after its encoding and checksum have been verified.

The snapshot plus its new telemetry batch are committed in one PostgreSQL
transaction. A failed transaction leaves neither a newer authoritative snapshot
nor an orphaned telemetry batch visible.

The simulation digest remains a simulation-only contract. Database timestamps,
owner IDs, job scheduling metadata, and checksums are operational metadata and
do not change a canonical engine digest.

## Schema compatibility and migration

`DATABASE_MIGRATION_VERSION` is the hosted storage contract. This release
accepts the current generation and the two immediately preceding generations
(1, 2, and 3). A database newer than this application is rejected. Server
startup refuses an older or uninitialized database; only the guarded migration
command can bring it forward.

Before every migration, create and verify a backup:

```powershell
$env:DATABASE_URL = 'postgres://world_simulation:replace-me@localhost:5432/world_simulation'
$env:HOSTED_BACKUP_FILE = 'D:\world-simulation-backups\before-migration.dump'
pnpm host:backup

$env:HOSTED_MIGRATION_BACKUP_FILE = $env:HOSTED_BACKUP_FILE
pnpm host:migrate
```

`host:migrate` refuses to run unless the supplied file exists and `pg_restore
--list` can read it. Use a separate backup for every production migration.

## Restore and recovery

Restore is intentionally explicit because it replaces database contents:

```powershell
$env:HOSTED_RESTORE_CONFIRMED = 'yes'
$env:HOSTED_BACKUP_FILE = 'D:\world-simulation-backups\before-migration.dump'
pnpm host:restore
```

After restoring, run `pnpm host:migrate` with a newly verified backup before
starting the service. Start the server only after migration succeeds:

```powershell
$env:HOSTED_OWNER_TOKEN = 'a-long-random-secret'
pnpm host
```

The server reloads the canonical snapshot and resumes any non-terminal durable
jobs. Job advancement uses a persisted write-ahead quantum: if a process stops
between a snapshot write and job-status write, recovery compares the durable
tick/digest to the pending quantum and either completes reconciliation or marks
the job as a state conflict. A second executor must never be started for the
same run.

## Prerequisites and operational limits

The backup, migration, and restore commands require PostgreSQL client tools
(`pg_dump` and `pg_restore`) on the operator machine. `docker compose up -d
postgres` starts a local PostgreSQL 17 service for development; change the
compose password before any non-local use. The current hosted HTTP boundary is
owner-authorized and intentionally not a public or multi-user API. Account
security, public APIs, and multi-user collaboration belong to Capability 3.

## Verification

For every deployment change, verify:

1. `pnpm host:backup` succeeds and the backup is readable.
2. `pnpm host:migrate` succeeds using that exact verified backup.
3. The service starts with `DATABASE_URL` and `HOSTED_OWNER_TOKEN`.
4. A fixed-seed run can advance, stop, restart, and produce the same canonical
   continuation digest as an uninterrupted run.
5. PostgreSQL logs show no checksum, encoding, transaction, or reconciliation
   errors.

The automated PostgreSQL integration suite runs when `TEST_DATABASE_URL` is
set; the GitHub workflow supplies PostgreSQL 17 for that test path.
