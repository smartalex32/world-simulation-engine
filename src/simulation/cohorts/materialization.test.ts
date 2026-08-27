import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import { materializeCohortPeople } from './materialization'

describe('cohort materialization', () => {
  it('creates deterministic collision-free normal people and only home locations', () => {
    const cells = SimulationEngine.create('cohort-people', 8, 8).project().world.grid.cells.filter((cell) => cell.movementCost > 0 && cell.habitability >= 500).map((cell) => cell.id)
    const source = SimulationEngine.create({ seed: 'cohort-people', name: 'Cohort people', width: 8, height: 8, initialPopulationCount: 10, populationZones: [{ id: 'detailed', name: 'Detailed', cellIds: cells.slice(0, 1), populationCount: 10 }, { id: 'cohort', name: 'Cohort', cellIds: cells.slice(1, 3), populationCount: 0, cohortPopulationCount: 12 }], settlements: [] }).project()
    const zone = source.populationZones.find((candidate) => candidate.id === 'cohort')
    if (!zone) throw new Error('Missing cohort zone')
    const first = materializeCohortPeople({ cohortId: 'cohort:cohort', transitionSequence: 1, seed: source.seed, cells: source.world.grid.cells, sourceZone: zone, populationCount: 12 })
    const second = materializeCohortPeople({ cohortId: 'cohort:cohort', transitionSequence: 1, seed: source.seed, cells: source.world.grid.cells, sourceZone: zone, populationCount: 12 })
    expect(first).toEqual(second)
    expect(first.people).toHaveLength(12)
    expect(new Set(first.people.map((person) => person.id)).size).toBe(12)
    expect(first.activityLocations.every((location) => location.kind === 'home')).toBe(true)
  })
})
