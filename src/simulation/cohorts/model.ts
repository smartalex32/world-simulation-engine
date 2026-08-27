import type { GeographicCell, PopulationCohortState, PopulationPlacementZone } from '../domain/types'

export const COHORT_MODEL_VERSION = 1 as const

/**
 * Builds static authoritative cohorts from explicit zone allocations without
 * consuming RNG. Later milestones own cohort advancement and materialization.
 */
export function createInitialCohorts(cells: readonly GeographicCell[], zones: readonly PopulationPlacementZone[]): PopulationCohortState[] {
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  return zones
    .filter((zone) => (zone.cohortPopulationCount ?? 0) > 0)
    .map((zone) => createCohort(zone, cellsById))
    .sort((first, second) => compareText(first.id, second.id))
}

export function cohortPopulationByCell(cohorts: readonly PopulationCohortState[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const cohort of cohorts) for (const allocation of cohort.cellAllocations) {
    result.set(allocation.cellId, (result.get(allocation.cellId) ?? 0) + allocation.populationCount)
  }
  return result
}

/**
 * Advances the aggregate food ledger from the cohort's actual cell allocations.
 * It is deterministic, consumes no RNG, and preserves people, households,
 * age bands, and allocations exactly.  A later transition may materialize this
 * same retained aggregate without inventing population.
 */
export function advanceCohortsDaily(cohorts: PopulationCohortState[], cells: GeographicCell[]): void {
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  for (const cohort of [...cohorts].sort((first, second) => compareText(first.id, second.id))) {
    let harvest = 0
    for (const allocation of cohort.cellAllocations) {
      const cell = cellsById.get(allocation.cellId)
      if (!cell) continue
      const collected = Math.min(cell.foodAmount, Math.max(0, Math.floor(allocation.populationCount / 12)))
      cell.foodAmount -= collected
      harvest += collected
    }
    const required = Math.ceil(cohort.populationCount / 3)
    cohort.foodUnits = Math.max(0, cohort.foodUnits + harvest - required)
  }
}

export function validatePopulationCohorts(value: unknown, zones: readonly PopulationPlacementZone[], cells: readonly GeographicCell[]): asserts value is PopulationCohortState[] {
  if (!Array.isArray(value)) throw new Error('Simulation contains invalid cohorts')
  const zonesById = new Map(zones.map((zone) => [zone.id, zone]))
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  const ids = new Set<string>()
  for (const cohort of value as PopulationCohortState[]) {
    if (!cohort || cohort.version !== COHORT_MODEL_VERSION || typeof cohort.id !== 'string' || cohort.id !== `cohort:${cohort.sourceZoneId}` || ids.has(cohort.id)) throw new Error('Simulation contains an invalid cohort identity')
    ids.add(cohort.id)
    const zone = zonesById.get(cohort.sourceZoneId)
    if (!zone || !nonNegativeInteger(cohort.populationCount) || cohort.populationCount > (zone.cohortPopulationCount ?? 0)) throw new Error(`Cohort ${cohort.id} has an invalid population`)
    if (!nonNegativeInteger(cohort.householdCount) || cohort.householdCount !== Math.ceil(cohort.populationCount / 3) || !nonNegativeInteger(cohort.foodUnits)) throw new Error(`Cohort ${cohort.id} has invalid household or food totals`)
    const bands = cohort.ageBands
    if (!bands || !nonNegativeInteger(bands.children) || !nonNegativeInteger(bands.adults) || !nonNegativeInteger(bands.elders) || bands.children + bands.adults + bands.elders !== cohort.populationCount) throw new Error(`Cohort ${cohort.id} has invalid age totals`)
    if (!cohort.eventTotals || Object.values(cohort.eventTotals).some((entry) => !nonNegativeInteger(entry))) throw new Error(`Cohort ${cohort.id} has invalid event totals`)
    if (!Array.isArray(cohort.cellAllocations) || (cohort.populationCount > 0 && cohort.cellAllocations.length === 0) || !canonicalAllocations(cohort.cellAllocations)) throw new Error(`Cohort ${cohort.id} has invalid cell allocations`)
    const allowed = new Set(zone.homeCellIds ?? zone.cellIds)
    if (cohort.cellAllocations.some((allocation) => !allowed.has(allocation.cellId) || !cellsById.get(allocation.cellId)?.movementCost || !positiveInteger(allocation.populationCount)) || cohort.cellAllocations.reduce((sum, allocation) => sum + allocation.populationCount, 0) !== cohort.populationCount) throw new Error(`Cohort ${cohort.id} allocations do not match its zone`)
  }
  const expectedIds = zones.filter((zone) => (zone.cohortPopulationCount ?? 0) > 0).map((zone) => `cohort:${zone.id}`).sort(compareText)
  if (expectedIds.length !== ids.size || expectedIds.some((id) => !ids.has(id))) throw new Error('Simulation cohorts do not match world creation')
}

function createCohort(zone: PopulationPlacementZone, cellsById: ReadonlyMap<string, GeographicCell>): PopulationCohortState {
  const populationCount = zone.cohortPopulationCount ?? 0
  const homeCellIds = (zone.homeCellIds ?? zone.cellIds).filter((cellId) => cellsById.get(cellId)?.movementCost).sort(compareText)
  if (populationCount <= 0 || homeCellIds.length === 0) throw new Error(`Population zone ${zone.id} cannot create a cohort`)
  const base = Math.floor(populationCount / homeCellIds.length)
  const remainder = populationCount % homeCellIds.length
  const cellAllocations = homeCellIds.map((cellId, index) => ({ cellId, populationCount: base + (index < remainder ? 1 : 0) })).filter((allocation) => allocation.populationCount > 0)
  const foodUnits = zone.cellIds.reduce((total, cellId) => total + (cellsById.get(cellId)?.foodAmount ?? 0), 0)
  const children = Math.floor(populationCount / 5)
  const elders = Math.floor(populationCount / 10)
  return { version: COHORT_MODEL_VERSION, id: `cohort:${zone.id}`, sourceZoneId: zone.id, populationCount, householdCount: Math.ceil(populationCount / 3), foodUnits, cellAllocations, ageBands: { children, adults: populationCount - children - elders, elders }, eventTotals: { births: 0, deaths: 0, migrationIn: 0, migrationOut: 0 } }
}

function canonicalAllocations(value: readonly { cellId: string; populationCount: number }[]): boolean {
  return value.every((entry, index) => typeof entry.cellId === 'string' && (index === 0 || value[index - 1]!.cellId < entry.cellId))
}
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0 }
function nonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 }
function compareText(first: string, second: string): number { return first < second ? -1 : first > second ? 1 : 0 }
