export interface PopulationCohortState {
  version: 3
  id: string
  sourceZoneId: string
  populationCount: number
  householdCount: number
  foodUnits: number
  cellAllocations: { cellId: string; populationCount: number }[]
  ageBands: { children: number; adults: number; elders: number }
  economicProductivityPermille: number
  culturalCohesionPermille: number
  developmentIndexPermille: number
  fictionalInfection?: CohortInfectionState
  lastMigration?: CohortMigrationTrace
  eventTotals: { births: number; deaths: number; migrationIn: number; migrationOut: number }
}

/** Exact aggregate equivalents of the detailed-person disease phases. */
export interface CohortInfectionState {
  version: 1
  pathogenId: string
  incubatingCount: number
  infectiousCount: number
  immuneCount: number
  lastUpdatedTick: number
  lastTrace?: CohortInfectionTrace
}

export interface CohortInfectionTrace {
  tick: number
  pathogenId: string
  susceptibleCount: number
  newIncubatingCount: number
  becameInfectiousCount: number
  recoveredCount: number
  immunityExpiredCount: number
  careCapacityCount: number
  mortalityCount: number
}

export interface CohortMigrationTrace {
  tick: number
  sourceSettlementId: string
  destinationSettlementId: string
  sourceCellId: string
  destinationCellId: string
  populationCount: number
  reason: string
}

/** Bounded aggregate inputs for an authored distant population. */
export interface CohortAuthoringProfile {
  childrenPermille: number
  eldersPermille: number
  economicProductivityPermille: number
  culturalCohesionPermille: number
  developmentIndexPermille: number
}

/** Immutable evidence for a deliberate aggregate/detail conversion. */
export interface PopulationFidelityTransition {
  version: 1
  id: string
  tick: number
  kind: 'materialized' | 'dematerialized'
  cohortId: string
  personIds: string[]
  protectedPersonIds: string[]
  populationCount: number
  rngStream: string
}

/** Authoritative transition ledger; viewport state is intentionally absent. */
export interface PopulationFidelityState {
  version: 1
  nextTransitionSequence: number
  protectedPersonIds: string[]
  transitions: PopulationFidelityTransition[]
}
