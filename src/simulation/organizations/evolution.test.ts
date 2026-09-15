import { describe, expect, it } from 'vitest'
import type { PersonState, RelationshipState, SimulationState } from '../domain/types'
import { createDefaultPersonVariableValues } from '../variables/storage'
import { advanceOrganizationLifecycle } from './lifecycle'
import { advanceOrganizationGovernance, createOrganizationDecisionState, createOrganizationLeadershipState } from './governance'
import { createOrganizationAssetAccount, createOrganizationReputationLedger, transferOrganizationAsset } from './ledger'
import { validateOrganizationState } from './invariants'
import type { OrganizationDefinition, OrganizationState } from './types'
import { SimulationEngine } from '../engine/engine'
import { defaultWorldCreationRequest } from '../domain/worldCreation'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'
import { stateDigest } from '../serialization/digest'

const weights = { relationshipSupportWeightPermille: 0, organizationReputationWeightPermille: 0, knowledgeWeightPermille: 0, persistenceWeightPermille: 1000 }
const definition: OrganizationDefinition = {
  id: 'circle', name: 'Circle', specialization: 'faction', purposeIds: ['education'], memberRoleIds: ['member', 'steward'], sharedRuleIds: [], initialService: { location: 'settlement-anchor', activityLocation: 'commons', serviceCapacity: 8 },
  assets: { initialCurrencyUnits: 7, initialGoods: { 'good.food': 5 } }, reputation: { enabled: true },
  leadership: { cadenceHours: 24, leaderRoleId: 'steward', eligibleMemberRoleIds: ['member'], minimumAgeYears: 18, minimumScorePermille: 0, removalScorePermille: 0, maxCandidates: 8, factors: weights },
  decisionPolicies: [{ id: 'policy.study', cadenceHours: 24, resolutionDelayHours: 24, participantRoleIds: ['member'], maxParticipants: 4, factors: weights, alternatives: [{ id: 'a', baseScorePermille: 500, preference: 'higher-member-evidence', authorizedEffectIds: ['organization.effect.none.v1'] }, { id: 'b', baseScorePermille: 500, preference: 'lower-member-evidence', authorizedEffectIds: ['organization.effect.none.v1'] }] }],
  lifecycle: { cadenceHours: 48, formation: { enabled: false, baseProbabilityPermille: 0 }, membership: { enabled: false, defaultRoleId: 'member', baseJoinProbabilityPermille: 0, baseRoleChangeProbabilityPermille: 0, baseLeaveProbabilityPermille: 0, roleChangeInterestThresholdPermille: 750 }, evolution: { cadenceHours: 24, maxTransitionsPerCadence: 8, schism: { enabled: true, minimumMembers: 4, splitPermille: 500 } } },
}
function fixture(kind: 'schism' | 'merger' | 'dissolution') {
  const def = structuredClone(definition)
  def.lifecycle!.evolution = { cadenceHours: 24, maxTransitionsPerCadence: 8, ...(kind === 'schism' ? { schism: { enabled: true, minimumMembers: 4, splitPermille: 500 } } : kind === 'merger' ? { merger: { enabled: true, minimumSharedMembers: 2 } } : { dissolution: { enabled: true, maximumLivingMembers: 4 } }) }
  const people = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, ageYears: 30, lifeStatus: 'alive', locationCellId: '0,0', currentActivity: { kind: 'commons', locationId: 'activity.commons.0,0', sinceTick: 0 }, variables: createDefaultPersonVariableValues({ 'person.trait.persistence': index < 2 ? 1000 : 0, 'person.trait.curiosity': 700 }), knowledge: { 'knowledge.foraging': 0, 'knowledge.localTerrain': 0 }, lastEncounter: { tick: 48, otherPersonId: index % 2 === 0 ? ['b', 'd'][index / 2] : ['a', 'c'][(index - 1) / 2] } }) as PersonState)
  const relationships = [{ id: 'a|b', personAId: 'a', personBId: 'b', familiarity: 900 }, { id: 'c|d', personAId: 'c', personBId: 'd', familiarity: 900 }].map((entry) => ({ ...entry, aToB: { affection: 500, trust: 500, respect: 500, fear: 0 }, bToA: { affection: 500, trust: 500, respect: 500, fear: 0 } })) as RelationshipState[]
  const org = (id: string): OrganizationState => ({ id, name: id, kind: def.id, specialization: 'faction', status: 'active', lineage: { origin: 'initial', parentOrganizationIds: [], formedTick: 0 }, locationCellId: '0,0', activityLocationId: 'activity.commons.0,0', members: people.map((person) => ({ personId: person.id, role: 'member' })), serviceCapacity: 8, sharedRuleIds: [], assets: createOrganizationAssetAccount(def), reputationLedger: createOrganizationReputationLedger(def), leadership: createOrganizationLeadershipState(def), decisions: createOrganizationDecisionState(def) })
  const organizations = kind === 'merger' ? [org('group.a'), org('group.b')] : [org('group.a')]
  const input = { tick: 48, organizations, definitions: [def], people, relationships, lifecycle: { nextOrganizationSequence: 1, nextTraceSequence: 1, latestFormationTraces: [], latestMembershipTraces: [], latestTransitionTraces: [] }, evolutionEnabled: true, assetAndReputationEnabled: true, leadershipAndDecisionsEnabled: true, nextPermille: () => { throw new Error('Structural transitions must not draw RNG') } }
  const validate = () => validateOrganizationState({ tick: input.tick, organizations: input.organizations, organizationLifecycle: input.lifecycle, config: { organizationAssetReputationModelVersion: 1, organizationLeadershipDecisionModelVersion: 1, organizationEvolutionModelVersion: 1 }, people, households: [], markets: [], world: { grid: { cells: [{ id: '0,0', movementCost: 1 }] } }, activityLocations: [{ id: 'activity.commons.0,0', cellId: '0,0' }] } as unknown as SimulationState, new Map([[def.id, def]]))
  return { input, validate }
}

describe('organization structural lifecycle', () => {
  it('preserves existing transfer evidence and validates balances after structural history expires', () => {
    const { input, validate } = fixture('merger')
    const prior = transferOrganizationAsset({ tick: 24, from: { kind: 'organization', id: 'group.a' }, to: { kind: 'organization', id: 'group.b' }, asset: 'currency', amount: 2, reason: 'shared-supplies', organizations: input.organizations, households: [], markets: [], economy: {} as SimulationState['economy'] })
    validate()
    advanceOrganizationLifecycle(input)
    for (const parent of input.organizations.filter((org) => org.status === 'dissolved')) expect(parent.assets!.latestTransferTraces).toContainEqual(prior)
    const child = input.organizations.find((org) => org.status === 'active')!
    expect(child.assets!.latestTransferTraces.filter((trace) => trace.asset === 'currency')).toHaveLength(2)
    validate()
    for (let i = 0; i < 65; i++) { input.tick += 24; advanceOrganizationLifecycle(input) }
    expect(input.lifecycle.latestTransitionTraces).toHaveLength(64)
    validate()
    const lineage = child.lineage
    delete child.lineage
    expect(validate).toThrow('identity and lineage are required')
    child.lineage = lineage
    child.lineage!.parentOrganizationIds.pop()
    expect(validate).toThrow('invalid parents or formation order')
    child.lineage!.parentOrganizationIds.push('group.b')
    child.assets!.currencyUnits++
    expect(validate).toThrow('invalid owned asset account')
    child.assets!.currencyUnits--
    input.organizations[0]!.closedMembership!.members[0]!.role = 'invented-role'
    expect(validate).toThrow('structural reconciliation')
  })

  it('rejects missing accounts, forged overlap and gaps in retained transition evidence', () => {
    const { input, validate } = fixture('merger')
    const trace = advanceOrganizationLifecycle(input).transitionTraces[0]!
    const before = trace.resourcesBefore; const after = trace.resourceReconciliation
    trace.resourcesBefore = []; trace.resourceReconciliation = []
    expect(validate).toThrow('structural reconciliation')
    trace.resourcesBefore = before; trace.resourceReconciliation = after
    trace.evidence.sharedMemberCount--
    expect(validate).toThrow('structural reconciliation')
    trace.evidence.sharedMemberCount++
    input.tick += 24; advanceOrganizationLifecycle(input)
    input.lifecycle.latestTransitionTraces.shift()
    expect(validate).toThrow('contiguous retained suffix')
  })

  it('preserves absence of accounts and rejects closure state on active organizations', () => {
    const { input, validate } = fixture('merger')
    delete input.definitions[0]!.assets
    for (const org of input.organizations) delete org.assets
    const trace = advanceOrganizationLifecycle(input).transitionTraces[0]!
    expect(trace.resourcesBefore).toEqual([]); expect(trace.resourceReconciliation).toEqual([])
    validate()
    const child = input.organizations.find((org) => org.status === 'active')!
    child.closedMembership = { tick: 48, members: [] }
    expect(validate).toThrow('structural reconciliation')
  })

  it('waits a cadence before evaluating a newly formed organization', () => {
    const { input, validate } = fixture('dissolution')
    input.organizations[0]!.lineage = { origin: 'formation', parentOrganizationIds: [], formedTick: input.tick }
    expect(advanceOrganizationLifecycle(input).transitionTraces).toEqual([])
    expect(input.organizations[0]!.status).toBe('active'); validate()
    input.tick += 24
    expect(advanceOrganizationLifecycle(input).transitionTraces[0]!.selected).toBe(true)
    validate()
  })

  it('requires encounter exposure for a merger and bounds all enabled methods', () => {
    const { input, validate } = fixture('merger')
    for (const person of input.people) delete person.lastEncounter
    expect(advanceOrganizationLifecycle(input).transitionTraces.every((trace) => !trace.selected)).toBe(true)
    validate()
    input.definitions[0]!.lifecycle!.evolution!.schism = { enabled: true, minimumMembers: 4, splitPermille: 500 }
    input.definitions[0]!.lifecycle!.evolution!.dissolution = { enabled: true, maximumLivingMembers: 0 }
    input.organizations = [...input.organizations, ...Array.from({ length: 100 }, (_, index) => ({ ...structuredClone(input.organizations[0]!), id: `group.${String(index).padStart(3, '0')}` }))]
    input.tick += 24
    const traces = advanceOrganizationLifecycle(input).transitionTraces
    expect(traces).toHaveLength(24)
    expect(traces.every((trace) => !trace.selected)).toBe(true)
    validate()
  })

  it('rejects unsupported schisms and never partitions members by ID alone', () => {
    const { input, validate } = fixture('schism')
    const before = structuredClone(input.organizations)
    const outcome = advanceOrganizationLifecycle(input)
    expect(outcome.transitionTraces).toMatchObject([{ selected: false, reason: 'no-supported-dissenting-subgroup' }])
    expect(input.organizations).toEqual(before); validate()
  })

  it('splits supported decision dissent with exact member/asset conservation and valid child state', () => {
    const { input, validate } = fixture('schism')
    advanceOrganizationGovernance({ ...input, tick: 24, nextDecisionPermille: () => 999 })
    advanceOrganizationGovernance({ ...input, tick: 48, nextDecisionPermille: () => 999 })
    const outcome = advanceOrganizationLifecycle(input)
    expect(outcome.transitionTraces[0]).toMatchObject({ selected: true, kind: 'schism', evidence: { conflictPermille: 500, exposurePermille: 1000 } })
    expect(input.organizations).toHaveLength(2)
    expect(input.organizations.reduce((sum, org) => sum + org.members.length, 0)).toBe(4)
    expect(input.organizations.reduce((sum, org) => sum + org.assets!.currencyUnits, 0)).toBe(7)
    expect(input.organizations.reduce((sum, org) => sum + org.assets!.goods['good.food']!, 0)).toBe(5)
    const child = input.organizations.find((org) => org.lineage?.origin === 'schism')!
    expect(child.members.map((member) => member.personId)).toEqual(['a', 'b'])
    expect(child.assets!.currencyUnits).toBe(3)
    expect(child.reputationLedger?.observations).toEqual([])
    expect(child.leadership?.leaderPersonId).toBeUndefined()
    expect(child.decisions?.pending).toEqual([])
    validate()
  })

  it('merges into a new lineage identity, deduplicates overlap, and retires source executors', () => {
    const { input, validate } = fixture('merger')
    const outcome = advanceOrganizationLifecycle(input)
    expect(outcome.transitionTraces[0]).toMatchObject({ selected: true, kind: 'merger', evidence: { livingMemberCount: 4, sharedMemberCount: 4 } })
    const child = input.organizations.find((org) => org.status === 'active')!
    expect(child.lineage).toMatchObject({ origin: 'merger', parentOrganizationIds: ['group.a', 'group.b'] })
    expect(child.assets).toMatchObject({ currencyUnits: 14, goods: { 'good.food': 10 } })
    expect(child.members).toHaveLength(4)
    expect(input.organizations.filter((org) => org.status === 'dissolved').every((org) => org.members.length === 0 && org.closedMembership?.members.length === 4)).toBe(true)
    validate()
    outcome.transitionTraces[0]!.resourceReconciliation[0]!.currencyUnits++
    expect(validate).toThrow('structural reconciliation')
  })

  it('dissolves on its own cadence, retains estate assets, and suppresses subsequent governance draws', () => {
    const { input, validate } = fixture('dissolution'); input.tick = 24
    advanceOrganizationGovernance({ ...input, nextDecisionPermille: () => 0 })
    const outcome = advanceOrganizationLifecycle(input)
    expect(outcome.transitionTraces[0]).toMatchObject({ selected: true, evidence: { livingMemberCount: 4 } })
    expect(input.organizations[0]).toMatchObject({ status: 'dissolved', members: [], assets: { currencyUnits: 7, goods: { 'good.food': 5 } } })
    expect(input.organizations[0]!.leadership?.leaderPersonId).toBeUndefined()
    expect(advanceOrganizationGovernance({ ...input, tick: 48, nextDecisionPermille: () => { throw new Error('Inactive governance draw') } })).toEqual({ leadershipTraces: [], proposals: [], resolutions: [] })
    validate()
  })

  it('leaves legacy opt-out state unchanged and bounds rejected candidate evaluation', () => {
    const { input } = fixture('schism'); const before = structuredClone(input.organizations)
    expect(advanceOrganizationLifecycle({ ...input, evolutionEnabled: false }).transitionTraces).toEqual([])
    expect(input.organizations).toEqual(before)
    input.organizations = Array.from({ length: 100 }, (_, index) => ({ ...structuredClone(input.organizations[0]!), id: `group.${String(index).padStart(3, '0')}` }))
    expect(advanceOrganizationLifecycle(input).transitionTraces.length).toBeLessThanOrEqual(8)
  })

  it('preserves structural events, estate state, RNG and snapshot digest across engine restore continuation', async () => {
    const pack = structuredClone(DEFAULT_PREINDUSTRIAL_PACK)
    pack.manifest = { ...pack.manifest, id: 'setting.structural-test', name: 'Structural test', version: '1.0.0' }
    pack.organizationDefinitions = pack.organizationDefinitions.map((entry) => entry.id === 'school' ? { ...entry, specialization: 'institution' as const, assets: { initialCurrencyUnits: 7, initialGoods: { 'good.food': 5 } }, lifecycle: { ...definition.lifecycle!, formation: { enabled: false, baseProbabilityPermille: 0 }, membership: { ...definition.lifecycle!.membership, defaultRoleId: 'learner' }, evolution: { cadenceHours: 24, maxTransitionsPerCadence: 8, dissolution: { enabled: true, maximumLivingMembers: 0 } } } } : entry)
    const request = { ...defaultWorldCreationRequest('structural-restore', 16, 12), settlements: [{ id: 'school-place', name: 'School place', preset: 'central' as const }] }
    const snapshot = await SimulationEngine.create(request, 16, 12, pack).snapshot()
    for (const org of snapshot.state.organizations) org.members = []
    snapshot.digest = await stateDigest(snapshot.state)
    const first = await SimulationEngine.restore(snapshot, pack); const second = await SimulationEngine.restore(snapshot, pack)
    const expected = first.advance(24, { clockEventHours: false }); const actual = second.advance(24, { clockEventHours: false })
    expect(expected.events.some((event) => event.type === 'ORGANIZATION_STRUCTURE_CHANGED')).toBe(true)
    const durable = expected.events.find((event) => event.type === 'ORGANIZATION_STRUCTURE_CHANGED')!
    expect(JSON.parse(durable.payload.reconciliationJson as string)).toMatchObject({ kind: 'dissolution', resourcesBefore: [expect.objectContaining({ currencyUnits: 7 })], resourceReconciliation: [expect.objectContaining({ currencyUnits: 7 })] })
    expect(actual.events).toEqual(expected.events)
    expect(await second.snapshot()).toEqual(await first.snapshot())
    const retiredServices = (await first.snapshot()).state.infrastructure.filter((asset) => asset.kind === 'service')
    expect(retiredServices.length).toBeGreaterThan(0)
    expect(retiredServices.every((asset) => asset.decommissionedTick === 24)).toBe(true)
    expect(expected.events.some((event) => event.type === 'INFRASTRUCTURE_UPDATED' && event.payload.capacity === 0)).toBe(true)
    const continued = await SimulationEngine.restore(await first.snapshot(), pack)
    expect(continued.advance(24, { clockEventHours: false }).events).toEqual(first.advance(24, { clockEventHours: false }).events)
    expect(await continued.snapshot()).toEqual(await first.snapshot())
  })
})
