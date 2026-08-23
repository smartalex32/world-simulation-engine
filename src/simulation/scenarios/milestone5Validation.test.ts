import { describe, expect, it } from 'vitest'
import type { PersonState, SimulationState } from '../domain/types'
import { SimulationEngine } from '../engine/engine'
import { validateHouseholdActivityState } from '../engine/invariants'
import { resolveCurrentActivity, commonsActivityId } from '../activities/model'
import { resolveEncounters } from '../relationships/encounters'
import { calculateCuriosityInheritance } from '../households/inheritance'
import { HOUSEHOLD_GENERATION_STREAM } from '../households/config'
import { RandomProvider } from '../rng/pcg32'
import { createSnapshot } from '../serialization/snapshot'

function cloneState(state: SimulationState): SimulationState {
  return structuredClone(state)
}

function personMap(state: SimulationState): Map<string, PersonState> {
  return new Map(state.people.map((person) => [person.id, person]))
}

describe('Milestone 5 bounded validation', () => {
  it('keeps household membership, parent-child links, activities, and relationships as separate referential graphs', async () => {
    const snapshot = await SimulationEngine.create('milestone-5-topology').snapshot()
    validateHouseholdActivityState(snapshot.state)
    expect(snapshot.state.households).toHaveLength(100)
    expect(snapshot.state.parentChildLinks).toHaveLength(100)
    expect(snapshot.state.relationships).toEqual([])

    const family = snapshot.state.households.find(({ memberIds }) => memberIds.length === 3)
    expect(family?.memberIds).toEqual(['person-0001', 'person-0051', 'person-0101'])
    expect(snapshot.state.parentChildLinks.filter(({ householdId }) => householdId === family?.id)).toHaveLength(2)

    const malformed = cloneState(snapshot.state)
    const first = malformed.households[0]
    if (!first) throw new Error('Missing household fixture')
    first.memberIds = [...first.memberIds].reverse()
    await expect(SimulationEngine.restore(await createSnapshot(malformed))).rejects.toThrow('invalid members')
  })

  it('uses schedule boundaries and does not confuse physical co-location with activity co-location', () => {
    expect(resolveCurrentActivity({
      personId: 'person-1', ageYears: 30, locationCellId: '0,0', householdId: 'household-a', householdHomeCellId: '0,0',
    }, 5)).toMatchObject({ kind: 'home', locationId: 'activity.home.household-a' })
    expect(resolveCurrentActivity({
      personId: 'person-1', ageYears: 30, locationCellId: '0,0', householdId: 'household-a', householdHomeCellId: '0,0',
    }, 6)).toMatchObject({ kind: 'commons', locationId: 'activity.commons.0,0' })
    expect(resolveCurrentActivity({
      personId: 'person-1', ageYears: 17, locationCellId: '0,0', householdId: 'household-a', householdHomeCellId: '0,0',
    }, 7)).toMatchObject({ kind: 'home' })
    expect(resolveCurrentActivity({
      personId: 'person-1', ageYears: 17, locationCellId: '0,0', householdId: 'household-a', householdHomeCellId: '0,0',
    }, 8)).toMatchObject({ kind: 'commons' })
  })

  it('encounters only people sharing the same activity location and excludes travelers', async () => {
    const snapshot = await SimulationEngine.create('milestone-5-activity-pools').snapshot()
    const state = cloneState(snapshot.state)
    const first = state.people[0]
    const second = state.people[1]
    if (!first || !second) throw new Error('Missing activity-pool fixture')
    const cellId = first.locationCellId
    const firstHome = `activity.home.${first.householdId}`
    const secondHome = `activity.home.${second.householdId}`
    first.locationCellId = cellId
    second.locationCellId = cellId
    first.currentActivity = { kind: 'home', locationId: firstHome, sinceTick: 0 }
    second.currentActivity = { kind: 'home', locationId: secondHome, sinceTick: 0 }
    const people = personMap(state)
    const activities = new Map(state.activityLocations.map((location) => [location.id, location]))
    const noCrossHouseholdEncounter = resolveEncounters({
      peopleById: people,
      occupantsByActivityLocation: new Map([[firstHome, [first.id]], [secondHome, [second.id]]]),
      activityLocationsById: activities,
      socializerIds: new Set([first.id]),
      relationshipsById: new Map(),
    }, new RandomProvider('milestone-5-home-pools').stream('encounters'))
    expect(noCrossHouseholdEncounter).toEqual([])

    const commons = commonsActivityId(cellId)
    first.currentActivity = { kind: 'commons', locationId: commons, sinceTick: 0 }
    second.currentActivity = { kind: 'commons', locationId: commons, sinceTick: 0 }
    const sharedCommonsEncounter = resolveEncounters({
      peopleById: people,
      occupantsByActivityLocation: new Map([[commons, [first.id, second.id]]]),
      activityLocationsById: activities,
      socializerIds: new Set([first.id]),
      relationshipsById: new Map(),
    }, new RandomProvider('milestone-5-commons-pools').stream('encounters'))
    expect(sharedCommonsEncounter).toHaveLength(1)

    second.currentActivity = { kind: 'travel', locationId: null, sinceTick: 0 }
    second.journey = { kind: 'move', destinationCellId: cellId, totalCost: 1000, remainingCost: 500 }
    expect(resolveEncounters({
      peopleById: people,
      occupantsByActivityLocation: new Map([[commons, [first.id, second.id]]]),
      activityLocationsById: activities,
      socializerIds: new Set([first.id]),
      relationshipsById: new Map(),
    }, new RandomProvider('milestone-5-travel-pools').stream('encounters'))).toEqual([])
  })

  it('replays bounded inheritance and preserves the high-parent tendency across paired seeds', () => {
    const lowValues: number[] = []
    const highValues: number[] = []
    for (let seed = 0; seed < 128; seed += 1) {
      const lowRandom = new RandomProvider(`paired-${seed}`).stream(HOUSEHOLD_GENERATION_STREAM.curiosityInheritance).nextInt(1001)
      const highRandom = new RandomProvider(`paired-${seed}`).stream(HOUSEHOLD_GENERATION_STREAM.curiosityInheritance).nextInt(1001)
      const low = calculateCuriosityInheritance({ parentIds: ['a', 'b'], parentValuesPermille: [150, 200], randomVariationPermille: lowRandom })
      const high = calculateCuriosityInheritance({ parentIds: ['a', 'b'], parentValuesPermille: [800, 850], randomVariationPermille: highRandom })
      expect(low.valuePermille).toBeGreaterThanOrEqual(0)
      expect(low.valuePermille).toBeLessThanOrEqual(1000)
      expect(high.valuePermille).toBeGreaterThanOrEqual(0)
      expect(high.valuePermille).toBeLessThanOrEqual(1000)
      lowValues.push(low.valuePermille)
      highValues.push(high.valuePermille)
    }
    expect(highValues.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(lowValues.reduce((sum, value) => sum + value, 0))
  })

  it('round-trips schema 12 and all named streams, then continues identically for 168 ticks', async () => {
    const first = SimulationEngine.create('milestone-5-reproducibility')
    const second = SimulationEngine.create('milestone-5-reproducibility')
    first.step(168)
    second.step(168)
    const firstSnapshot = await first.snapshot()
    const secondSnapshot = await second.snapshot()
    expect(firstSnapshot).toEqual(secondSnapshot)
    expect(firstSnapshot.schemaVersion).toBe(13)
    expect(firstSnapshot.state.randomStreams.map(({ name }) => name)).toEqual([...firstSnapshot.state.randomStreams.map(({ name }) => name)].sort())

    const restored = await SimulationEngine.restore(firstSnapshot)
    expect(await restored.snapshot()).toEqual(firstSnapshot)
    first.step(24)
    restored.step(24)
    expect((await restored.snapshot()).digest).toBe((await first.snapshot()).digest)
  }, 30_000)

  it('rejects malformed activity topology and registry versions after digest validation', async () => {
    const snapshot = await SimulationEngine.create('milestone-5-rejections').snapshot()
    const malformedActivity = cloneState(snapshot.state)
    const commons = malformedActivity.activityLocations.find((location) => location.kind === 'commons')
    if (!commons) throw new Error('Missing commons fixture')
    commons.id = 'activity.commons.invalid'
    await expect(SimulationEngine.restore(await createSnapshot(malformedActivity))).rejects.toThrow(/Activity locations|Commons/)

    const malformedVersion = cloneState(snapshot.state)
    malformedVersion.config.activityRegistryVersion += 1
    await expect(SimulationEngine.restore(await createSnapshot(malformedVersion))).rejects.toThrow('Unsupported activity registry version')
  })
})
