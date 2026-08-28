import { buildProjectedSettlements } from '../projection/settlements'
import type { SnapshotEnvelope } from '../simulation/domain/types'
import { compareStableText } from '../shared/stableOrder'

/** A bounded, read-only summary derived from one retained authoritative checkpoint. */
export interface HistoricalCheckpoint {
  tick: number
  populationCount: number
  detailedPopulationCount: number
  cohortPopulationCount: number
  cohortHouseholdCount: number
  availableFoodUnits: number
  settlements: HistoricalSettlementCheckpoint[]
}

export interface HistoricalSettlementCheckpoint {
  settlementId: string
  name: string
  residentCount: number
  householdCount: number
  foodStoreUnits: number
  scale: 'landmark' | 'hamlet' | 'village' | 'town' | 'city'
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
  foodStoreDelta: number
  firstScale: HistoricalSettlementCheckpoint['scale']
  latestScale: HistoricalSettlementCheckpoint['scale']
}

export interface RegionalChangeSummary {
  firstTick: number
  latestTick: number
  detailedPopulationDelta: number
  cohortPopulationDelta: number
  availableFoodDelta: number
}

/** Does not retain or expose a checkpoint's full world state to the history UI. */
export function summarizeCheckpoint(snapshot: SnapshotEnvelope): HistoricalCheckpoint {
  const state = snapshot.state
  const detailedPopulationCount = state.people.filter((person) => person.lifeStatus !== 'dead').length
  const cohortPopulationCount = state.cohorts.reduce((sum, cohort) => sum + cohort.populationCount, 0)
  const settlements = buildProjectedSettlements(state.world.settlements, state.world.grid.cells, state.people, state.households)
    .map((settlement) => ({ settlementId: settlement.id, name: settlement.name, residentCount: settlement.nearbyResidentCount, householdCount: settlement.nearbyHouseholdCount, foodStoreUnits: settlement.householdFoodStoreUnits, scale: settlement.scale }))
    .sort((first, second) => compareStableText(first.settlementId, second.settlementId))
  return {
    tick: state.tick,
    populationCount: detailedPopulationCount + cohortPopulationCount,
    detailedPopulationCount,
    cohortPopulationCount,
    cohortHouseholdCount: state.cohorts.reduce((sum, cohort) => sum + cohort.householdCount, 0),
    availableFoodUnits: state.world.grid.cells.reduce((sum, cell) => sum + cell.foodAmount, 0) + state.households.reduce((sum, household) => sum + (household.inventory?.food ?? 0), 0) + state.cohorts.reduce((sum, cohort) => sum + cohort.foodUnits, 0),
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
    return [{ settlementId, name: first.name, firstTick: first.tick, latestTick: latest.tick, firstResidentCount: first.residentCount, latestResidentCount: latest.residentCount, residentDelta: latest.residentCount - first.residentCount, householdDelta: latest.householdCount - first.householdCount, foodStoreDelta: latest.foodStoreUnits - first.foodStoreUnits, firstScale: first.scale, latestScale: latest.scale }]
  }).sort((first, second) => compareStableText(first.name, second.name) || compareStableText(first.settlementId, second.settlementId))
}

/** Compares only retained checkpoints; missing periods are never replayed. */
export function regionalChangeSummary(checkpoints: readonly HistoricalCheckpoint[]): RegionalChangeSummary | undefined {
  const timeline = populationCheckpointTimeline(checkpoints)
  const first = timeline[0]
  const latest = timeline.at(-1)
  if (!first || !latest || first.tick === latest.tick) return undefined
  return {
    firstTick: first.tick,
    latestTick: latest.tick,
    detailedPopulationDelta: latest.detailedPopulationCount - first.detailedPopulationCount,
    cohortPopulationDelta: latest.cohortPopulationCount - first.cohortPopulationCount,
    availableFoodDelta: latest.availableFoodUnits - first.availableFoodUnits,
  }
}
