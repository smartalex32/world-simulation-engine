import type { PersonState, PopulationCohortState } from '../domain/types'

/** Canonical population evidence used before and after any fidelity transition. */
export interface PopulationReconciliation {
  detailedPopulationCount: number
  cohortPopulationCount: number
  totalPopulationCount: number
  cohortAllocationPopulationCount: number
  conserved: boolean
}

/** Pure, deterministic reconciliation; no viewport or scheduling input participates. */
export function reconcilePopulation(people: readonly Pick<PersonState, 'lifeStatus'>[], cohorts: readonly PopulationCohortState[]): PopulationReconciliation {
  const detailedPopulationCount = people.filter((person) => person.lifeStatus !== 'dead').length
  const cohortPopulationCount = cohorts.reduce((total, cohort) => total + cohort.populationCount, 0)
  const cohortAllocationPopulationCount = cohorts.reduce((total, cohort) => total + cohort.cellAllocations.reduce((sum, allocation) => sum + allocation.populationCount, 0), 0)
  return { detailedPopulationCount, cohortPopulationCount, totalPopulationCount: detailedPopulationCount + cohortPopulationCount, cohortAllocationPopulationCount, conserved: cohortPopulationCount === cohortAllocationPopulationCount }
}
