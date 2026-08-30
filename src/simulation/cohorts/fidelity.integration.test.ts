import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import { WorkbenchProjectionBuilder } from '../../projection/buildMapProjection'

function created() {
  const cells = SimulationEngine.create('capability-five-fidelity', 16, 12).project().world.grid.cells.filter((cell) => cell.movementCost > 0 && cell.habitability >= 500).map((cell) => cell.id)
  return SimulationEngine.create({
    seed: 'capability-five-fidelity', name: 'Capability five', width: 16, height: 12, initialPopulationCount: 20,
    populationZones: [
      { id: 'detailed', name: 'Detailed', cellIds: cells.slice(0, 1), populationCount: 20 },
      { id: 'distant', name: 'Distant', cellIds: cells.slice(1, 5), populationCount: 0, cohortPopulationCount: 60 },
    ], settlements: [],
  })
}

describe('authoritative population fidelity transitions', () => {
  it('materializes and restores exact population while retaining conversion evidence', async () => {
    const engine = created()
    const event = engine.materializeCohort('cohort:distant', 12)
    const materialized = engine.project()
    expect(event.event.type).toBe('COHORT_MATERIALIZED')
    expect(materialized.people).toHaveLength(32)
    expect(materialized.cohorts.find((cohort) => cohort.id === 'cohort:distant')?.populationCount).toBe(48)
    expect(materialized.populationFidelity.transitions).toMatchObject([{ kind: 'materialized', populationCount: 12, cohortId: 'cohort:distant' }])
    const added = materialized.populationFidelity.transitions[0]?.personIds ?? []
    expect((await SimulationEngine.restore(await engine.snapshot())).project().populationFidelity).toEqual(materialized.populationFidelity)
    const dematerialized = engine.dematerializePeople(added)
    expect(dematerialized.event.type).toBe('PEOPLE_DEMATERIALIZED')
    expect(engine.project().people).toHaveLength(20)
    expect(engine.project().cohorts.find((cohort) => cohort.id === 'cohort:distant')?.populationCount).toBe(60)
  })

  it('does not permit protected detailed identities to be dematerialized', () => {
    const engine = created()
    engine.materializeCohort('cohort:distant', 3)
    const id = engine.project().populationFidelity.transitions[0]?.personIds[0]
    if (!id) throw new Error('Missing materialized person')
    engine.protectDetailedPeople([id])
    expect(() => engine.dematerializePeople(engine.project().populationFidelity.transitions[0]?.personIds ?? [])).toThrow(/Protected/)
  })

  it('has the same authoritative result regardless of projection requests', async () => {
    const first = created()
    const second = created()
    first.materializeCohort('cohort:distant', 15)
    second.materializeCohort('cohort:distant', 15)
    const source = second.project()
    const builder = new WorkbenchProjectionBuilder(source)
    builder.build(source, { revision: 1, bounds: { minQ: 0, maxQ: 2, minR: 0, maxR: 2 }, projectedHexRadius: 1, overlay: 'terrain' })
    builder.build(source, { revision: 2, bounds: { minQ: 0, maxQ: 15, minR: 0, maxR: 11 }, projectedHexRadius: 24, overlay: 'terrain' })
    first.advance(24)
    second.advance(24)
    expect((await first.snapshot()).digest).toBe((await second.snapshot()).digest)
  })

  it('updates a retained projection builder across materialization, restore, and dematerialization', async () => {
    const engine = created()
    const initial = engine.project()
    const builder = new WorkbenchProjectionBuilder(initial)
    const request = { revision: 1, bounds: { minQ: 0, maxQ: 15, minR: 0, maxR: 11 }, projectedHexRadius: 12, overlay: 'terrain' as const }
    const count = (source: ReturnType<SimulationEngine['project']>) => builder.buildMap(source, request).householdMarkers.reduce((sum, marker) => sum + marker.count, 0)
    const before = count(initial)
    const materialized = engine.materializeCohort('cohort:distant', 12)
    expect(materialized.changeSet.categories).toEqual(expect.arrayContaining(['people', 'locations']))
    expect(materialized.changeSet.cellIds.length).toBeGreaterThan(0)
    const materializedSource = engine.project()
    const addedHouseholds = materializedSource.households.length - initial.households.length
    expect(count(materializedSource)).toBe(before + addedHouseholds)
    const restored = await SimulationEngine.restore(await engine.snapshot())
    expect(count(restored.project())).toBe(before + addedHouseholds)
    const ids = restored.project().populationFidelity.transitions[0]?.personIds ?? []
    const dematerialized = restored.dematerializePeople(ids)
    expect(dematerialized.changeSet.categories).toEqual(expect.arrayContaining(['people', 'locations']))
    expect(dematerialized.changeSet.cellIds.length).toBeGreaterThan(0)
    expect(count(restored.project())).toBe(before)
  })
})
