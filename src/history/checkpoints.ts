import type { WorkbenchSnapshotEnvelope } from '../worker/protocol'

/** Bounded read-only checkpoint metadata. Loading is deliberately excluded. */
export interface HistoricalCheckpoint { id: string; tick: number; snapshot: WorkbenchSnapshotEnvelope }
export interface CheckpointComparison { earlierTick: number; laterTick: number; populationDelta: number; householdFoodDelta: number; personChanges: { personId: string; hungerDelta: number; locationChanged: boolean }[] }

export function checkpointId(snapshot: WorkbenchSnapshotEnvelope): string { return `${snapshot.state.runId}:checkpoint:${snapshot.state.tick}` }
export function createCheckpoint(snapshot: WorkbenchSnapshotEnvelope): HistoricalCheckpoint { return { id: checkpointId(snapshot), tick: snapshot.state.tick, snapshot: structuredClone(snapshot) } }
export function compareCheckpoints(earlier: HistoricalCheckpoint, later: HistoricalCheckpoint): CheckpointComparison {
  if (earlier.snapshot.state.runId !== later.snapshot.state.runId || earlier.tick >= later.tick) throw new Error('Checkpoints must be from one run in chronological order')
  const before = new Map(earlier.snapshot.state.people.map((person) => [person.id, person]))
  return { earlierTick: earlier.tick, laterTick: later.tick,
    populationDelta: later.snapshot.state.people.length - earlier.snapshot.state.people.length,
    householdFoodDelta: later.snapshot.state.households.reduce((sum, household) => sum + (household.inventory?.food ?? 0), 0) - earlier.snapshot.state.households.reduce((sum, household) => sum + (household.inventory?.food ?? 0), 0),
    personChanges: later.snapshot.state.people.map((person) => { const prior = before.get(person.id); return !prior ? undefined : { personId: person.id, hungerDelta: person.variables['person.state.hunger'] - prior.variables['person.state.hunger'], locationChanged: person.locationCellId !== prior.locationCellId } }).filter((value): value is { personId: string; hungerDelta: number; locationChanged: boolean } => value !== undefined).sort((a, b) => a.personId.localeCompare(b.personId)),
  }
}
