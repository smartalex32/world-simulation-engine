import { describe, expect, it } from 'vitest'
import { createCommonsActivity, createHouseholdHomeActivity } from '../activities/model'
import { scheduleForAge } from '../activities/config'
import { applyParentCuriosityDevelopment } from '../development/apply'
import type { PersonState, SimulationState } from '../domain/types'
import { SimulationEngine } from '../engine/engine'
import { createParentCuriosityExposureAccumulator, PARENT_CURIOSITY_EXPOSURE_CHANNEL, PARENT_CURIOSITY_EXPERIENCE_TYPE } from '../exposure/model'
import { createSnapshot } from '../serialization/snapshot'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { getPersonVariable, setPersonVariable } from '../variables/storage'
import { createCommunityState, createDailyCommunityCounters, createTwoCatchmentGeography } from '../community'
import { createLocalGovernance } from '../governance/model'

interface ControlledOptions {
  secondParentAway?: boolean
  childAway?: boolean
  parentCuriosity?: number
  childCuriosity?: number
}

async function controlledEngine(options: ControlledOptions = {}): Promise<SimulationEngine> {
  const source = (await SimulationEngine.create('milestone-5b-controlled').snapshot()).state
  const state = structuredClone(source)
  const passable = state.world.grid.cells.filter(({ movementCost }) => movementCost > 0)
  const firstSource = passable[0]
  const secondSource = passable[1]
  if (!firstSource || !secondSource) throw new Error('Controlled development fixture needs two passable cells')
  const homeCell = { ...firstSource, id: '0,0', q: 0, r: 0, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 }
  const awayCell = { ...secondSource, id: '10,10', q: 10, r: 10, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 }
  state.world.grid = { width: 2, height: 1, cells: [homeCell, awayCell] }
  state.markets = []
  state.economy = { version: 1, markets: [], tradeTraces: [], productionTraces: [], wageTraces: [], totalTaxCollectedUnits: 0 }
  state.organizations = []
  state.infrastructure = []
  state.disputes = []
  state.config.worldWidth = 2
  state.config.worldHeight = 1
  state.tick = 0
  state.nextEventSequence = 1

  const retainedIds = new Set(['person-0001', 'person-0051', 'person-0101', 'person-0151'])
  state.people = state.people.filter(({ id }) => retainedIds.has(id))
  state.config.worldCreation = {
    ...state.config.worldCreation,
    width: 2,
    height: 1,
    initialPopulationCount: state.people.length,
    populationZones: [{ id: 'population-zone-0001', name: 'Controlled population', cellIds: [homeCell.id], populationCount: state.people.length }],
    settlements: [],
  }
  const peopleById = new Map(state.people.map((person) => [person.id, person]))
  const parentA = requiredPerson(peopleById, 'person-0001')
  const parentB = requiredPerson(peopleById, 'person-0051')
  const child = requiredPerson(peopleById, 'person-0101')
  const nonParent = requiredPerson(peopleById, 'person-0151')
  configurePerson(parentA, 30, homeCell.id, options.parentCuriosity ?? 600)
  configurePerson(parentB, 30, homeCell.id, options.parentCuriosity ?? 800)
  configurePerson(child, 10, homeCell.id, options.childCuriosity ?? 400)
  configurePerson(nonParent, 30, homeCell.id, 1000)

  state.households = state.households
    .filter(({ id }) => id === 'household-0001' || id === 'household-0051')
    .map((household) => ({ ...household, homeCellId: homeCell.id, memberIds: household.memberIds.filter((id) => retainedIds.has(id)) }))
  state.parentChildLinks = state.parentChildLinks.filter(({ childId }) => child.id === childId)
  state.activityLocations = [
    createCommonsActivity(homeCell.id),
    createCommonsActivity(awayCell.id),
    ...state.households.map(({ id }) => createHouseholdHomeActivity(id, homeCell.id)),
  ].sort(compareIds)

  for (const person of state.people) {
    const household = state.households.find(({ id }) => id === person.householdId)
    if (!household) throw new Error(`Controlled fixture missing household ${person.householdId}`)
    person.homeCellId = homeCell.id
    person.knownCellIds = [homeCell.id]
    person.activityScheduleId = scheduleForAge(person.ageYears)
    person.currentActivity = { kind: 'home', locationId: household.homeActivityLocationId, sinceTick: 0 }
    person.development = { exposures: [{ ...createParentCuriosityExposureAccumulator(1), sourcePersonIds: [] }] }
    person.journey = undefined
    person.lastDecision = undefined
    person.lastEncounter = undefined
  }
  if (options.secondParentAway) makeLongTermTraveler(parentB, awayCell.id, homeCell.id)
  if (options.childAway) makeLongTermTraveler(child, awayCell.id, homeCell.id)

  state.relationships = []
  state.dailySpatialCounters = { travelCost: 0, completedMoves: 0, foodConsumed: 0, failedMeals: 0 }
  state.dailySocialCounters = { encounters: 0, positiveEncounters: 0, neutralEncounters: 0, tenseEncounters: 0, relationshipsFormed: 0 }
  state.dailyActivityCounters = { homePersonHours: 0, commonsPersonHours: 0, travelPersonHours: 0 }
  state.dailyDevelopmentCounters = { parentChildCoExposureSourceHours: 0, developmentExperiences: 0, developmentChanges: 0, absoluteCuriosityChange: 0, broaderDevelopmentExperiences: 0, broaderDevelopmentChanges: 0 }
  const catchments = createTwoCatchmentGeography({ cells: state.world.grid.cells, width: 2, height: 1 })
  state.communities = catchments.map((catchment) => ({ ...createCommunityState(catchment, 500, 0), lastUpdatedTick: 0, latestTraces: [] }))
  state.dailyCommunityCounters = state.communities.map((community) => ({
    communityId: community.catchment.id,
    counters: { ...createDailyCommunityCounters(), windowStartTick: 1, windowEndTick: 24 },
  }))
  state.governance = createLocalGovernance(state.communities, state.people)
  return SimulationEngine.restore(await createSnapshot(state))
}

function configurePerson(person: PersonState, ageYears: number, cellId: string, curiosity: number): void {
  person.ageYears = ageYears
  person.ageHoursIntoYear = 0
  person.locationCellId = cellId
  setPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity, curiosity)
}

function makeLongTermTraveler(person: PersonState, locationCellId: string, destinationCellId: string): void {
  person.locationCellId = locationCellId
  person.currentActivity = { kind: 'travel', locationId: null, sinceTick: 0 }
  person.journey = { kind: 'move', destinationCellId, totalCost: 10_000_000, remainingCost: 10_000_000 }
}

function requiredPerson(people: ReadonlyMap<string, PersonState>, id: string): PersonState {
  const person = people.get(id)
  if (!person) throw new Error(`Missing controlled person ${id}`)
  return person
}

function compareIds(first: { id: string }, second: { id: string }): number {
  return first.id < second.id ? -1 : first.id > second.id ? 1 : 0
}

function childFrom(engineResult: ReturnType<SimulationEngine['step']>): PersonState {
  const child = engineResult.projection.people.find(({ id }) => id === 'person-0101')
  if (!child) throw new Error('Controlled result lost its child')
  return child
}

describe('Milestone 5B exposure and development integration', () => {
  it('counts exact one- and two-parent hours while excluding a co-located non-parent', async () => {
    const twoParentResult = (await controlledEngine()).step(24)
    const twoParentExposure = childFrom(twoParentResult).development.exposures[0]
    expect(twoParentExposure).toMatchObject({
      channelId: PARENT_CURIOSITY_EXPOSURE_CHANNEL,
      recipientHours: 12,
      sourceHours: 24,
      weightedSourceValueHours: 16_800,
      sourcePersonIds: ['person-0001', 'person-0051'],
    })
    expect(twoParentExposure?.sourcePersonIds).not.toContain('person-0151')

    const oneParentResult = (await controlledEngine({ secondParentAway: true })).step(24)
    expect(childFrom(oneParentResult).development.exposures[0]).toMatchObject({
      recipientHours: 12,
      sourceHours: 12,
      weightedSourceValueHours: 7_200,
      sourcePersonIds: ['person-0001'],
    })
  })

  it('does not grant exposure or experience from household membership without co-presence', async () => {
    const engine = await controlledEngine({ childAway: true })
    const result = engine.step(720)
    const child = childFrom(result)
    expect(child.development.exposures[0]).toEqual({ ...createParentCuriosityExposureAccumulator(721), sourcePersonIds: [] })
    expect(child.development.lastExperience).toBeUndefined()
    expect(child.development.lastChange).toBeUndefined()
    expect(result.events.some(({ type, payload }) => payload.personId === child.id && (type === 'PERSON_EXPERIENCED_PARENT_MODELING' || type === 'PERSON_VARIABLE_DEVELOPED'))).toBe(false)
  })

  it('creates one monthly experience and applies the exact childhood change before aging', async () => {
    const engine = await controlledEngine({ parentCuriosity: 900, childCuriosity: 400 })
    const result = engine.step(720)
    const child = childFrom(result)
    expect(child.development.lastExperience).toMatchObject({
      id: `person-0101:1-720:${PARENT_CURIOSITY_EXPERIENCE_TYPE}`,
      personId: 'person-0101',
      sourcePersonIds: ['person-0001', 'person-0051'],
      startTick: 1,
      endTick: 720,
      recipientHours: 360,
      sourceHours: 720,
      sourceMeanPermille: 900,
      exposureStrengthPermille: 1000,
    })
    expect(child.development.lastChange).toMatchObject({
      previousValue: 400,
      sourceValuePermille: 900,
      ageBand: 'childhood',
      plasticityPermille: 30,
      requestedDelta: 15,
      appliedDelta: 15,
      currentValue: 415,
    })
    expect(getPersonVariable(child.variables, PERSON_VARIABLE_ID.curiosity)).toBe(415)
    expect(result.events.some(({ type }) => type === 'PERSON_EXPERIENCED_PARENT_MODELING')).toBe(true)
    expect(result.events.some(({ type }) => type === 'PERSON_VARIABLE_DEVELOPED')).toBe(true)
    const finalDailySamples = result.statistics.filter(({ tick }) => tick === 720)
    expect(finalDailySamples.find(({ metricId }) => metricId === 'development.experiences')?.value).toBe(1)
    expect(finalDailySamples.find(({ metricId }) => metricId === 'development.curiosityChanges')?.value).toBe(1)
    expect(finalDailySamples.find(({ metricId }) => metricId === 'development.absoluteCuriosityChange')?.value).toBe(15)
  })

  it('orders age-band effects and preserves signed rounding and bounds', () => {
    const experience = {
      type: PARENT_CURIOSITY_EXPERIENCE_TYPE,
      channelId: PARENT_CURIOSITY_EXPOSURE_CHANNEL,
      recipientId: 'recipient',
      sourcePersonIds: ['parent'],
      windowStartTick: 1,
      windowEndTick: 720,
      recipientHours: 360,
      sourceHours: 720,
      sourceMeanPermille: 900,
      exposureStrengthPermille: 1000,
    } as const
    const deltas = [10, 15, 30, 65].map((ageYears) => applyParentCuriosityDevelopment({ currentCuriosityPermille: 400, ageYears, experience }).trace.appliedDeltaPermille)
    expect(deltas[0]).toBeGreaterThan(deltas[1] as number)
    expect(deltas[1]).toBeGreaterThan(deltas[2] as number)
    expect(deltas[2]).toBeGreaterThanOrEqual(deltas[3] as number)
    const negative = applyParentCuriosityDevelopment({ currentCuriosityPermille: 500, ageYears: 0, experience: { ...experience, sourceMeanPermille: 0, exposureStrengthPermille: 100 } })
    const positive = applyParentCuriosityDevelopment({ currentCuriosityPermille: 500, ageYears: 0, experience: { ...experience, sourceMeanPermille: 1000, exposureStrengthPermille: 100 } })
    expect(positive.trace.appliedDeltaPermille).toBe(-negative.trace.appliedDeltaPermille)
    expect(negative.currentValuePermille).toBeGreaterThanOrEqual(0)
    expect(positive.currentValuePermille).toBeLessThanOrEqual(1000)
  })

  it('restores at ticks 719 and 721 without changing cadence or output', async () => {
    const uninterrupted = await controlledEngine({ parentCuriosity: 900, childCuriosity: 400 })
    uninterrupted.step(719)
    const restoredAt719 = await SimulationEngine.restore(await uninterrupted.snapshot())
    uninterrupted.step(2)
    restoredAt719.step(2)
    expect((await restoredAt719.snapshot()).digest).toBe((await uninterrupted.snapshot()).digest)

    const restoredAt721 = await SimulationEngine.restore(await uninterrupted.snapshot())
    uninterrupted.step(23)
    restoredAt721.step(23)
    expect((await restoredAt721.snapshot()).digest).toBe((await uninterrupted.snapshot()).digest)
  })

  it('is fixed-seed reproducible across multiple development windows', async () => {
    const first = await controlledEngine({ parentCuriosity: 900, childCuriosity: 400 })
    const second = await controlledEngine({ parentCuriosity: 900, childCuriosity: 400 })
    for (const hours of [720, 720]) {
      expect(first.step(hours).statistics).toEqual(second.step(hours).statistics)
    }
    const firstSnapshot = await first.snapshot()
    const secondSnapshot = await second.snapshot()
    expect(firstSnapshot.digest).toBe(secondSnapshot.digest)
    const child = firstSnapshot.state.people.find(({ id }) => id === 'person-0101')
    expect(child?.development.lastExperience?.startTick).toBe(721)
    expect(child?.development.lastExperience?.endTick).toBe(1440)
    expect(child?.development.lastChange?.appliedDelta).not.toBe(0)
  }, 30_000)
})
