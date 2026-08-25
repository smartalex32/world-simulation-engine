import { buildProjectedSettlements } from '../projection/settlements'
import type { SnapshotEnvelope } from '../simulation/domain/types'

/** A bounded, read-only summary derived from one retained authoritative checkpoint. */
export interface HistoricalCheckpoint {
  tick: number
  populationCount: number
  settlements: HistoricalSettlementCheckpoint[]
}

export interface HistoricalSettlementCheckpoint {
  settlementId: string
  name: string
  residentCount: number
  householdCount: number
}

export interface SettlementChangeSummary {
  settlementId: string
  name: string
  firstTick: number
  latestTick: number
  firstResidentCount: number
  latestResidentCount: number
  residentDelta: number
  householdDelta: number
}

/** Does not retain or expose a checkpoint's full world state to the history UI. */
export function summarizeCheckpoint(snapshot: SnapshotEnvelope): HistoricalCheckpoint {
  const state = snapshot.state
  const settlements = buildProjectedSettlements(state.world.settlements, state.world.grid.cells, state.people, state.households)
    .map((settlement) => ({ settlementId: settlement.id, name: settlement.name, residentCount: settlement.nearbyResidentCount, householdCount: settlement.nearbyHouseholdCount }))
    .sort((first, second) => first.settlementId.localeCompare(second.settlementId))
  return {
    tick: state.tick,
    populationCount: state.people.filter((person) => person.lifeStatus !== 'dead').length,
    settlements,
  }
}

export function populationCheckpointTimeline(checkpoints: readonly HistoricalCheckpoint[]): HistoricalCheckpoint[] {
  return [...checkpoints].sort((first, second) => first.tick - second.tick)
}

/** Compares only retained checkpoints; it never fills gaps by replaying a run. */
export function settlementChangeSummaries(checkpoints: readonly HistoricalCheckpoint[]): SettlementChangeSummary[] {
  const bySettlement = new Map<string, Array<HistoricalSettlementCheckpoint & { tick: number }>>()
  for (const checkpoint of populationCheckpointTimeline(checkpoints)) for (const settlement of checkpoint.settlements) {
    const samples = bySettlement.get(settlement.settlementId)
    if (samples) samples.push({ ...settlement, tick: checkpoint.tick })
    else bySettlement.set(settlement.settlementId, [{ ...settlement, tick: checkpoint.tick }])
  }
  return [...bySettlement.entries()].flatMap(([settlementId, samples]) => {
    const first = samples[0]
    const latest = samples.at(-1)
    if (!first || !latest) return []
    return [{ settlementId, name: first.name, firstTick: first.tick, latestTick: latest.tick, firstResidentCount: first.residentCount, latestResidentCount: latest.residentCount, residentDelta: latest.residentCount - first.residentCount, householdDelta: latest.householdCount - first.householdCount }]
  }).sort((first, second) => first.name.localeCompare(second.name) || first.settlementId.localeCompare(second.settlementId))
}
