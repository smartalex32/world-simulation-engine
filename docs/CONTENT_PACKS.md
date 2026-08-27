# Content packs

Content packs are immutable, versioned setting data selected when a world run is
created. A run stores only the stable `id` and semantic version; restoring it
requires the exact validated pack. This prevents a later edit from silently
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

## Formula DSL

The formula format is a data-only AST: constants, variable references,
arithmetic, min/max, conditional expressions, and `randomChance`. It has no
source-code evaluation, I/O, time, or ambient randomness. Each chance declares
a stable stream name, and callers must supply the controlled RNG adapter.
Formula validation rejects malformed structures before a pack can be stored.

## Authoring and use

Open **Settings → Content pack** to inspect or edit JSON, validate/save an
immutable version, and choose the version for the next world commit. Existing
runs remain bound to their original pack. The browser worker receives the
validated selected pack only as command data and remains the authoritative
engine owner.

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
semantic version. A snapshot with a missing or mismatched pack is rejected,
never migrated by guesswork.
