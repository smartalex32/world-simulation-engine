import { describe, expect, it } from 'vitest'
import { populationCheckpointTimeline, regionalChangeSummary, settlementChangeSummaries, summarizeCheckpoint } from './checkpoints'
import { SimulationEngine } from '../simulation/engine/engine'

describe('retained checkpoint history', () => {
  it('derives a bounded settlement observation without assigning membership', async () => {
    const snapshot = await SimulationEngine.create('checkpoint-history').snapshot()
    const checkpoint = summarizeCheckpoint(snapshot)
    expect(checkpoint.tick).toBe(0)
    expect(checkpoint.populationCount).toBe(snapshot.state.people.filter((person) => person.lifeStatus !== 'dead').length)
    expect(checkpoint).toMatchObject({ detailedPopulationCount: checkpoint.populationCount, cohortPopulationCount: 0, cohortHouseholdCount: 0, availableFoodUnits: expect.any(Number) })
    expect(checkpoint.settlements.map((settlement) => settlement.settlementId)).toEqual([...checkpoint.settlements].map((settlement) => settlement.settlementId).sort())
  })

  it('compares only explicitly retained checkpoint values in chronological order', () => {
    const checkpoints = [
      { tick: 336, populationCount: 12, detailedPopulationCount: 7, cohortPopulationCount: 5, cohortHouseholdCount: 2, availableFoodUnits: 30, settlements: [{ settlementId: 'stonehaven', name: 'Stonehaven', residentCount: 8, householdCount: 4, foodStoreUnits: 9, scale: 'village' as const }] },
      { tick: 168, populationCount: 10, detailedPopulationCount: 8, cohortPopulationCount: 2, cohortHouseholdCount: 1, availableFoodUnits: 20, settlements: [{ settlementId: 'stonehaven', name: 'Stonehaven', residentCount: 5, householdCount: 3, foodStoreUnits: 4, scale: 'hamlet' as const }] },
    ]
    expect(populationCheckpointTimeline(checkpoints).map((checkpoint) => checkpoint.tick)).toEqual([168, 336])
    expect(settlementChangeSummaries(checkpoints)).toEqual([{
      settlementId: 'stonehaven', name: 'Stonehaven', firstTick: 168, latestTick: 336,
      firstResidentCount: 5, latestResidentCount: 8, residentDelta: 3, householdDelta: 1, foodStoreDelta: 5, firstScale: 'hamlet', latestScale: 'village',
    }])
    expect(regionalChangeSummary(checkpoints)).toEqual({ firstTick: 168, latestTick: 336, detailedPopulationDelta: -1, cohortPopulationDelta: 3, availableFoodDelta: 10 })
  })
})
