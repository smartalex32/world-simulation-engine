import { describe, expect, it } from 'vitest'
import type { ActionContext } from '../agents/actions'
import { chooseAction, evaluateActions } from '../agents/actions'
import {
  COMMUNITY_EMERGENT_IDS,
  COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID,
  createCommunityState,
  type CommunityEmergentValues,
  type CommunitySimulationState,
} from '../community'
import type { GeographicCell, PersonState } from '../domain/types'
import { SimulationEngine } from '../engine/engine'
import { createParentCuriosityExposureAccumulator } from '../exposure/model'
import { Pcg32, hashSeed } from '../rng/pcg32'
import { createSnapshot } from '../serialization/snapshot'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { createDefaultPersonVariableValues } from '../variables/storage'

const homeCell: GeographicCell = { id: '0,0', q: 0, r: 0, terrain: 'plain', elevation: 100, habitability: 900, movementCost: 1000, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 }
const unknownCell: GeographicCell = { ...homeCell, id: '1,0', q: 1 }

function person(knownCellIds = [homeCell.id]): PersonState {
  return {
    id: 'person-a', ageYears: 30, ageHoursIntoYear: 0, locationCellId: homeCell.id, homeCellId: homeCell.id,
    householdId: 'household-a', activityScheduleId: 'activity.schedule.adult.v1', currentActivity: { kind: 'home', locationId: 'activity.home.household-a', sinceTick: 0 },
    originTraces: [], development: { exposures: [{ ...createParentCuriosityExposureAccumulator(1), sourcePersonIds: [] }] },
    variables: createDefaultPersonVariableValues({
      [PERSON_VARIABLE_ID.curiosity]: 500,
      [PERSON_VARIABLE_ID.riskTolerance]: 500,
      [PERSON_VARIABLE_ID.sociability]: 500,
      [PERSON_VARIABLE_ID.hunger]: 0,
      [PERSON_VARIABLE_ID.fatigue]: 0,
      [PERSON_VARIABLE_ID.socialConnection]: 500,
    }),
    knownCellIds,
  }
}

function community(values: Partial<CommunityEmergentValues>): CommunitySimulationState {
  const base = createCommunityState({ id: 'community-west-valley', displayName: 'West Valley', anchorCellId: homeCell.id, cellIds: [homeCell.id] })
  return { ...base, emergent: { ...base.emergent, ...values }, lastUpdatedTick: 24, latestTraces: [] }
}

function context(currentCommunity?: CommunitySimulationState, withCompany = true): ActionContext {
  return {
    tick: 25,
    cellById: new Map([[homeCell.id, homeCell], [unknownCell.id, unknownCell]]),
    occupantsByCell: new Map([[homeCell.id, withCompany ? ['person-a', 'person-b'] : ['person-a']]]),
    occupantsByActivityLocation: new Map([['activity.home.household-a', withCompany ? ['person-a', 'person-b'] : ['person-a']]]),
    communityByCellId: currentCommunity ? new Map([[homeCell.id, currentCommunity]]) : new Map(),
  }
}

describe('Milestone 6 opportunity-gated feedback', () => {
  const high = community({
    'community.emergent.socialTrust': 1000,
    'community.emergent.cohesion': 1000,
    'community.emergent.cooperation': 1000,
    'community.emergent.conflict': 0,
    'community.emergent.innovationClimate': 1000,
  })
  const low = community({
    'community.emergent.socialTrust': 0,
    'community.emergent.cohesion': 0,
    'community.emergent.cooperation': 0,
    'community.emergent.conflict': 1000,
    'community.emergent.innovationClimate': 0,
  })

  it('adds exact centered contributions only from the actual current-cell catchment', () => {
    const candidates = evaluateActions(person(), context(high))
    const socialize = candidates.find(({ action }) => action === 'socialize')
    const explore = candidates.find(({ action }) => action === 'explore')
    expect(socialize?.contributions.filter(({ kind }) => kind === 'communityInfluence')).toEqual([
      expect.objectContaining({ communityId: high.catchment.id, sourceId: 'community.emergent.socialTrust', sourceValue: 1000, centeredSourceValue: 500, weightPermille: 240, value: 120 }),
      expect.objectContaining({ communityId: high.catchment.id, sourceId: 'community.emergent.cohesion', value: 80 }),
      expect.objectContaining({ communityId: high.catchment.id, sourceId: 'community.emergent.cooperation', value: 70 }),
      expect.objectContaining({ communityId: high.catchment.id, sourceId: 'community.emergent.conflict', sourceValue: 0, centeredSourceValue: -500, weightPermille: -160, value: 80 }),
    ])
    expect(explore?.contributions.find(({ kind }) => kind === 'communityInfluence')).toEqual(expect.objectContaining({ sourceId: 'community.emergent.innovationClimate', value: 110 }))

    const otherCatchmentOnly = { ...context(undefined), communityByCellId: new Map([[unknownCell.id, high]]) }
    expect(evaluateActions(person(), otherCatchmentOnly).flatMap(({ contributions }) => contributions).some(({ kind }) => kind === 'communityInfluence')).toBe(false)
  })

  it('does not invent unavailable socialize or explore opportunities', () => {
    expect(evaluateActions(person(), context(high, false)).some(({ action }) => action === 'socialize')).toBe(false)
    expect(evaluateActions(person([homeCell.id, unknownCell.id]), context(high)).some(({ action }) => action === 'explore')).toBe(false)
  })

  it('selects socialize and explore more often in supportive communities across repeated seeds', () => {
    const innovative = community({ 'community.emergent.innovationClimate': 1000 })
    const stagnant = community({ 'community.emergent.innovationClimate': 0 })
    let highSocialize = 0
    let lowSocialize = 0
    let highExplore = 0
    let lowExplore = 0
    for (let seed = 0; seed < 2_000; seed += 1) {
      const highAction = chooseAction(person(), context(high), new Pcg32(hashSeed(`community-social-tendency-${seed}`))).action
      const lowAction = chooseAction(person(), context(low), new Pcg32(hashSeed(`community-social-tendency-${seed}`))).action
      const highExploreAction = chooseAction(person(), context(innovative, false), new Pcg32(hashSeed(`community-explore-tendency-${seed}`))).action
      const lowExploreAction = chooseAction(person(), context(stagnant, false), new Pcg32(hashSeed(`community-explore-tendency-${seed}`))).action
      if (highAction === 'socialize') highSocialize += 1
      if (lowAction === 'socialize') lowSocialize += 1
      if (highExploreAction === 'explore') highExplore += 1
      if (lowExploreAction === 'explore') lowExplore += 1
    }
    expect(highSocialize).toBeGreaterThan(lowSocialize + 300)
    expect(highExplore).toBeGreaterThan(lowExplore + 100)
  })
})

describe('Milestone 6 authoritative integration', () => {
  it('initializes deterministic full-grid catchments with neutral emergents and structural food security', async () => {
    const snapshot = await SimulationEngine.create('community-initial-state').snapshot()
    expect(snapshot.state.communities.map(({ catchment }) => catchment.id)).toEqual(['community-west-valley', 'community-east-valley'])
    expect(snapshot.state.communities.flatMap(({ catchment }) => catchment.cellIds).sort()).toEqual(snapshot.state.world.grid.cells.map(({ id }) => id).sort())
    expect(new Set(snapshot.state.communities.flatMap(({ catchment }) => catchment.cellIds)).size).toBe(snapshot.state.world.grid.cells.length)
    for (const community of snapshot.state.communities) {
      expect(COMMUNITY_EMERGENT_IDS.map((id) => community.emergent[id])).toEqual([500, 500, 500, 500, 500])
      expect(community.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID]).toBe(1000)
      expect(community.latestTraces).toEqual([])
    }
    expect(snapshot.state.dailyCommunityCounters.map(({ counters }) => [counters.windowStartTick, counters.windowEndTick])).toEqual([[1, 24], [1, 24]])
  })

  it('attributes hourly evidence exactly and resets the next window after boundary aggregation', async () => {
    const engine = SimulationEngine.create('community-attribution')
    const firstHour = engine.step(1)
    const hourOne = await engine.snapshot()
    const counters = hourOne.state.dailyCommunityCounters.map(({ counters }) => counters)
    expect(counters.reduce((sum, value) => sum + value.exposedPersonHours, 0)).toBe(200)
    expect(counters.reduce((sum, value) => sum + value.socializeSelections, 0)).toBe(firstHour.projection.people.filter(({ lastDecision }) => lastDecision?.action === 'socialize').length)
    expect(counters.reduce((sum, value) => sum + value.exploreSelections, 0)).toBe(firstHour.projection.people.filter(({ lastDecision }) => lastDecision?.action === 'explore').length)
    expect(counters.reduce((sum, value) => sum + value.mealAttempts, 0)).toBe(firstHour.projection.people.filter(({ lastDecision }) => lastDecision?.action === 'eat').length)
    expect(counters.reduce((sum, value) => sum + value.encounters, 0)).toBe(firstHour.events.filter(({ type }) => type === 'PERSON_ENCOUNTERED').length)
    expect(counters.reduce((sum, value) => sum + value.explorationArrivals, 0)).toBe(firstHour.events.filter(({ type }) => type === 'PERSON_EXPLORED').length)

    const boundary = engine.step(23)
    expect(boundary.projection.communities.every(({ lastUpdatedTick, latestTraces }) => lastUpdatedTick === 24 && latestTraces.length === 6)).toBe(true)
    expect(boundary.events.filter(({ type }) => type === 'COMMUNITY_MEASURES_UPDATED')).toHaveLength(2)
    expect(boundary.statistics.filter(({ scope }) => scope === 'community')).toHaveLength(16)
    for (const community of boundary.projection.communities) {
      const event = boundary.events.find(({ type, payload }) => type === 'COMMUNITY_MEASURES_UPDATED' && payload.communityId === community.catchment.id)
      expect(event?.payload).toMatchObject({
        windowStartTick: 1,
        windowEndTick: 24,
        socialTrustPermille: community.emergent['community.emergent.socialTrust'],
        socialTrustDeltaPermille: community.emergent['community.emergent.socialTrust'] - 500,
        cohesionPermille: community.emergent['community.emergent.cohesion'],
        cooperationPermille: community.emergent['community.emergent.cooperation'],
        conflictPermille: community.emergent['community.emergent.conflict'],
        innovationClimatePermille: community.emergent['community.emergent.innovationClimate'],
        foodSecurityPermille: community.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID],
      })
      for (const id of COMMUNITY_EMERGENT_IDS) {
        expect(boundary.statistics.find((sample) => sample.scope === 'community' && sample.scopeId === community.catchment.id && sample.metricId === id)?.value).toBe(community.emergent[id])
      }
    }
    const after = await engine.snapshot()
    expect(after.state.dailyCommunityCounters.map(({ counters: value }) => [value.windowStartTick, value.windowEndTick, value.exposedPersonHours])).toEqual([[25, 48, 0], [25, 48, 0]])
  })

  it('aggregates pre-regeneration food evidence and exposes matching event/statistic values', async () => {
    const source = SimulationEngine.create('community-food-order')
    source.step(23)
    const state = structuredClone((await source.snapshot()).state)
    for (const cell of state.world.grid.cells) cell.foodAmount = 0
    const engine = await SimulationEngine.restore(await createSnapshot(state))
    const result = engine.step(1)
    expect(result.projection.world.grid.cells.reduce((sum, cell) => sum + cell.foodAmount, 0)).toBeGreaterThan(0)
    for (const community of result.projection.communities) {
      const foodTrace = community.latestTraces.find(({ variableId }) => variableId === COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID)
      expect(foodTrace?.contributors.find(({ sourceId }) => sourceId === 'environment.food.stockRatio')?.sourceValuePermille).toBe(0)
      const event = result.events.find(({ type, payload }) => type === 'COMMUNITY_MEASURES_UPDATED' && payload.communityId === community.catchment.id)
      const statistic = result.statistics.find((sample) => sample.scope === 'community' && sample.scopeId === community.catchment.id && sample.metricId === COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID)
      expect(event?.payload.foodSecurityPermille).toBe(community.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID])
      expect(statistic?.value).toBe(community.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID])
    }
  })

  it('restores identically across ticks 23, 24, and 25 without allocating community RNG streams', async () => {
    for (const checkpoint of [23, 24, 25]) {
      const uninterrupted = SimulationEngine.create(`community-boundary-${checkpoint}`)
      uninterrupted.step(checkpoint)
      const before = await uninterrupted.snapshot()
      const restored = await SimulationEngine.restore(before)
      uninterrupted.step(48)
      restored.step(48)
      expect((await restored.snapshot()).digest, `checkpoint ${checkpoint}`).toBe((await uninterrupted.snapshot()).digest)
    }
    const rngEngine = SimulationEngine.create('community-rng-contract')
    rngEngine.step(1)
    const namesAfterOne = (await rngEngine.snapshot()).state.randomStreams.map(({ name }) => name)
    rngEngine.step(999)
    const namesAfterThousand = (await rngEngine.snapshot()).state.randomStreams.map(({ name }) => name)
    expect(namesAfterThousand).toEqual(namesAfterOne)
    expect(namesAfterThousand.some((name) => name.includes('community'))).toBe(false)
  }, 30_000)

  it('matches the canonical engine-0.17 1000-tick digest', async () => {
    const engine = SimulationEngine.create('milestone-6-canonical')
    engine.step(1000)
    expect((await engine.snapshot()).digest).toBe('01fab6310733cedf8ea58b9e37e63819ee6a2b10c17c585d77ae3ce7cf44cf93')
  }, 30_000)

  it('rejects malformed catchments and explanation traces', async () => {
    const initial = structuredClone((await SimulationEngine.create('community-invalid-catchment').snapshot()).state)
    const first = initial.communities[0]
    if (!first) throw new Error('Missing controlled community')
    initial.communities[0] = { ...first, catchment: { ...first.catchment, cellIds: first.catchment.cellIds.slice(1) } }
    await expect(SimulationEngine.restore(await createSnapshot(initial))).rejects.toThrow(/catchment|cover/i)

    const source = SimulationEngine.create('community-invalid-trace')
    source.step(24)
    const traced = structuredClone((await source.snapshot()).state)
    const tracedCommunity = traced.communities[0]
    const firstTrace = tracedCommunity?.latestTraces[0]
    const firstContributor = firstTrace?.contributors[0]
    if (!tracedCommunity || !firstTrace || !firstContributor) throw new Error('Missing controlled community trace')
    traced.communities[0] = {
      ...tracedCommunity,
      latestTraces: [{ ...firstTrace, contributors: [{ ...firstContributor, weightedNumerator: firstContributor.weightedNumerator + 1 }, ...firstTrace.contributors.slice(1)] }, ...tracedCommunity.latestTraces.slice(1)],
    }
    await expect(SimulationEngine.restore(await createSnapshot(traced))).rejects.toThrow(/weighted contributor/i)
  })
})
