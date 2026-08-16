import { describe, expect, it } from 'vitest'
import {
  COMMUNITY_EMERGENT_IDS,
  COMMUNITY_FEEDBACK_DEFINITIONS,
  aggregateCommunityDaily,
  createCommunityState,
  createDailyCommunityCounters,
  symmetricRoundDivision,
  validateDailyCommunityCounters,
  type DailyCommunityCounters,
} from '../community'
import { SimulationEngine } from '../engine/engine'
import { applyEncounter, createRelationship } from '../relationships/model'
import { createSnapshot } from '../serialization/snapshot'
import { PERSON_VARIABLE_ID } from '../variables/registry'

const catchment = {
  id: 'community-west-valley',
  displayName: 'West Valley',
  anchorCellId: '0,0',
  cellIds: ['0,0'],
} as const

function dailyCounters(overrides: Partial<DailyCommunityCounters> = {}): DailyCommunityCounters {
  return {
    ...createDailyCommunityCounters(),
    windowStartTick: 1,
    windowEndTick: 24,
    exposedPersonIds: ['person-a', 'person-b'],
    exposedPersonHours: 48,
    curiosityPersonHourSum: 24_000,
    foodAmountBeforeRegeneration: 100,
    foodCapacity: 100,
    ...overrides,
  }
}

describe('Milestone 6 independent validation', () => {
  it('reconciles actual tick-25 feedback with the current geographic catchment and centered edge formula', () => {
    const result = SimulationEngine.create('community-feedback-reconciliation').step(25)
    const definitionsById = new Map(COMMUNITY_FEEDBACK_DEFINITIONS.map((definition) => [definition.id, definition]))
    const peopleWithFeedback = result.projection.people.filter((person) =>
      (person.lastDecision?.action === 'socialize' || person.lastDecision?.action === 'explore')
      && person.lastDecision.contributions.some(({ kind }) => kind === 'communityInfluence'),
    )

    expect(peopleWithFeedback.length).toBeGreaterThan(0)
    expect(peopleWithFeedback.some((person) => person.lastDecision?.contributions.some((entry) => entry.kind === 'communityInfluence' && entry.value !== 0))).toBe(true)

    for (const person of peopleWithFeedback) {
      expect(Object.prototype.hasOwnProperty.call(person, 'communityId')).toBe(false)
      const community = result.projection.communities.find(({ catchment: area }) => area.cellIds.includes(person.locationCellId))
      expect(community, `${person.id} at ${person.locationCellId}`).toBeDefined()
      if (!community || !person.lastDecision) continue
      const feedback = person.lastDecision.contributions.filter((entry) => entry.kind === 'communityInfluence')
      for (const contribution of feedback) {
        const definition = definitionsById.get(contribution.edgeId)
        expect(definition).toBeDefined()
        expect(contribution.communityId).toBe(community.catchment.id)
        expect(contribution.sourceValue).toBe(community.emergent[contribution.sourceId])
        expect(contribution.centeredSourceValue).toBe(contribution.sourceValue - 500)
        expect(contribution.targetId).toBe(`decision.${person.lastDecision.action}.utility`)
        expect(contribution.weightPermille).toBe(definition?.weightPermille)
        expect(contribution.value).toBe(symmetricRoundDivision(contribution.centeredSourceValue * contribution.weightPermille, 1000))
      }
    }
  })

  it('derives trust, cooperation, and conflict direction from matched positive versus tense encounter evidence', () => {
    const initial = createCommunityState(catchment)
    const positiveRelationship = applyEncounter(createRelationship('person-a', 'person-b'), 'positive', 1)
    const tenseRelationship = applyEncounter(createRelationship('person-a', 'person-b'), 'tense', 1)
    const evidence = (outcome: 'positive' | 'tense', relationship: typeof positiveRelationship): DailyCommunityCounters => dailyCounters({
      encounterParticipantIds: ['person-a', 'person-b'],
      encounteredRelationshipIds: [relationship.id],
      encounters: 1,
      positiveEncounters: outcome === 'positive' ? 1 : 0,
      tenseEncounters: outcome === 'tense' ? 1 : 0,
      postEncounterDirectionalTrustPermilleSum: symmetricRoundDivision(relationship.aToB.trust + relationship.bToA.trust, 2),
      postEncounterDirectionalFamiliarityPermilleSum: relationship.familiarity,
      postEncounterDirectionalFearPermilleSum: symmetricRoundDivision(relationship.aToB.fear + relationship.bToA.fear, 2),
    })

    const positive = aggregateCommunityDaily(initial, evidence('positive', positiveRelationship)).state.emergent
    const tense = aggregateCommunityDaily(initial, evidence('tense', tenseRelationship)).state.emergent
    expect(positive['community.emergent.socialTrust']).toBeGreaterThan(tense['community.emergent.socialTrust'])
    expect(positive['community.emergent.cooperation']).toBeGreaterThan(tense['community.emergent.cooperation'])
    expect(positive['community.emergent.conflict']).toBeLessThan(tense['community.emergent.conflict'])
  })

  it('requires exploration behavior evidence for a stronger innovation climate than curiosity exposure alone', () => {
    const initial = createCommunityState(catchment)
    const curiosityOnly = aggregateCommunityDaily(initial, dailyCounters({ curiosityPersonHourSum: 48_000 }))
    const explored = aggregateCommunityDaily(initial, dailyCounters({ curiosityPersonHourSum: 48_000, exploreSelections: 1, explorationArrivals: 1 }))
    const curiosityTrace = curiosityOnly.traces.find(({ variableId }) => variableId === 'community.emergent.innovationClimate')
    const exploredTrace = explored.traces.find(({ variableId }) => variableId === 'community.emergent.innovationClimate')

    expect(curiosityTrace?.contributors.find(({ sourceId }) => sourceId === 'action.explore.rate')?.sourceValuePermille).toBe(0)
    expect(curiosityTrace?.contributors.find(({ sourceId }) => sourceId === 'action.explorationArrival.rate')?.sourceValuePermille).toBe(0)
    expect(explored.state.emergent['community.emergent.innovationClimate']).toBeGreaterThan(curiosityOnly.state.emergent['community.emergent.innovationClimate'])
    expect(exploredTrace?.observedValuePermille).toBeGreaterThan(curiosityTrace?.observedValuePermille ?? 1000)
  })

  it('produces evidence-driven two-catchment differences across paired seeded runs that all begin neutral', () => {
    let runsWithEmergentDifference = 0
    let differingMeasurePairs = 0
    let totalAbsoluteDifference = 0
    const seeds = 32

    for (let index = 0; index < seeds; index += 1) {
      const engine = SimulationEngine.create(`community-geography-validation-${index}`)
      const initial = engine.project().communities
      expect(initial.every((community) => COMMUNITY_EMERGENT_IDS.every((id) => community.emergent[id] === 500))).toBe(true)
      const communities = engine.step(24).projection.communities
      const west = communities[0]
      const east = communities[1]
      if (!west || !east) throw new Error('Expected two deterministic community catchments')
      let runDiffers = false
      for (const id of COMMUNITY_EMERGENT_IDS) {
        const difference = Math.abs(west.emergent[id] - east.emergent[id])
        if (difference > 0) {
          runDiffers = true
          differingMeasurePairs += 1
          totalAbsoluteDifference += difference
        }
      }
      if (runDiffers) runsWithEmergentDifference += 1
    }

    console.info('[milestone6] two-catchment tendency', { seeds, runsWithEmergentDifference, differingMeasurePairs, totalAbsoluteDifference })
    expect(runsWithEmergentDifference).toBeGreaterThanOrEqual(24)
    expect(differingMeasurePairs).toBeGreaterThanOrEqual(seeds * 2)
    expect(totalAbsoluteDifference).toBeGreaterThan(seeds * 10)
  }, 30_000)

  it('keeps 720-tick authoritative community diagnostics bounded while reporting workload cardinality', async () => {
    const engine = SimulationEngine.create('community-720-cardinality')
    const started = performance.now()
    const result = engine.step(720)
    const elapsedMs = performance.now() - started
    const snapshot = await engine.snapshot()
    const relationshipCount = snapshot.state.relationships.length

    console.info('[milestone6] 720-tick informational workload', {
      elapsedMs: Math.round(elapsedMs),
      people: snapshot.state.people.length,
      cells: snapshot.state.world.grid.cells.length,
      relationships: relationshipCount,
      returnedEvents: result.events.length,
      returnedStatistics: result.statistics.length,
    })
    expect(snapshot.state.communities).toHaveLength(2)
    expect(snapshot.state.communities.every(({ latestTraces }) => latestTraces.length === 6)).toBe(true)
    expect(snapshot.state.dailyCommunityCounters).toHaveLength(2)
    expect(snapshot.state.dailyCommunityCounters.every(({ counters }) =>
      counters.exposedPersonIds.length === 0
      && counters.encounterParticipantIds.length === 0
      && counters.encounteredRelationshipIds.length === 0
      && counters.exposedPersonHours === 0,
    )).toBe(true)
    expect(result.events.length).toBeLessThanOrEqual(500)
    expect(relationshipCount).toBeLessThanOrEqual(snapshot.state.people.length * (snapshot.state.people.length - 1) / 2)
    expect(snapshot.state).not.toHaveProperty('events')
    expect(snapshot.state).not.toHaveProperty('statistics')
    expect(snapshot.state.communities.every((community) => !Object.prototype.hasOwnProperty.call(community, 'history'))).toBe(true)
  }, 30_000)

  it('rejects malformed participant subsets, duplicate relationship evidence, and overlapping catchments', async () => {
    expect(() => validateDailyCommunityCounters(dailyCounters({
      exposedPersonIds: ['person-a'],
      encounterParticipantIds: ['person-b'],
    }))).toThrow(/participants must be exposed/i)

    expect(() => validateDailyCommunityCounters(dailyCounters({
      encounteredRelationshipIds: ['person-a|person-b', 'person-a|person-b'],
    }))).toThrow(/canonical sorted unique/i)

    const state = structuredClone((await SimulationEngine.create('community-overlap-rejection').snapshot()).state)
    const west = state.communities[0]
    const east = state.communities[1]
    const overlapCell = west?.catchment.cellIds[0]
    if (!west || !east || !overlapCell) throw new Error('Missing deterministic catchment fixture')
    state.communities[1] = {
      ...east,
      catchment: { ...east.catchment, cellIds: [...east.catchment.cellIds, overlapCell].sort() },
    }
    await expect(SimulationEngine.restore(await createSnapshot(state))).rejects.toThrow(/catchment|cover/i)
  })

  it('emits only valid statistic scope keys for each authoritative catchment', () => {
    const result = SimulationEngine.create('community-statistic-scope-validation').step(24)
    const communityIds = new Set(result.projection.communities.map(({ catchment: area }) => area.id))
    for (const sample of result.statistics) {
      if (sample.scope === 'community') expect(communityIds.has(sample.scopeId)).toBe(true)
      else expect('scopeId' in sample).toBe(false)
    }
  })

  it('keeps curiosity exposure evidence tied to actual person-hours rather than a community membership field', async () => {
    const engine = SimulationEngine.create('community-no-membership-evidence')
    engine.step(1)
    const state = (await engine.snapshot()).state
    const peopleById = new Map(state.people.map((person) => [person.id, person]))
    for (const entry of state.dailyCommunityCounters) {
      const expectedCuriosityPersonHours = entry.counters.exposedPersonIds.reduce((sum, personId) => {
        const person = peopleById.get(personId)
        if (!person) throw new Error(`Missing exposed person ${personId}`)
        expect(Object.prototype.hasOwnProperty.call(person, 'communityId')).toBe(false)
        expect(entry.communityId).toBe(state.communities.find(({ catchment: area }) => area.cellIds.includes(person.locationCellId))?.catchment.id)
        return sum + person.variables[PERSON_VARIABLE_ID.curiosity]
      }, 0)
      expect(entry.counters.curiosityPersonHourSum).toBe(expectedCuriosityPersonHours)
      expect(entry.counters.exposedPersonHours).toBe(entry.counters.exposedPersonIds.length)
    }
  })
})
