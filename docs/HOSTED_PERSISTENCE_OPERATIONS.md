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

Every hosted mutation uses the persisted tick and digest as a compare-and-swap
precondition. Its snapshot, telemetry batch, optional job progress, and durable
mutation ID are committed in one PostgreSQL transaction. The in-process engine
is replaced only after that commit succeeds. A failed transaction leaves neither
a newer authoritative snapshot nor an orphaned telemetry/job record visible;
repeating a mutation ID observes the already-committed result without advancing
the simulation a second time.

Job rows carry a monotonically increasing `job_revision`. Progress and
cancellation updates use compare-and-swap writes instead of blind upserts, and
quantum fingerprints contain only stable request identity—not operational
timestamps—so a restart can retry an acknowledged or unacknowledged quantum.

Shared-world accounts, sessions, tokens, worlds, access roles, revisions,
leases, audits, and run references use relational columns, primary/foreign
keys, uniqueness constraints, and role/digest checks. Only immutable authored
revision documents remain encoded payloads. A locked
`hosted_shared_state_meta` revision protects the coordinated relational rewrite
from multi-process lost updates. Server handlers mutate an isolated candidate
service, commit the candidate, audit, optional initial run snapshot, and outbox
event together, and replace live memory only after commit.

`hosted_outbox_events` is the operational event authority. Event keys are
unique, so idempotent command or revision retries cannot publish twice. SSE
replay queries this table directly and honors `Last-Event-ID`; the legacy
in-memory event-stream snapshot is retained only for migration compatibility.

The simulation digest remains a simulation-only contract. Database timestamps,
owner IDs, job scheduling metadata, and checksums are operational metadata and
do not change a canonical engine digest.

## Schema compatibility and migration

`DATABASE_MIGRATION_VERSION` is the hosted storage contract. This release uses
generation 10 and retains explicit forward steps for older hosted generations;
a database newer than this application is rejected. Server startup refuses an
older or uninitialized database; only the guarded migration command can bring
it forward.

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
Generation 10 renames the generation-9 opaque shared tables with a
`_v9_backup` suffix, backfills the relational schema, restores the service
through normal validation, and compares a canonical state fingerprint before
recording the migration. Any invalid reference, checksum mismatch, or
verification difference rolls the migration transaction back.

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
jobs. Snapshot, telemetry, completed job progress, and the quantum mutation ID
commit together. A retry with the same stable mutation identity observes that
commit; a competing executor with a different mutation is rejected by the
locked run row and tick/digest precondition. If durable reconciliation itself
fails, the service is poisoned and already-queued mutations are rejected.

## Prerequisites and operational limits

The backup, migration, and restore commands require PostgreSQL client tools
(`pg_dump` and `pg_restore`) on the operator machine. `docker compose up -d
postgres` starts a local PostgreSQL 17 service for development. After a guarded
migration, `docker compose up --build host` starts the application container.
Change both compose secrets before any non-local use. The hosted HTTP boundary includes an
initial `/api/v1` shared-world transport for Argon2id accounts, bearer
sessions, explicit roles, renewable single-writer leases, immutable revisions,
audits, and resumable SSE notifications. Collaboration metadata is relational
operational state and is not part of canonical simulation output. Legacy run
endpoints remain owner-token authorized.

## Network and TLS boundary

Run the Node host on a private network address and terminate TLS at a managed
reverse proxy or load balancer. Forward only HTTPS traffic to the host, preserve
the `Authorization` header and `Last-Event-ID`, and disable response buffering
for `/api/v1/events` so SSE stays resumable. Do not expose PostgreSQL's port to
the public internet. The Compose `host` health check calls `GET /health`; it
only indicates that the process started after database readiness checks, not
that a browser client owns simulation authority.

Use a unique high-entropy `HOSTED_OWNER_TOKEN`, keep it in a deployment secret
store rather than Compose source, and issue scoped API tokens to integrations.
Bearer session and API tokens must be sent only over TLS in production.

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
