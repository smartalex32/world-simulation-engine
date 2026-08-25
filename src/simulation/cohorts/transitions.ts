import type { PopulationCohortState } from '../domain/types'

export const COHORT_TRANSITION_VERSION = 1 as const

export interface CohortMaterializationPlan {
  version: typeof COHORT_TRANSITION_VERSION
  cohortId: string
  sourceZoneId: string
  requestedPopulationCount: number
  availablePopulationCount: number
  materializablePopulationCount: number
  residualPopulationCount: number
  protectedDetailedPersonIds: string[]
  status: 'ready' | 'empty' | 'protected-detail-present'
  cellAllocations: { cellId: string; populationCount: number }[]
}

/**
 * Produces evidence for a future materialization without changing cohort or
 * detailed-person state. The current model refuses automatic conversion while
 * any protected detailed person is supplied, keeping hooks/history explicit.
 */
export function planCohortMaterialization(cohort: PopulationCohortState, requestedPopulationCount: number, protectedDetailedPersonIds: readonly string[] = []): CohortMaterializationPlan {
  if (!Number.isSafeInteger(requestedPopulationCount) || requestedPopulationCount < 1) throw new RangeError('Cohort materialization request must be a positive safe integer')
  const protectedIds = [...new Set(protectedDetailedPersonIds)].sort(compareText)
  const requested = Math.min(requestedPopulationCount, cohort.populationCount)
  const status = cohort.populationCount === 0 ? 'empty' : protectedIds.length > 0 ? 'protected-detail-present' : 'ready'
  const materializablePopulationCount = status === 'ready' ? requested : 0
  return {
    version: COHORT_TRANSITION_VERSION,
    cohortId: cohort.id,
    sourceZoneId: cohort.sourceZoneId,
    requestedPopulationCount: requestedPopulationCount,
    availablePopulationCount: cohort.populationCount,
    materializablePopulationCount,
    residualPopulationCount: cohort.populationCount - materializablePopulationCount,
    protectedDetailedPersonIds: protectedIds,
    status,
    cellAllocations: allocate(cohort.cellAllocations, materializablePopulationCount),
  }
}

function allocate(source: readonly { cellId: string; populationCount: number }[], target: number): { cellId: string; populationCount: number }[] {
  if (target === 0) return []
  const total = source.reduce((sum, allocation) => sum + allocation.populationCount, 0)
  let remaining = target
  return source.map((allocation, index) => {
    const count = index === source.length - 1 ? remaining : Math.floor(allocation.populationCount * target / total)
    remaining -= count
    return { cellId: allocation.cellId, populationCount: count }
  }).filter((allocation) => allocation.populationCount > 0)
}
function compareText(first: string, second: string): number { return first < second ? -1 : first > second ? 1 : 0 }
