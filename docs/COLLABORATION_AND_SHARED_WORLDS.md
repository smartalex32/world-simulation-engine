# Collaboration and Shared Worlds Authority Model

## Status

This is the approved design boundary for future shared-world functionality. It
does not introduce collaboration into the current browser-hosted application.
The current application remains a single-author, worker-owned simulator.

## Purpose

Shared work must preserve the same contracts as a local world:

* a draft is editable but is not an authoritative simulation world;
* an accepted world commit creates a versioned, reproducible simulation input;
* an active simulation has exactly one authoritative executor;
* viewing, rendering, and inspection do not mutate simulation state; and
* no result depends on client timing, network arrival order, or renderer state.

This document deliberately chooses a narrow first collaboration model. It
avoids real-time shared mutable maps, peer-to-peer synchronization, and CRDTs
until a concrete authoring requirement demonstrates that their complexity is
worth the cost.

## Objects and Ownership

| Object | Authoritative owner | Mutability | Collaboration rule |
| --- | --- | --- | --- |
| World draft | Server draft service | Mutable, revisioned | One editor lease at a time |
| Draft revision | Server draft service | Immutable | Includes its parent revision and canonical digest |
| Committed world | World creation service | Immutable | Created from one accepted draft revision |
| Simulation run | Dedicated server worker | Mutable by its worker only | One executor; viewers are read-only |
| Snapshot/checkpoint | Persistence service | Immutable | References run, tick, schema, and engine/model versions |
| Projection/inspector view | Client or projection service | Non-authoritative | May be regenerated at any time |

An account, organization, settlement, or community never grants authority over
simulation state merely because it is associated with a world.

## Roles

The initial hosted product uses explicit world-scoped roles:

* **Owner** — manages access, transfers ownership, starts a draft editing
  session, and commits a world revision into a new run.
* **Editor** — may acquire the draft editing lease when permitted by the owner.
* **Viewer** — may inspect published drafts, committed worlds, projections, and
  run history but cannot submit authoritative mutations.

Role changes, invitations, and audit entries are product metadata. They never
change a canonical world digest or consume simulation RNG.

## Draft Collaboration Model

### Single-writer lease

Only one editor may hold a draft's editing lease. The server grants the lease
with a stable `draftId`, `revision`, `leaseId`, holder identity, and expiry. A
client must include the current `leaseId` and expected revision with every
authoring command.

The server serializes accepted commands in one order. It applies the same
worker-owned validation and canonical ordering used by local draft mutation,
persists a new immutable revision with its parent revision and SHA-256 canonical
payload digest, then publishes the new revision number to viewers. A client
never merges or applies an authoritative draft edit locally.

Lease expiry must be recoverable: a disconnected editor loses the lease after a
bounded interval, and another permitted editor may acquire it. A reconnecting
client must rehydrate the latest server revision before it can edit again.

### Conflict handling

The initial model rejects stale edits rather than attempting a hidden merge.
An edit with a mismatched expected revision or lease is rejected with the
current revision and an explicit reason. The editor can reload, inspect the
change, and deliberately reapply its intended operation.

This choice is intentional. Terrain strokes, zones, settlements, roads, and
population allocations can have semantic conflicts even when their raw cells
do not overlap. A generic last-write-wins or CRDT merge could produce a valid
JSON draft that violates author intent or draft validation.

Future offline branching may create a separate draft with a recorded parent
revision. It must use an explicit comparison/merge workflow; it must not merge
into a shared draft automatically.

### Draft command envelope

The future transport boundary should use a versioned envelope equivalent to:

```ts
type DraftCommandEnvelope = {
  protocolVersion: number
  draftId: string
  expectedRevision: number
  leaseId: string
  clientMutationId: string
  command: DraftCommand
}
```

`clientMutationId` provides idempotent retry handling only. It is not part of
canonical draft or simulation state. The server records the accepted command,
its resulting revision, timestamp, and actor in an audit log separate from the
canonical draft data.

## Simulation Runs

Committing an accepted draft revision creates a new immutable world input and
a new simulation run. It does not change an existing active run. A run command
is sent to the single server-side simulation worker responsible for that run;
the worker owns tick ordering, named RNG streams, snapshots, event generation,
and canonical digest production.

Clients may request steps, play/pause, snapshots, projections, and diagnostics
only when their role permits it. Requests are serialized by the run owner. A
request response includes the observed tick and canonical revision so a client
can distinguish an accepted command from a stale displayed projection.

There is no multi-leader simulation execution, browser authority, or
client-side reconciliation of simulation results.

## Reproducibility and Persistence

Every shared committed world and run retains:

* canonical draft/world data and digest;
* draft, snapshot, protocol, engine, model, generator, and schema versions;
* initial seed and snapshot-restorable named RNG stream state;
* stable command/tick order for authoritative operations; and
* explicit migration or rejection behavior for incompatible inputs.

Audit metadata such as actor identity, lease timing, comment text, and viewer
presence remains outside canonical simulation serialization. It may be stored
alongside the world in hosted persistence, but it must never affect a digest,
RNG draw, action explanation, or authoritative result.

## Server Boundary

The first hosted deployment is a single-node server process with durable
persistence. It exposes typed APIs for identity, world metadata, draft lease
and command handling, run control, snapshots, and bounded projections. Its
simulation workers retain the current worker protocol rather than moving engine
logic into a web request handler or React client.

Scaling to multiple processes is deferred until a measured need exists. If it
is introduced, a run and an active draft lease must be partitioned to exactly
one executor at a time. A queue or durable ownership record may route work, but
must not change command order or simulation output.

## User Experience Requirements

The future UI must make authority visible:

* show whether a world is a draft, committed world, or active run;
* show the current draft revision and editing-lease holder;
* make a read-only view visibly read-only;
* explain rejected or stale commands with the latest revision; and
* distinguish sharing/viewing a world from changing authoritative state.

Presence indicators and comments are optional collaboration metadata. They must
not imply editing authority or simulation membership.

## Delivery Sequence

1. Preserve the current local single-author worker contract.
2. Add hosted identity, world metadata, durable draft revision storage, and the
   single-writer lease protocol.
3. Add read-only shared draft and run projections.
4. Move the existing worker protocol behind a single-node server-run boundary.
5. Add authorized run controls and audit views.
6. Only then evaluate explicit draft branching or merge tools from observed
   authoring needs.

Each step requires persistence, authorization, stale-command, recovery, and
fixed-seed reproducibility tests before the next step begins.

## Explicit Deferrals

This design does not authorize implementation of:

* real-time simultaneous map editing;
* CRDTs, operational transforms, or last-write-wins merge semantics;
* multiplayer simulation authority;
* public sharing or organization administration flows;
* external identity-provider integration;
* server clustering; or
* changes to simulation rules, RNG ownership, snapshot formats, or canonical
  outputs.
