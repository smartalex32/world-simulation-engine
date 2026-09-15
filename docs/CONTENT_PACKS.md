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

Packs also declare versioned `organizationDefinitions`: stable kind IDs and
display names, purpose IDs, permitted member-role IDs, engine-owned shared-rule
IDs, and explicit initial service semantics. Definitions may additionally opt
into an initial integer goods/currency account and an observer-specific
reputation ledger. Definitions may also opt into engine-owned leadership and
decision policies with allowed roles, bounded candidate/participant counts,
explicit evidence-factor weights, typed alternatives, and safe effect
authorization IDs. Arbitrary pack code is never executed; omitted fields model
none of these capabilities. The current binding creates one
`school` at each authored settlement anchor using the `commons` activity
location and the definition's service capacity. Definition metadata is exposed
read-only in organization projections; membership does not infer relationships,
beliefs, traits, identity, reputation, assets, leadership, or person effects.
The same schema-backed codec is used by browser import, the SDK, and hosted
catalog endpoints, so invalid kinds, roles, purposes, or rule references are
rejected consistently.

The default `setting.preindustrial.default@1.2.0` pack supplies the current
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

## Organization evolution

Content-pack model 5 supports explicit `specialization` values: `institution`,
`informal-group`, and `faction`. These labels never assign personal identity,
culture, or beliefs. Omission defaults to institution; an evolution policy
requires the author to choose a specialization explicitly.

Within an existing `lifecycle` definition, the optional `evolution` object has
its own cadence (a positive multiple of 24 hours), a rotating opportunity budget
`maxTransitionsPerCadence` (1–8), and independently enabled methods. For example:

```json
{
  "cadenceHours": 24,
  "maxTransitionsPerCadence": 2,
  "minimumRelationshipPermille": 250,
  "minimumExposurePermille": 500,
  "minimumConflictPermille": 250,
  "schism": { "enabled": true, "minimumMembers": 4, "splitPermille": 500 },
  "merger": { "enabled": true, "minimumSharedMembers": 2 },
  "dissolution": { "enabled": true, "maximumLivingMembers": 0 }
}
```

This fragment configures evolution only; the containing lifecycle must still
provide valid formation and membership policies. Methods run in dissolution,
schism, merger order until a source accepts one. Sources rotate by tick and
stable ID; at most 16 same-kind/activity merger candidates are inspected per
source. Structural reconciliation supports rosters of at most 128 members and
source accounts with at most 128 distinct goods. Existing larger organizations
remain valid but are outside these structural execution limits.

Schism requires recent decision dissent and at least two dissenting members
supported by real local encounters and recorded familiarity. Only the configured
fraction can move. Merger requires the same kind, location, activity, compatible
roles, overlapping living membership, contact and familiarity; retained dissent
or negative observed reputation blocks it. Curiosity and resource pressure are
recorded explanatory inputs, not additional structural trigger conditions.
These structural methods consume no random draws. Existing formation and
membership continue using their named lifecycle stream.

Schism preserves the parent ID and creates a child; merger creates a child and
archives both parents. Lineage, before/after rosters, and integer resource
reconciliation remain inspectable. Split amounts round down proportionally and
leave the remainder with the parent; mergers sum existing holdings and never
grant definition initial assets again. Dissolution retains remaining funds and
goods in a frozen estate account. Archived organizations retain their closing
roster and pending proposals as history but stop service and governance execution.
Selected structural changes emit durable history events; bounded recent evidence
also includes rejected opportunities.

Physical service assets retain their IDs when reassigned after merger. Schism
divides existing capacity and maintenance units proportionally, preserving
condition and disruption; it does not construct extra buildings. Dissolution
decommissions the assets, so they provide no access and receive no maintenance.
For evolution-enabled schools, attendance is capped by both configured capacity
and effective physical service capacity. These effects emit infrastructure
history events. People referenced by retained organization records remain
detailed when cohort conversion would otherwise remove their identities.

Schema 49 / engine 0.50.0 uses organization model 6 and evolution model 1 for new
runs. Authenticated schemas 47 and 48 migrate with evolution model 0, preserving
their previous behavior. Packs omitting evolution also preserve their previous
event and random-draw contracts. No older formation provenance is invented
during migration.

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
The original manifest shape (`schemaVersion: 0`) and v1 packs without
organization definitions are explicitly migrated during import; unknown future
schemas are rejected. The default pack's organization contract is published as
`1.1.0`, not as a replacement for immutable `1.0.0` bytes. Older
checksum-bound snapshots must be restored with their original pack graph and
are rejected when that graph is unavailable, never reinterpreted by guesswork.
