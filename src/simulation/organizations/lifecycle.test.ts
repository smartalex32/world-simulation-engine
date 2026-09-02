import { describe, expect, it } from 'vitest'
import {
  MAX_LIFECYCLE_CANDIDATES_PER_ACTIVITY,
  advanceOrganizationLifecycle,
  applyOrganizationMembershipChange,
  organizationLifecycleProbability,
} from './lifecycle'
import type { OrganizationDefinition, OrganizationLifecycleState, OrganizationState } from './types'
import { SimulationEngine } from '../engine/engine'
import { canonicalDigest } from '../serialization/digest'

const definition: OrganizationDefinition = {
  id: 'club',
  name: 'Club',
  purposeIds: ['education'],
  memberRoleIds: ['member', 'steward'],
  sharedRuleIds: [],
  initialService: { location: 'settlement-anchor', activityLocation: 'commons', serviceCapacity: 8 },
  lifecycle: {
    cadenceHours: 24,
    formation: { enabled: true, baseProbabilityPermille: 1000 },
    membership: {
      enabled: true,
      defaultRoleId: 'member',
      baseJoinProbabilityPermille: 1000,
      baseRoleChangeProbabilityPermille: 1000,
      baseLeaveProbabilityPermille: 1000,
      roleChangeInterestThresholdPermille: 750,
    },
  },
}

const lifecycleState = (): OrganizationLifecycleState => ({ nextOrganizationSequence: 1, nextTraceSequence: 1, latestFormationTraces: [], latestMembershipTraces: [] })
const person = (id: string, curiosity = 500, locationCellId = '1,1', activityLocationId = 'activity.commons.1,1') => ({
  id,
  lifeStatus: 'alive' as const,
  locationCellId,
  currentActivity: { kind: 'commons', locationId: activityLocationId, sinceTick: 0 },
  variables: { 'person.trait.curiosity': curiosity },
})
const organization = (members: OrganizationState['members'] = []): OrganizationState => ({
  id: 'organization.club.000001',
  name: 'Club 1',
  kind: 'club',
  locationCellId: '1,1',
  activityLocationId: 'activity.commons.1,1',
  members,
  serviceCapacity: 8,
  sharedRuleIds: [],
})

describe('organization lifecycle', () => {
  it('forms deterministically from bounded shared activity and retains structured explanation evidence', () => {
    const organizations: OrganizationState[] = []
    const lifecycle = lifecycleState()
    const result = advanceOrganizationLifecycle({
      tick: 24,
      definitions: [definition],
      people: [person('a'), person('b')] as never,
      organizations,
      relationships: [{ id: 'a|b' }] as never,
      lifecycle,
      nextPermille: () => 0,
    })

    expect(result).toMatchObject({ formations: 1, memberships: 0, formationTraces: [{ sequence: 1, formed: true }] })
    expect(organizations[0]).toMatchObject({ id: 'organization.club.000001', members: [{ personId: 'a', role: 'member' }, { personId: 'b', role: 'member' }] })
    expect(lifecycle.latestFormationTraces[0]).toMatchObject({
      formed: true,
      rngStream: 'organization.lifecycle',
      randomRollPermille: 0,
      factors: { activityPermille: 1000, proximityPermille: 1000, relationshipPermille: 1000, interestPermille: 500, exposurePermille: 0 },
    })
    expect(lifecycle.nextTraceSequence).toBe(2)
  })

  it('preserves legacy lifecycle formation semantics without initializing future accounts or reputation', () => {
    const legacyDefinition: OrganizationDefinition = { ...definition, assets: { initialCurrencyUnits: 7, initialGoods: { 'good.food': 2 } }, reputation: { enabled: true } }
    const organizations: OrganizationState[] = []
    advanceOrganizationLifecycle({ tick: 24, definitions: [legacyDefinition], people: [person('a'), person('b')] as never, organizations, relationships: [{ id: 'a|b' }] as never, lifecycle: lifecycleState(), nextPermille: () => 0, assetAndReputationEnabled: false })
    expect(organizations[0]).toMatchObject({ id: 'organization.club.000001' })
    expect(organizations[0]?.assets).toBeUndefined()
    expect(organizations[0]?.reputationLedger).toBeUndefined()
  })

  it('does not claim an RNG draw for a deterministic precondition rejection', () => {
    let draws = 0
    const result = advanceOrganizationLifecycle({
      tick: 24,
      definitions: [definition],
      people: [person('a')] as never,
      organizations: [],
      relationships: [],
      lifecycle: lifecycleState(),
      nextPermille: () => { draws += 1; return 0 },
    })

    expect(draws).toBe(0)
    expect(result.formationTraces[0]).toMatchObject({ formed: false, rejectionReason: 'insufficient-activity', finalProbabilityPermille: 0 })
    expect(result.formationTraces[0]).not.toHaveProperty('rngStream')
    expect(result.formationTraces[0]).not.toHaveProperty('randomRollPermille')
  })

  it('forms at most one organization kind per engine-resolved geographic scope', () => {
    const existing = { ...organization(), id: 'organization.club.existing', locationCellId: '2,2', activityLocationId: 'activity.commons.2,2' }
    const result = advanceOrganizationLifecycle({
      tick: 24,
      definitions: [definition],
      people: [person('a'), person('b')] as never,
      organizations: [existing],
      relationships: [{ id: 'a|b' }] as never,
      lifecycle: lifecycleState(),
      formationScopeByActivityLocation: new Map([['activity.commons.1,1', 'settlement-a'], ['activity.commons.2,2', 'settlement-a']]),
      nextPermille: () => 0,
    })
    expect(result).toEqual({ formations: 0, memberships: 0, formationTraces: [], membershipTraces: [] })
  })

  it('isolates activity, proximity, relationship, interest, and exposure contributions', () => {
    const none = { activityPermille: 0, proximityPermille: 0, relationshipPermille: 0, interestPermille: 0, exposurePermille: 0 }
    expect(organizationLifecycleProbability(100, none, 'engagement')).toBe(100)
    for (const factor of Object.keys(none) as (keyof typeof none)[]) {
      expect(organizationLifecycleProbability(100, { ...none, [factor]: 1000 }, 'engagement'), factor).toBe(150)
    }
    expect(organizationLifecycleProbability(100, none, 'disengagement')).toBe(350)
    expect(organizationLifecycleProbability(100, { ...none, exposurePermille: 1000 }, 'disengagement')).toBe(300)
  })

  it('joins a local non-member using relationship and recent encounter exposure', () => {
    const joinDefinition = structuredClone(definition)
    joinDefinition.lifecycle!.membership.baseLeaveProbabilityPermille = 0
    const member = person('a', 500)
    const candidate = {
      ...person('b', 500),
      lastEncounter: { tick: 23, otherPersonId: 'a', activityLocationId: 'activity.commons.1,1' },
    }
    const target = organization([{ personId: 'a', role: 'member' }])
    const rolls = [999, 0]
    const result = advanceOrganizationLifecycle({
      tick: 24,
      definitions: [joinDefinition],
      people: [member, candidate] as never,
      organizations: [target],
      relationships: [{ id: 'a|b' }] as never,
      lifecycle: lifecycleState(),
      nextPermille: () => rolls.shift() ?? 999,
    })

    expect(target.members).toContainEqual({ personId: 'b', role: 'member' })
    expect(result.membershipTraces.find((trace) => trace.personId === 'b')).toMatchObject({
      change: 'joined',
      selected: true,
      factors: { activityPermille: 1000, proximityPermille: 1000, relationshipPermille: 1000, exposurePermille: 1000 },
    })
  })

  it('evaluates bounded absent members for leaving instead of requiring organization co-presence', () => {
    const absent = person('a', 0, '2,2', 'activity.home.a')
    const target = organization([{ personId: 'a', role: 'member' }])
    const result = advanceOrganizationLifecycle({
      tick: 24,
      definitions: [definition],
      people: [absent] as never,
      organizations: [target],
      relationships: [],
      lifecycle: lifecycleState(),
      nextPermille: () => 0,
    })

    expect(result.memberships).toBe(1)
    expect(target.members).toEqual([])
    expect(result.membershipTraces[0]).toMatchObject({ change: 'left', selected: true, factors: { activityPermille: 0, proximityPermille: 0, relationshipPermille: 0, interestPermille: 0, exposurePermille: 0 } })
  })

  it('changes the default role at most once and never mutates relationship evidence', () => {
    const target = organization([{ personId: 'a', role: 'member' }])
    const relationships = [{ id: 'a|b', familiarity: 500 }]
    const before = structuredClone(relationships)
    expect(applyOrganizationMembershipChange(target, 'a', 'role-changed', 'steward')).toMatchObject({ role: 'steward' })
    expect(() => applyOrganizationMembershipChange(target, 'a', 'role-changed', 'steward')).toThrow('different role')
    expect(applyOrganizationMembershipChange(target, 'a', 'left')).toMatchObject({ personId: 'a' })
    expect(target.members).toEqual([])
    expect(relationships).toEqual(before)
  })

  it('returns all transitions while bounding retained history and each activity candidate window', () => {
    const people = Array.from({ length: 80 }, (_, index) => person(`p${String(index).padStart(3, '0')}`, 500, `${Math.floor(index / 16)},1`, `activity.commons.${Math.floor(index / 16)},1`))
    const relationships = [0, 1, 2, 3, 4].map((group) => ({ id: `${people[group * 16]!.id}|${people[group * 16 + 1]!.id}` }))
    const organizations: OrganizationState[] = []
    const lifecycle = lifecycleState()
    const result = advanceOrganizationLifecycle({ tick: 24, definitions: [definition], people: people as never, organizations, relationships: relationships as never, lifecycle, nextPermille: () => 0 })

    expect(result.formationTraces).toHaveLength(5)
    expect(result.membershipTraces.filter((trace) => trace.selected)).toHaveLength(70)
    expect(result.membershipTraces.filter((trace) => trace.organizationId === organizations[0]!.id)).toHaveLength(MAX_LIFECYCLE_CANDIDATES_PER_ACTIVITY - 2)
    expect(lifecycle.latestMembershipTraces).toHaveLength(64)
    expect(lifecycle.nextTraceSequence).toBe(76)
  })

  it('leaves school attendance untouched when the school definition has no lifecycle', () => {
    const schoolDefinition = { ...definition, id: 'school', lifecycle: undefined }
    const school = { ...organization(), id: 'organization.school.001', kind: 'school', members: [] }
    const result = advanceOrganizationLifecycle({ tick: 24, definitions: [schoolDefinition], people: [person('a'), person('b')] as never, organizations: [school], relationships: [{ id: 'a|b' }] as never, lifecycle: lifecycleState(), nextPermille: () => 0 })
    expect(result).toEqual({ formations: 0, memberships: 0, formationTraces: [], membershipTraces: [] })
    expect(school.members).toEqual([])
  })

  it('skips colliding generated IDs, including dotted organization kinds', () => {
    const dotted = { ...definition, id: 'club.study' }
    const occupied = { ...organization(), id: 'organization.club.study.000001', kind: 'club.study', locationCellId: '2,2', activityLocationId: 'activity.commons.2,2' }
    const organizations = [occupied]
    const lifecycle = lifecycleState()
    advanceOrganizationLifecycle({ tick: 24, definitions: [dotted], people: [person('a'), person('b')] as never, organizations, relationships: [{ id: 'a|b' }] as never, lifecycle, nextPermille: () => 0 })
    expect(organizations.map(({ id }) => id)).toContain('organization.club.study.000002')
    expect(lifecycle.nextOrganizationSequence).toBe(3)
  })

  it('preserves exact fixed-seed IDs, events, traces, RNG state, and restart continuation', async () => {
    const uninterrupted = SimulationEngine.create('organization-fixed-0')
    const result = uninterrupted.advance(240, { clockEventHours: false })
    const snapshot = await uninterrupted.snapshot()
    const organizationEvents = result.events.filter((event) => event.type === 'ORGANIZATION_FORMED' || event.type === 'ORGANIZATION_MEMBERSHIP_CHANGED')

    expect(snapshot.state.organizations.filter(({ kind }) => kind === 'study-circle').map(({ id, members }) => [id, members.map(({ personId }) => personId)])).toEqual([
      ['organization.study-circle.000001', ['person-0022', 'person-0085']],
      ['organization.study-circle.000002', ['person-0018', 'person-0077', 'person-0171']],
    ])
    expect(snapshot.state.organizationLifecycle.latestFormationTraces.filter(({ formed }) => formed).map(({ sequence, organizationId }) => [sequence, organizationId])).toEqual([
      [29, 'organization.study-circle.000001'],
      [42, 'organization.study-circle.000002'],
    ])
    expect(organizationEvents).toHaveLength(8)
    for (const event of organizationEvents) {
      expect(event.payload).toMatchObject({ traceSequence: expect.any(Number), baseProbabilityPermille: expect.any(Number), activityPermille: expect.any(Number), proximityPermille: expect.any(Number), relationshipPermille: expect.any(Number), interestPermille: expect.any(Number), exposurePermille: expect.any(Number), probabilityPermille: expect.any(Number), randomRollPermille: expect.any(Number) })
      if (event.type === 'ORGANIZATION_MEMBERSHIP_CHANGED' && event.payload.change === 'left') expect(event.payload.previousRoleId).toEqual(expect.any(String))
    }
    expect(snapshot.digest).toBe('5d0496a787feb6dccb0476785495708c998f291169fc4115dd6d9daabb92f16e')
    expect(await canonicalDigest(snapshot.state.randomStreams)).toBe('50632f5cbbe1c091927fe35992d1e4a5b1aa1a11436a72f6ef7efb7b7b3f8507')
    expect(await canonicalDigest(result.events)).toBe('0d37321015b37db507a7cfcac12ff917db16337eb51dfe862d6a691f3c4be4f3')

    const checkpointed = SimulationEngine.create('organization-fixed-0')
    checkpointed.advance(120, { clockEventHours: false })
    const restored = await SimulationEngine.restore(await checkpointed.snapshot())
    restored.advance(120, { clockEventHours: false })
    expect(await restored.snapshot()).toEqual(snapshot)
  }, 30_000)
})
