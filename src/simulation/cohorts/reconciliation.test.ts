import { describe, expect, it } from 'vitest'
import { reconcilePopulation } from './reconciliation'

describe('population reconciliation', () => {
  it('keeps detailed and cohort totals explicit without viewport input', () => {
    const result = reconcilePopulation([{ lifeStatus: 'alive' }, { lifeStatus: 'dead' }] as never, [{ populationCount: 10, cellAllocations: [{ cellId: '0,0', populationCount: 6 }, { cellId: '1,0', populationCount: 4 }] } as never])
    expect(result).toEqual({ detailedPopulationCount: 1, cohortPopulationCount: 10, totalPopulationCount: 11, cohortAllocationPopulationCount: 10, conserved: true })
  })
})
