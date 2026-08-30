# Content packs

Content packs are immutable, versioned setting data selected when a world run is
created. A run stores a reference-only root `id` and semantic version plus a
canonical resolved-graph checksum and dependency manifest; restoring it
requires that exact immutable graph. This prevents a later edit from silently
changing canonical simulation history.

## Pack contract

A pack has a `world-simulation-content-pack` manifest, stable identifiers,
exact-version dependencies, ordered person-variable definitions, ordered sparse
influence edges, and optional declarative formulas. Imports are validated,
canonicalized with stable JSON ordering, and saved atomically to IndexedDB or
the hosted PostgreSQL catalog.

The default `setting.preindustrial.default@1.0.0` pack supplies the current
preindustrial person variables and decision influences. Engine-required base
variables remain mandatory so the present simulation systems have defined
semantics; packs may add variables and pack-owned influence edges without a
database schema change.

Dependencies are resolved by exact `{id, version}` into stable dependency
post-order before engine creation. Missing dependencies, cycles, and an
unversioned reference with multiple available versions are explicit errors.
The runtime still uses the root pack's registries: dependencies are retained as
independent authored artifacts rather than silently merged into a different
semantic owner.

## Formula DSL

The formula format is a data-only AST: constants, variable references,
arithmetic, min/max, conditional expressions, and `randomChance`. It has no
source-code evaluation, I/O, time, or ambient randomness. Each chance declares
a stable stream name. The engine prefixes and owns that stream under the
selected pack ID, so it is snapshot-restorable and cannot collide with an
engine subsystem stream. Formula validation rejects malformed structures
before a pack can be stored.

The current engine binding is `decision.<action>.base` for the six action names
(`eat`, `move`, `explore`, `rest`, `socialize`, and `work`). Its result must be
an integer utility weight from 1 to 10,000. The selected decision retains the
formula ID as a structured utility contribution.

## Authoring and use

Open **Settings → Content pack** to inspect or edit JSON, validate/save an
immutable version, and choose the version for the next world commit. Existing
runs remain bound to their original pack. The browser worker receives the
validated resolved graph only as command data and remains the authoritative
engine owner. Loads resolve the saved graph from the catalog before crossing the
worker boundary; reset retains the active resolved graph rather than consulting
the current UI selection.

Ordinary snapshots remain reference-only. Portable run bundles include the
immutable artifacts for their resolved graph and import those artifacts with the
snapshot, telemetry, and statistics in one transaction. An existing immutable
`id@version` with different canonical content rejects the complete import.

For nonvisual workflows:

```powershell
pnpm content-pack validate .\my-pack.json
pnpm content-pack canonicalize .\my-pack.json
```

The hosted catalog exposes owner-authorized `GET /content-packs` and `PUT
/content-packs` resources. `ContentPackClient` provides typed browser/Node
SDK calls for the same endpoints. Capability 3 will publish the versioned
`/api/v1` OpenAPI surface and packaged SDK/CLI distribution.

## Compatibility

Content pack model version, snapshot schema, engine version, and canonical
digest are part of the reproducibility contract. Pack changes require a new
semantic version: catalog implementations reject a different payload at an
existing `id@version`. A snapshot with a missing, graph-checksum-mismatched, or
non-default legacy-unverified pack is rejected, never migrated by guesswork.
The original manifest shape (`schemaVersion: 0`)
is explicitly migrated to version 1 during import; unknown future schemas are
rejected.
