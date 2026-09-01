import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import type { RandomStreamSnapshot, SimulationState } from '../domain/types'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { setPersonVariable } from '../variables/storage'
import { findPath } from '../spatial/pathfinding'
import { buildHouseholdRelocationIndex, HOUSEHOLD_RELOCATION, evaluateHouseholdRelocation, relocationTrace } from './relocation'

describe('household relocation', () => {
  it('preserves evaluation output when reusable spatial indexes and path diagnostics are enabled', () => {
    const fixture = relocationFixture()
    const indexedDiagnostics = { pathExpansions: 0 }
    const baseline = evaluateHouseholdRelocation(fixture)
    const indexed = evaluateHouseholdRelocation({
      ...fixture,
      index: buildHouseholdRelocationIndex(fixture.cells, fixture.households, fixture.relationships),
      diagnostics: indexedDiagnostics,
    })
    expect(indexed).toEqual(baseline)
    expect(indexedDiagnostics.pathExpansions).toBeGreaterThan(0)
  })
  it('prefers a reachable food-rich home under household scarcity and records the complete trace', () => {
    const fixture = relocationFixture()
    const evaluation = evaluateHouseholdRelocation(fixture)
    expect(evaluation.candidate).toMatchObject({ foodAccessDeltaPermille: 1000 })
    expect(evaluation.probabilityPermille).toBeGreaterThan(0)
    expect(relocationTrace(evaluation, 720, 0)).toMatchObject({ sourceCellId: fixture.source.id, destinationCellId: evaluation.candidate?.destinationCellId, foodReservePressurePermille: HOUSEHOLD_RELOCATION.maximumFoodReservePressurePermille, tick: 720 })
    expect(evaluation.candidate?.settlementUtilityPermille).toEqual(expect.any(Number))
    expect(relocationTrace(evaluation, 720, 999)).toBeUndefined()
  })

  it('raises bounded migration pressure continuously as household food reserves fall', () => {
    const scarce = relocationFixture()
    const secure = relocationFixture()
    secure.household.inventory = { food: secure.household.memberIds.length * HOUSEHOLD_RELOCATION.foodReserveTargetUnitsPerMember, tools: 0 }
    for (const fixture of [scarce, secure]) {
      for (const personId of fixture.household.memberIds) {
        const person = fixture.peopleById.get(personId)
        if (person) setPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger, 400)
      }
    }

    const scarceEvaluation = evaluateHouseholdRelocation(scarce)
    const secureEvaluation = evaluateHouseholdRelocation(secure)

    expect(scarceEvaluation.candidate?.foodReservePressurePermille).toBe(HOUSEHOLD_RELOCATION.maximumFoodReservePressurePermille)
    expect(secureEvaluation.candidate?.foodReservePressurePermille).toBe(0)
    expect(scarceEvaluation.candidate?.utilityPermille).toBeGreaterThan(secureEvaluation.candidate?.utilityPermille ?? Number.POSITIVE_INFINITY)
  })

  it('changes household home, home activity, and member exposure locations only after a successful seeded resolution', () => {
    const engine = SimulationEngine.create('household-relocation-engine') as unknown as TestEngine
    const { household, source, destination } = relocationHomePair(engine.state)
    for (const cell of engine.state.world.grid.cells) {
      cell.resourceCapacity = 0
      cell.foodAmount = 0
    }
    source.resourceCapacity = 100
    destination.resourceCapacity = 100
    destination.foodAmount = 100
    household.inventory = { food: 0, tools: 0 }
    for (const personId of household.memberIds) {
      const person = engine.state.people.find((candidate) => candidate.id === personId)
      if (!person) throw new Error(`Missing fixture member ${personId}`)
      setPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger, 1000)
      setPersonVariable(person.variables, PERSON_VARIABLE_ID.riskTolerance, 1000)
    }
    engine.state.tick = 720
    engine.random = { stream: () => ({ nextInt: () => 0 }), snapshot: () => [] }
    const events: { type: string; payload: Record<string, string | number | boolean | null> }[] = []
    engine.resolveMonthlyHouseholdRelocations((event) => events.push(event))

    const trace = household.lastRelocation
    expect(trace).toMatchObject({ sourceCellId: source.id, randomRollPermille: 0 })
    if (!trace) throw new Error('Expected successful relocation trace')
    expect(household.homeCellId).toBe(trace.destinationCellId)
    expect(engine.state.activityLocations.find((location) => location.id === household.homeActivityLocationId)?.cellId).toBe(trace.destinationCellId)
    expect(household.memberIds.every((personId) => engine.state.people.find((person) => person.id === personId)?.homeCellId === trace.destinationCellId)).toBe(true)
    expect(events).toContainEqual(expect.objectContaining({ type: 'HOUSEHOLD_RELOCATED', payload: expect.objectContaining({ householdId: household.id, destinationCellId: trace.destinationCellId }) }))
  })
})

function relocationFixture() {
  const engine = SimulationEngine.create('household-relocation-model') as unknown as { state: Awaited<ReturnType<SimulationEngine['snapshot']>>['state'] }
  const { household, source, intermediate, destination } = relocationHomePair(engine.state)
  for (const cell of engine.state.world.grid.cells) {
    cell.resourceCapacity = 0
    cell.foodAmount = 0
  }
  source.resourceCapacity = 100
  destination.resourceCapacity = 100
  destination.foodAmount = 100
  household.inventory = { food: 0, tools: 0 }
  for (const personId of household.memberIds) {
    const person = engine.state.people.find((candidate) => candidate.id === personId)
    if (!person) throw new Error(`Missing fixture member ${personId}`)
    setPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger, 1000)
    setPersonVariable(person.variables, PERSON_VARIABLE_ID.riskTolerance, 1000)
  }
  return {
    household,
    source,
    intermediate,
    destination,
    peopleById: new Map(engine.state.people.map((person) => [person.id, person])),
    households: engine.state.households,
    relationships: engine.state.relationships,
    cells: engine.state.world.grid.cells,
    roadCellIds: new Set<string>(),
  }
}

function relocationHomePair(state: Awaited<ReturnType<SimulationEngine['snapshot']>>['state']) {
  const cellsByCoordinate = new Map(state.world.grid.cells.map((cell) => [`${cell.q},${cell.r}`, cell]))
  for (const household of state.households) {
    const source = state.world.grid.cells.find((cell) => cell.id === household.homeCellId)
    if (!source) continue
    const intermediate = cellsByCoordinate.get(`${source.q + 1},${source.r}`)
    const destination = cellsByCoordinate.get(`${source.q + 2},${source.r}`)
    if (intermediate?.movementCost && destination?.movementCost && findPath(state.world.grid, source.id, destination.id)) return { household, source, intermediate, destination }
  }
  throw new Error('Expected two-step passable fixture cells')
}

type TestEngine = Pick<SimulationEngine, 'advance'> & {
  state: SimulationState
  random: {
    stream(name: string): { nextInt(maxExclusive: number): number }
    snapshot(): RandomStreamSnapshot[]
  }
  resolveMonthlyHouseholdRelocations(pushEvent: (event: { type: string; payload: Record<string, string | number | boolean | null> }) => void): void
}
