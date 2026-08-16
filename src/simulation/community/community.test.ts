import { describe, expect, it } from 'vitest'
import type { GeographicCell } from '../domain/types'
import { aggregateCommunityDaily, createCommunityState, meanPermille, NETWORK_DENSITY_REFERENCE_PERMILLE, validateDailyCommunityCounters } from './aggregation'
import { createDailyCommunityCounters } from './counters'
import { COMMUNITY_FEEDBACK_REGISTRY, evaluateCommunityFeedback } from './feedback'
import { createTwoCatchmentGeography } from './geography'
import type { CommunityCatchment, DailyCommunityCounters } from './types'

function cell(id: string, q: number, r: number, habitability = 500, movementCost = 1): GeographicCell { return { id, q, r, terrain: movementCost ? 'plain' : 'water', elevation: 0, habitability, movementCost, resourceCapacity: 10, foodAmount: 10, foodRegenerationPerDay: 1 } }
const catchment: CommunityCatchment = { id: 'community-west-valley', displayName: 'West Valley', anchorCellId: 'a', cellIds: ['a'] }
function counters(overrides: Partial<DailyCommunityCounters> = {}): DailyCommunityCounters { return { ...createDailyCommunityCounters(), windowEndTick: 23, exposedPersonIds: ['p1'], exposedPersonHours: 24, ...overrides } }

describe('community geography', () => {
  it('uses axial targets/anchors and covers every cell including impassable exactly once', () => {
    const geography = createTwoCatchmentGeography({ width: 9, height: 5, cells: [cell('west', 3, 2, 900), cell('west-low', 3, 1, 100), cell('east', 6, 2, 800), cell('water', 4, 2, 0, 0), cell('tie', 4, 2)] })
    expect(geography.map((c) => [c.id, c.anchorCellId])).toEqual([['community-west-valley', 'west'], ['community-east-valley', 'east']])
    expect(geography.flatMap((c) => c.cellIds).sort()).toEqual(['east', 'tie', 'water', 'west', 'west-low'])
  })
  it('breaks equal anchor proximity by habitability then cell ID', () => {
    expect(createTwoCatchmentGeography({ width: 9, height: 5, cells: [cell('low', 3, 1, 100), cell('high', 3, 3, 900), cell('east', 6, 2)] })[0]?.anchorCellId).toBe('high')
    expect(createTwoCatchmentGeography({ width: 9, height: 5, cells: [cell('z', 3, 1, 900), cell('a', 3, 3, 900), cell('east', 6, 2)] })[0]?.anchorCellId).toBe('a')
  })
})

describe('community counters and aggregation', () => {
  it('initializes structural food security independently of neutral emergent measures', () => {
    const state = createCommunityState(catchment, 500, 1000)
    expect(state.emergent['community.emergent.socialTrust']).toBe(500)
    expect(state.structural['community.structural.foodSecurity']).toBe(1000)
  })
  it('validates canonical local evidence', () => {
    expect(() => validateDailyCommunityCounters(counters({ exposedPersonIds: ['z', 'a'] }))).toThrow(/canonical/)
    expect(() => validateDailyCommunityCounters(counters({ mealAttempts: 1, failedMeals: 2 }))).toThrow(/failedMeals/)
    expect(() => validateDailyCommunityCounters(counters({ encounters: 1, positiveEncounters: 1, postEncounterDirectionalTrustPermilleSum: 1001 }))).toThrow(/bounds/)
  })
  it('reconciles exact weighted formulas, smoothing, and trace metadata', () => {
    const result = aggregateCommunityDaily(createCommunityState(catchment), counters({
      exposedPersonIds: ['p1', 'p2'], encounterParticipantIds: ['p1', 'p2'], encounteredRelationshipIds: ['r1'], exposedPersonHours: 48, commonsPersonHours: 24, curiosityPersonHourSum: 36_000,
      socializeSelections: 2, exploreSelections: 1, explorationArrivals: 1, mealAttempts: 10, failedMeals: 2, encounters: 4, positiveEncounters: 3, neutralEncounters: 1,
      postEncounterDirectionalTrustPermilleSum: 2800, postEncounterDirectionalFamiliarityPermilleSum: 2400, postEncounterDirectionalFearPermilleSum: 800, foodAmountBeforeRegeneration: 80, foodCapacity: 100,
    }))
    const trust = result.traces.find((t) => t.variableId === 'community.emergent.socialTrust')!
    expect(trust.contributors.map((c) => [c.sourceId, c.weightPermille])).toEqual([['encounter.outcomeQuality', 350], ['relationship.directionalTrust', 450], ['community.structural.foodSecurity.observed', 200]])
    expect(Math.abs(trust.contributors.reduce((n, c) => n + c.weightedNumerator, 0) - trust.observedValuePermille * 1000)).toBeLessThanOrEqual(500)
    expect(trust.nextValuePermille).toBe(570)
    const food = result.traces.find((t) => t.variableId === 'community.structural.foodSecurity')!
    expect(food.contributors.map((c) => c.weightPermille)).toEqual([700, 300])
    expect(food.nextValuePermille).toBe(650)
    expect(result.traces.every((t) => t.windowEndTick === 23 && t.nextValuePermille >= 0 && t.nextValuePermille <= 1000)).toBe(true)
  })
  it('uses true permille means and normalizes active density against the reference', () => {
    expect(meanPermille(2800, 4)).toBe(700)
    expect(meanPermille(36_000, 48)).toBe(750)
    expect(NETWORK_DENSITY_REFERENCE_PERMILLE).toBe(100)
    const result = aggregateCommunityDaily(createCommunityState(catchment), counters({ exposedPersonIds: ['p1', 'p2'], encounterParticipantIds: ['p1', 'p2'], encounteredRelationshipIds: ['r1'], exposedPersonHours: 48, curiosityPersonHourSum: 36_000, encounters: 4, positiveEncounters: 3, neutralEncounters: 1, postEncounterDirectionalTrustPermilleSum: 2800, postEncounterDirectionalFamiliarityPermilleSum: 2400, foodAmountBeforeRegeneration: 50, foodCapacity: 100 }))
    const cohesion = result.traces.find((trace) => trace.variableId === 'community.emergent.cohesion')!
    expect(cohesion.contributors.map((item) => [item.sourceId, item.sourceValuePermille, item.weightPermille])).toEqual([['encounter.participantReach', 1000, 300], ['relationship.directionalFamiliarity', 600, 250], ['relationship.activeDensity.normalized', 1000, 250], ['activity.commonsShare', 0, 200]])
    const innovation = result.traces.find((trace) => trace.variableId === 'community.emergent.innovationClimate')!
    expect(innovation.contributors[2]?.sourceValuePermille).toBe(750)
  })
  it('uses prior relevant measures with no encounters and freezes emergents with no exposure', () => {
    const initial = createCommunityState(catchment, 700)
    expect(aggregateCommunityDaily(initial, counters({ encounters: 0, foodCapacity: 0, mealAttempts: 0 })).state.emergent['community.emergent.socialTrust']).toBe(700)
    const frozen = aggregateCommunityDaily(initial, counters({ exposedPersonIds: [], exposedPersonHours: 0, foodAmountBeforeRegeneration: 100, foodCapacity: 100 }))
    expect(frozen.state.emergent).toEqual(initial.emergent)
    expect(frozen.state.structural['community.structural.foodSecurity']).toBeGreaterThan(700)
  })
  it('moves positive and tense evidence in opposite directions and exploration boosts innovation', () => {
    const initial = createCommunityState(catchment)
    const positive = aggregateCommunityDaily(initial, counters({ encounters: 4, positiveEncounters: 4, postEncounterDirectionalTrustPermilleSum: 4000, postEncounterDirectionalFamiliarityPermilleSum: 4000 }))
    const tense = aggregateCommunityDaily(initial, counters({ encounters: 4, tenseEncounters: 4, postEncounterDirectionalFearPermilleSum: 4000 }))
    expect(positive.state.emergent['community.emergent.socialTrust']).toBeGreaterThan(tense.state.emergent['community.emergent.socialTrust'])
    expect(tense.state.emergent['community.emergent.conflict']).toBeGreaterThan(positive.state.emergent['community.emergent.conflict'])
    expect(aggregateCommunityDaily(initial, counters({ exploreSelections: 24, explorationArrivals: 24, curiosityPersonHourSum: 24_000 })).state.emergent['community.emergent.innovationClimate']).toBeGreaterThan(500)
  })
  it('does not turn neutral encounters into conflict through outcome quality', () => {
    const neutral = aggregateCommunityDaily(createCommunityState(catchment), counters({ encounters: 4, neutralEncounters: 4, postEncounterDirectionalFearPermilleSum: 0, foodAmountBeforeRegeneration: 100, foodCapacity: 100 }))
    const conflict = neutral.traces.find((trace) => trace.variableId === 'community.emergent.conflict')!
    expect(conflict.contributors[0]).toMatchObject({ sourceId: 'encounter.tenseRate', sourceValuePermille: 0, weightPermille: 550 })
  })
})

describe('community feedback', () => {
  it('keeps sparse order and exact centered effects', () => {
    const values = { 'community.emergent.socialTrust': 750, 'community.emergent.cohesion': 250, 'community.emergent.cooperation': 1000, 'community.emergent.conflict': 750, 'community.emergent.innovationClimate': 1000 } as const
    expect(COMMUNITY_FEEDBACK_REGISTRY.definitions.map((edge) => edge.order)).toEqual([10, 20, 30, 40, 50])
    expect(evaluateCommunityFeedback('decision.socialize.utility', values).contributions.map((c) => c.effect)).toEqual([60, -40, 70, -40])
    expect(evaluateCommunityFeedback('decision.explore.utility', values).totalEffect).toBe(110)
  })
})
