import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_REGISTRY_VERSION,
  COMMUNITY_REGISTRY_VERSION,
  DEVELOPMENT_REGISTRY_VERSION,
  HOUSEHOLD_MODEL_VERSION,
  INFLUENCE_REGISTRY_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  VARIABLE_REGISTRY_VERSION,
  type SnapshotEnvelope,
  type WorldProjection,
} from '../domain/types'
import { SimulationEngine } from '../engine/engine'
import { createCommonsActivity, createHouseholdHomeActivity } from '../activities/model'
import { createSnapshot } from '../serialization/snapshot'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { getPersonVariable, setPersonVariable } from '../variables/storage'
import { PERSON_VARIABLE_IDS } from '../variables/types'
import { createCommunityState, createDailyCommunityCounters, createTwoCatchmentGeography } from '../community'

function expectAllVariablesBounded(projection: WorldProjection): void {
  for (const person of projection.people) {
    expect(Object.keys(person.variables)).toEqual([...PERSON_VARIABLE_IDS])
    for (const id of PERSON_VARIABLE_IDS) {
      const value = person.variables[id]
      expect(Number.isSafeInteger(value), `${person.id} ${id} must remain an integer`).toBe(true)
      expect(value, `${person.id} ${id} must remain at least 0`).toBeGreaterThanOrEqual(0)
      expect(value, `${person.id} ${id} must remain at most 1000`).toBeLessThanOrEqual(1000)
    }
  }
}

function cloneSnapshot(snapshot: SnapshotEnvelope): SnapshotEnvelope {
  return structuredClone(snapshot)
}

async function controlledSnapshot(seed: string, personCount: number): Promise<SnapshotEnvelope> {
  const original = await SimulationEngine.create(seed).snapshot()
  const state = structuredClone(original.state)
  const sourceCell = state.world.grid.cells.find(({ movementCost }) => movementCost > 0)
  if (!sourceCell) throw new Error('Controlled scenario requires one passable cell')
  const cell = {
    ...sourceCell,
    id: '0,0',
    q: 0,
    r: 0,
    resourceCapacity: 0,
    foodAmount: 0,
    foodRegenerationPerDay: 0,
  }
  const secondCell = { ...cell, id: '1,0', q: 1 }
  state.world.grid = { width: 2, height: 1, cells: [cell, secondCell] }
  state.config.worldWidth = 2
  state.config.worldHeight = 1
  state.tick = 5
  state.people = state.people.slice(150, 150 + personCount).map((person) => ({
    ...person,
    locationCellId: cell.id,
    homeCellId: cell.id,
    knownCellIds: [cell.id],
    journey: undefined,
    lastDecision: undefined,
    lastEncounter: undefined,
    currentActivity: { kind: 'home' as const, locationId: `activity.home.${person.householdId}`, sinceTick: 0 },
  }))
  state.config.worldCreation = {
    ...state.config.worldCreation,
    width: 2,
    height: 1,
    initialPopulationCount: personCount,
    populationZones: [{ id: 'population-zone-0001', name: 'Controlled population', cellIds: [cell.id], populationCount: personCount }],
    settlements: [],
  }
  const householdIds = new Set(state.people.map(({ householdId }) => householdId))
  state.households = state.households
    .filter(({ id }) => householdIds.has(id))
    .map((household) => ({ ...household, homeCellId: cell.id, memberIds: household.memberIds.filter((id) => state.people.some((person) => person.id === id)) }))
  state.parentChildLinks = []
  state.activityLocations = [
    createCommonsActivity(cell.id),
    createCommonsActivity(secondCell.id),
    ...state.households.map((household) => createHouseholdHomeActivity(household.id, cell.id)),
  ].sort((first, second) => first.id.localeCompare(second.id))
  state.relationships = []
  state.dailySpatialCounters = { travelCost: 0, completedMoves: 0, foodConsumed: 0, failedMeals: 0 }
  state.dailySocialCounters = { encounters: 0, positiveEncounters: 0, neutralEncounters: 0, tenseEncounters: 0, relationshipsFormed: 0 }
  state.dailyActivityCounters = { homePersonHours: personCount * state.tick, commonsPersonHours: 0, travelPersonHours: 0 }
  const catchments = createTwoCatchmentGeography({ cells: state.world.grid.cells, width: 2, height: 1 })
  state.communities = catchments.map((catchment) => ({ ...createCommunityState(catchment, 500, 0), lastUpdatedTick: 0, latestTraces: [] }))
  const exposedPersonIds = state.people.map(({ id }) => id).sort()
  const curiosityPersonHourSum = state.people.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity) * state.tick, 0)
  state.dailyCommunityCounters = state.communities.map((community) => ({
    communityId: community.catchment.id,
    counters: community.catchment.cellIds.includes(cell.id)
      ? { ...createDailyCommunityCounters(), windowStartTick: 1, windowEndTick: 24, exposedPersonIds, exposedPersonHours: personCount * state.tick, curiosityPersonHourSum }
      : { ...createDailyCommunityCounters(), windowStartTick: 1, windowEndTick: 24 },
  }))
  return createSnapshot(state)
}

describe('Milestone 4 deterministic state and persistence', () => {
  it('keeps all nine variables bounded and reproduces state, events, configuration, and RNG streams through 1000 ticks', async () => {
    const first = SimulationEngine.create('milestone-4-1000-ticks')
    const second = SimulationEngine.create('milestone-4-1000-ticks')

    for (const batch of [200, 200, 200, 200, 200]) {
      const firstResult = first.step(batch)
      const secondResult = second.step(batch)
      expect(firstResult.events).toEqual(secondResult.events)
      expect(firstResult.statistics).toEqual(secondResult.statistics)
      expectAllVariablesBounded(firstResult.projection)
      expectAllVariablesBounded(secondResult.projection)
    }

    const firstSnapshot = await first.snapshot()
    const secondSnapshot = await second.snapshot()
    expect(firstSnapshot.state.tick).toBe(1000)
    expect(firstSnapshot.state.config).toEqual(secondSnapshot.state.config)
    expect(firstSnapshot.state.randomStreams).toEqual(secondSnapshot.state.randomStreams)
    expect(firstSnapshot.state).toEqual(secondSnapshot.state)
    expect(firstSnapshot.digest).toBe(secondSnapshot.digest)
  }, 30_000)

  it('round-trips registry versions and all named population/action/encounter streams', async () => {
    const engine = SimulationEngine.create('milestone-4-round-trip')
    engine.step(72)
    const snapshot = await engine.snapshot()

    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION)
    expect(snapshot.state.config.variableRegistryVersion).toBe(VARIABLE_REGISTRY_VERSION)
    expect(snapshot.state.config.influenceRegistryVersion).toBe(INFLUENCE_REGISTRY_VERSION)
    expect(snapshot.state.config.householdModelVersion).toBe(HOUSEHOLD_MODEL_VERSION)
    expect(snapshot.state.config.activityRegistryVersion).toBe(ACTIVITY_REGISTRY_VERSION)
    expect(snapshot.state.config.developmentRegistryVersion).toBe(DEVELOPMENT_REGISTRY_VERSION)
    expect(snapshot.state.config.communityRegistryVersion).toBe(COMMUNITY_REGISTRY_VERSION)
    expect(snapshot.state.randomStreams.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'worldgen',
      'population',
      'actions',
      'encounters',
      `population.variable.${PERSON_VARIABLE_ID.trustPropensity}`,
      `population.variable.${PERSON_VARIABLE_ID.conformity}`,
      `population.variable.${PERSON_VARIABLE_ID.persistence}`,
      `population.variable.${PERSON_VARIABLE_ID.fatigue}`,
      `population.variable.${PERSON_VARIABLE_ID.socialConnection}`,
      'population.households.childAge',
      'population.ageRemainderHours',
      'population.inheritance.person.trait.curiosity',
    ]))

    const restored = await SimulationEngine.restore(snapshot)
    expect(await restored.snapshot()).toEqual(snapshot)
    engine.step(96)
    restored.step(96)
    expect((await restored.snapshot()).digest).toBe((await engine.snapshot()).digest)
  })

  it('applies exact hourly hunger, fatigue, and social-need cadence while a person is traveling', async () => {
    const snapshot = await controlledSnapshot('milestone-4-hourly-cadence', 1)
    const traveler = snapshot.state.people[0]
    if (!traveler) throw new Error('Controlled cadence scenario requires one person')
    setPersonVariable(traveler.variables, PERSON_VARIABLE_ID.hunger, 100)
    setPersonVariable(traveler.variables, PERSON_VARIABLE_ID.fatigue, 100)
    setPersonVariable(traveler.variables, PERSON_VARIABLE_ID.socialConnection, 100)
    traveler.journey = { kind: 'move', destinationCellId: '0,0', totalCost: 5000, remainingCost: 5000 }
    traveler.currentActivity = { kind: 'travel', locationId: null, sinceTick: snapshot.state.tick }

    const engine = await SimulationEngine.restore(await createSnapshot(snapshot.state))
    const result = engine.step(1)
    const updated = result.projection.people[0]
    if (!updated) throw new Error('Controlled cadence scenario lost its person')

    expect(getPersonVariable(updated.variables, PERSON_VARIABLE_ID.hunger)).toBe(112)
    expect(getPersonVariable(updated.variables, PERSON_VARIABLE_ID.fatigue)).toBe(110)
    expect(getPersonVariable(updated.variables, PERSON_VARIABLE_ID.socialConnection)).toBe(108)
    expect(updated.journey?.remainingCost).toBe(4000)
    expect(updated.lastDecision).toBeUndefined()
  })

  it('reduces both participants social need by 140 after cadence and clamps at zero', async () => {
    const snapshot = await controlledSnapshot('milestone-4-encounter-recovery', 2)
    for (const [index, participant] of snapshot.state.people.entries()) {
      setPersonVariable(participant.variables, PERSON_VARIABLE_ID.curiosity, 0)
      setPersonVariable(participant.variables, PERSON_VARIABLE_ID.sociability, 1000)
      setPersonVariable(participant.variables, PERSON_VARIABLE_ID.hunger, 1000)
      setPersonVariable(participant.variables, PERSON_VARIABLE_ID.fatigue, 0)
      setPersonVariable(participant.variables, PERSON_VARIABLE_ID.socialConnection, index === 0 ? 100 : 50)
    }

    const engine = await SimulationEngine.restore(await createSnapshot(snapshot.state))
    const result = engine.step(1)
    expect(result.events.some(({ type }) => type === 'PERSON_ENCOUNTERED')).toBe(true)
    expect(result.projection.people).toHaveLength(2)
    for (const participant of result.projection.people) {
      expect(participant.lastEncounter?.tick).toBe(snapshot.state.tick + 1)
      expect(getPersonVariable(participant.variables, PERSON_VARIABLE_ID.socialConnection)).toBe(0)
    }
  })

  it('rejects snapshots with unsupported registry versions before restoration', async () => {
    const snapshot = await SimulationEngine.create('milestone-4-registry-rejection').snapshot()
    const variableMismatch = cloneSnapshot(snapshot)
    variableMismatch.state.config.variableRegistryVersion += 1
    await expect(SimulationEngine.restore(variableMismatch)).rejects.toThrow('Unsupported variable registry version')

    const influenceMismatch = cloneSnapshot(snapshot)
    influenceMismatch.state.config.influenceRegistryVersion += 1
    await expect(SimulationEngine.restore(influenceMismatch)).rejects.toThrow('Unsupported influence registry version')
  })

  it('rejects malformed variable records in schema-7 snapshots', async () => {
    const snapshot = await SimulationEngine.create('milestone-4-malformed-variables').snapshot()

    const missing = cloneSnapshot(snapshot)
    delete (missing.state.people[0]?.variables as unknown as Record<string, number>)[PERSON_VARIABLE_ID.persistence]
    await expect(SimulationEngine.restore(missing)).rejects.toThrow(`Missing person variable value: ${PERSON_VARIABLE_ID.persistence}`)

    const unknown = cloneSnapshot(snapshot)
    ;(unknown.state.people[0]?.variables as unknown as Record<string, number>)['person.trait.unknown'] = 500
    await expect(SimulationEngine.restore(unknown)).rejects.toThrow('Unknown person variable ID')

    const fractional = cloneSnapshot(snapshot)
    ;(fractional.state.people[0]?.variables as unknown as Record<string, number>)[PERSON_VARIABLE_ID.fatigue] = 1.5
    await expect(SimulationEngine.restore(fractional)).rejects.toThrow('must be a safe integer')

    const outOfRange = cloneSnapshot(snapshot)
    ;(outOfRange.state.people[0]?.variables as unknown as Record<string, number>)[PERSON_VARIABLE_ID.socialConnection] = 1001
    await expect(SimulationEngine.restore(outOfRange)).rejects.toThrow('must be between 0 and 1000')
  })
})
