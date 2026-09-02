import { describe, expect, it } from 'vitest'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'
import { defaultWorldCreationRequest } from '../domain/worldCreation'
import type { PersonState, RelationshipState } from '../domain/types'
import { SimulationEngine } from '../engine/engine'
import { stateDigest } from '../serialization/digest'
import { validateSnapshot } from '../serialization/snapshot'
import { createDefaultPersonVariableValues } from '../variables/storage'
import { advanceOrganizationGovernance, createOrganizationDecisionState, createOrganizationLeadershipState, evaluateLeadership, ORGANIZATION_DECISION_STREAM } from './governance'
import type { OrganizationDecisionPolicy, OrganizationDefinition, OrganizationState } from './types'

const weights = { relationshipSupportWeightPermille: 0, organizationReputationWeightPermille: 0, knowledgeWeightPermille: 0, persistenceWeightPermille: 1000 }
const decisionPolicy: OrganizationDecisionPolicy = {
  id: 'policy.study-priority', cadenceHours: 24, resolutionDelayHours: 24, participantRoleIds: ['member'], maxParticipants: 2, factors: weights,
  alternatives: [
    { id: 'alternative.expand', baseScorePermille: 600, preference: 'higher-member-evidence', authorizedEffectIds: ['organization.effect.none.v1'] },
    { id: 'alternative.hold', baseScorePermille: 400, preference: 'lower-member-evidence', authorizedEffectIds: ['organization.effect.none.v1'] },
  ],
}
const definition: OrganizationDefinition = {
  id: 'circle', name: 'Circle', purposeIds: ['education'], memberRoleIds: ['member', 'steward'], sharedRuleIds: [], initialService: { location: 'settlement-anchor', activityLocation: 'commons', serviceCapacity: 8 },
  leadership: { cadenceHours: 24, leaderRoleId: 'steward', eligibleMemberRoleIds: ['member'], minimumAgeYears: 18, minimumScorePermille: 600, removalScorePermille: 500, maxCandidates: 2, factors: weights },
  decisionPolicies: [decisionPolicy],
}

function person(id: string, persistence: number): PersonState {
  return { id, ageYears: 30, ageHoursIntoYear: 0, lifeStatus: 'alive', locationCellId: '0,0', homeCellId: '0,0', householdId: `household.${id}`, activityScheduleId: 'activity.schedule.adult.v1', currentActivity: { kind: 'commons', locationId: 'activity.commons.0,0', sinceTick: 0 }, originTraces: [], development: { exposures: [] }, knowledge: { 'knowledge.foraging': 0, 'knowledge.localTerrain': 0 }, variables: createDefaultPersonVariableValues({ 'person.trait.persistence': persistence }), knownCellIds: ['0,0'] }
}

function organization(people: readonly PersonState[]): OrganizationState {
  return { id: 'organization.circle.001', name: 'Circle', kind: 'circle', locationCellId: '0,0', activityLocationId: 'activity.commons.0,0', members: people.map((entry) => ({ personId: entry.id, role: 'member' })), serviceCapacity: 8, sharedRuleIds: [], leadership: createOrganizationLeadershipState(definition), decisions: createOrganizationDecisionState(definition) }
}

describe('organization leadership and collective decisions', () => {
  it('selects deterministically, records a contested stable tie, removes, succeeds, and records no eligible leader', () => {
    const a = person('person.a', 900); const b = person('person.b', 700); const org = organization([a, b])
    const people = new Map([[a.id, a], [b.id, b]])
    const first = evaluateLeadership({ tick: 24, organization: org, definition, peopleById: people, relationshipsById: new Map() })
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ outcome: 'selected', selectedLeaderPersonId: 'person.a', contested: true, candidates: [{ personId: 'person.a', finalScorePermille: 900 }, { personId: 'person.b', finalScorePermille: 700 }] })
    a.lifeStatus = 'dead'
    const succession = evaluateLeadership({ tick: 48, organization: org, definition, peopleById: people, relationshipsById: new Map() })
    expect(succession.map((trace) => trace.outcome)).toEqual(['removed', 'succeeded'])
    expect(org.leadership?.leaderPersonId).toBe('person.b')
    b.lifeStatus = 'dead'
    const vacancy = evaluateLeadership({ tick: 72, organization: org, definition, peopleById: people, relationshipsById: new Map() })
    expect(vacancy.map((trace) => trace.outcome)).toEqual(['removed', 'no-eligible-leader'])
    expect(org.leadership?.leaderPersonId).toBeUndefined()

    const tiedA = person('person.a', 800); const tiedB = person('person.b', 800); const tied = organization([tiedB, tiedA])
    evaluateLeadership({ tick: 24, organization: tied, definition, peopleById: new Map([[tiedA.id, tiedA], [tiedB.id, tiedB]]), relationshipsById: new Map() })
    expect(tied.leadership?.leaderPersonId).toBe('person.a')
  })

  it('uses relationship and reputation only through explicitly weighted factors', () => {
    const a = person('person.a', 100); const b = person('person.b', 900); const org = organization([a, b])
    org.reputationLedger = { nextObservationSequence: 1, observations: [], currentByObserver: [{ observer: { kind: 'person', id: a.id }, valuePermille: 900, lastObservationSequence: 1, lastObservedTick: 1 }] }
    const relationship = { id: 'person.a|person.b', personAId: a.id, personBId: b.id, aToB: { trust: 100, respect: 100 }, bToA: { trust: 900, respect: 900 } } as RelationshipState
    const configured = structuredClone(definition)
    configured.leadership!.factors = { ...weights, persistenceWeightPermille: 0, relationshipSupportWeightPermille: 500, organizationReputationWeightPermille: 500 }
    evaluateLeadership({ tick: 24, organization: org, definition: configured, peopleById: new Map([[a.id, a], [b.id, b]]), relationshipsById: new Map([[relationship.id, relationship]]) })
    expect(org.leadership?.leaderPersonId).toBe(a.id)
  })

  it('bounds participants and records complete fixed-roll proposal resolution evidence', () => {
    const people = [person('person.a', 900), person('person.b', 700), person('person.c', 100)]
    const org = organization(people)
    const first = advanceOrganizationGovernance({ tick: 24, organizations: [org], definitions: [definition], people, relationships: [], nextDecisionPermille: () => 900 })
    expect(first.leadershipTraces[0]?.trace.candidates).toHaveLength(2)
    expect(first.proposals[0]?.proposal).toMatchObject({ participantIds: ['person.a', 'person.b'], participantRoles: [{ personId: 'person.a', memberRoleId: 'member' }, { personId: 'person.b', memberRoleId: 'member' }], alternatives: ['alternative.expand', 'alternative.hold'], resolvesAtTick: 48 })
    const second = advanceOrganizationGovernance({ tick: 48, organizations: [org], definitions: [definition], people, relationships: [], nextDecisionPermille: () => 900 })
    const resolution = second.resolutions[0]?.resolution
    expect(resolution).toMatchObject({ participantIds: ['person.a', 'person.b'], participantRoles: [{ personId: 'person.a', memberRoleId: 'member' }, { personId: 'person.b', memberRoleId: 'member' }], factors: weights, rngStream: ORGANIZATION_DECISION_STREAM, randomRollPermille: 900, authorizedEffectIds: ['organization.effect.none.v1'] })
    expect(resolution?.contributions).toHaveLength(2)
    expect(resolution?.alternatives.map((entry) => entry.probabilityPermille).reduce((sum, value) => sum + value, 0)).toBe(1000)
    expect(second.proposals).toHaveLength(1)
  })

  it('keeps candidate and participant evaluation bounded for a large organization', () => {
    const people = Array.from({ length: 1_000 }, (_, index) => person(`person.${String(index).padStart(4, '0')}`, index % 1001))
    const org = organization(people)
    const result = advanceOrganizationGovernance({ tick: 24, organizations: [org], definitions: [definition], people, relationships: [], nextDecisionPermille: () => 500 })
    expect(org.members).toHaveLength(1_000)
    expect(result.leadershipTraces[0]?.trace.candidates).toHaveLength(definition.leadership!.maxCandidates)
    expect(result.proposals[0]?.proposal.participantIds).toHaveLength(decisionPolicy.maxParticipants)
  })

  it('retains proposal-time eligibility evidence and rechecks roles at resolution', () => {
    const a = person('person.a', 900); const b = person('person.b', 700)
    const longPolicy = { ...decisionPolicy, resolutionDelayHours: 48 }
    const longDefinition = { ...definition, decisionPolicies: [longPolicy] }
    const org = organization([a, b])
    org.decisions = createOrganizationDecisionState(longDefinition)
    const proposed = advanceOrganizationGovernance({ tick: 24, organizations: [org], definitions: [longDefinition], people: [a, b], relationships: [], nextDecisionPermille: () => 500 })
    expect(proposed.proposals[0]?.proposal.participantRoles).toEqual([{ personId: a.id, memberRoleId: 'member' }, { personId: b.id, memberRoleId: 'member' }])
    org.members.find((member) => member.personId === b.id)!.role = 'steward'
    const resolved = advanceOrganizationGovernance({ tick: 72, organizations: [org], definitions: [longDefinition], people: [a, b], relationships: [], nextDecisionPermille: () => 500 })
    expect(resolved.resolutions[0]?.resolution.participantRoles).toEqual([{ personId: a.id, memberRoleId: 'member' }])
  })

  it('preserves pending decisions, leadership, RNG, events, and digest across restore continuation', async () => {
    const pack = structuredClone(DEFAULT_PREINDUSTRIAL_PACK)
    pack.manifest = { ...pack.manifest, id: 'setting.organization-governance.fixture', version: '1.0.0', name: 'Organization governance fixture' }
    pack.organizationDefinitions = pack.organizationDefinitions.map((entry) => entry.id === 'school' ? { ...entry, leadership: { ...definition.leadership!, leaderRoleId: 'educator', eligibleMemberRoleIds: ['learner'], minimumAgeYears: 0 }, decisionPolicies: [{ ...decisionPolicy, participantRoleIds: ['learner'] }] } : entry)
    const creation = { ...defaultWorldCreationRequest('organization-governance-restore', 16, 12), settlements: [{ id: 'school-place', name: 'School Place', preset: 'central' as const }] }
    const engine = SimulationEngine.create(creation, 16, 12, pack)
    engine.advance(24, { clockEventHours: false })
    const pending = await engine.snapshot()
    expect(pending.state.organizations.some((entry) => (entry.decisions?.pending.length ?? 0) > 0 && entry.leadership?.leaderPersonId)).toBe(true)
    const invalidLeader = structuredClone(pending)
    invalidLeader.state.organizations.find((entry) => entry.leadership)!.leadership!.leaderPersonId = 'person.missing'
    invalidLeader.digest = await stateDigest(invalidLeader.state)
    await expect(validateSnapshot(invalidLeader, pack)).rejects.toThrow('invalid leadership state')
    const restored = await SimulationEngine.restore(pending, pack)
    const expected = engine.advance(24, { clockEventHours: false })
    const actual = restored.advance(24, { clockEventHours: false })
    expect(actual.events).toEqual(expected.events)
    expect(actual.events.some((event) => event.type === 'ORGANIZATION_DECISION_RESOLVED')).toBe(true)
    const completed = await engine.snapshot()
    expect(await restored.snapshot()).toEqual(completed)
    const invalidDecision = structuredClone(completed)
    const resolution = invalidDecision.state.organizations.find((entry) => entry.decisions?.latestResolutions.length)?.decisions!.latestResolutions[0]!
    resolution.alternatives[0]!.probabilityPermille += 1
    invalidDecision.digest = await stateDigest(invalidDecision.state)
    await expect(validateSnapshot(invalidDecision, pack)).rejects.toThrow('invalid decision state')

    const invalidRules = structuredClone(completed)
    invalidRules.state.organizations.find((entry) => entry.decisions?.latestResolutions.length)!.decisions!.latestResolutions[0]!.factors.persistenceWeightPermille = 999
    invalidRules.digest = await stateDigest(invalidRules.state)
    await expect(validateSnapshot(invalidRules, pack)).rejects.toThrow('invalid decision state')

    const invalidEffects = structuredClone(completed)
    invalidEffects.state.organizations.find((entry) => entry.decisions?.latestResolutions.length)!.decisions!.latestResolutions[0]!.authorizedEffectIds = []
    invalidEffects.digest = await stateDigest(invalidEffects.state)
    await expect(validateSnapshot(invalidEffects, pack)).rejects.toThrow('invalid decision state')
  })
})
