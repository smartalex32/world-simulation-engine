import { describe, expect, it } from 'vitest'
import { populationCheckpointTimeline, settlementChangeSummaries, summarizeCheckpoint } from './checkpoints'
import { SimulationEngine } from '../simulation/engine/engine'

describe('retained checkpoint history', () => {
  it('derives a bounded settlement observation without assigning membership', async () => {
    const snapshot = await SimulationEngine.create('checkpoint-history').snapshot()
    const checkpoint = summarizeCheckpoint(snapshot)
    expect(checkpoint.tick).toBe(0)
    expect(checkpoint.populationCount).toBe(snapshot.state.people.filter((person) => person.lifeStatus !== 'dead').length)
    expect(checkpoint.settlements.map((settlement) => settlement.settlementId)).toEqual([...checkpoint.settlements].map((settlement) => settlement.settlementId).sort())
  })

  it('compares only explicitly retained checkpoint values in chronological order', () => {
    const checkpoints = [
      { tick: 336, populationCount: 12, settlements: [{ settlementId: 'stonehaven', name: 'Stonehaven', residentCount: 8, householdCount: 4 }] },
      { tick: 168, populationCount: 10, settlements: [{ settlementId: 'stonehaven', name: 'Stonehaven', residentCount: 5, householdCount: 3 }] },
    ]
    expect(populationCheckpointTimeline(checkpoints).map((checkpoint) => checkpoint.tick)).toEqual([168, 336])
    expect(settlementChangeSummaries(checkpoints)).toEqual([{
      settlementId: 'stonehaven', name: 'Stonehaven', firstTick: 168, latestTick: 336,
      firstResidentCount: 5, latestResidentCount: 8, residentDelta: 3, householdDelta: 1,
    }])
  })
})
