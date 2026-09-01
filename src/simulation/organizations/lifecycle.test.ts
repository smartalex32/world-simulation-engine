import { describe, expect, it } from 'vitest'
import { advanceOrganizationLifecycle, applyOrganizationMembershipChange } from './lifecycle'
import type { OrganizationState } from './types'

const definition = { id: 'club', name: 'Club', purposeIds: ['education'], memberRoleIds: ['member', 'steward'], sharedRuleIds: [], initialService: { location: 'settlement-anchor' as const, activityLocation: 'commons' as const, serviceCapacity: 8 }, lifecycle: { formation: true, defaultMemberRoleId: 'member', cadenceHours: 24, baseFormationPermille: 1000, baseMembershipPermille: 1000 } }
const person = (id: string) => ({ id, lifeStatus: 'alive' as const, locationCellId: '1,1', currentActivity: { locationId: 'activity.commons.1,1' }, variables: { 'person.trait.curiosity': 500 }, lastEncounter: { tick: 1 } })

describe('organization lifecycle', () => {
  it('forms deterministically from shared activity plus a recorded relationship, retaining explanation evidence', () => {
    const organizations: never[] = []; const lifecycle = { nextOrganizationSequence: 1, latestFormationTraces: [], latestMembershipTraces: [] }
    const result = advanceOrganizationLifecycle({ tick: 24, definitions: [definition], people: [person('a'), person('b')] as never, organizations, relationships: [{ id: 'a|b' }] as never, lifecycle, nextPermille: () => 0 })
    expect(result).toMatchObject({ formations: 1, memberships: 0, formationTraces: [{ formed: true }] })
    expect(organizations[0]).toMatchObject({ id: 'organization.club.000001', members: [{ personId: 'a', role: 'member' }, { personId: 'b', role: 'member' }] })
    expect(lifecycle.latestFormationTraces[0]).toMatchObject({ formed: true, rngStream: 'organization.lifecycle', factors: { activityPermille: 1000, proximityPermille: 1000, relationshipPermille: 1000 } })
  })
  it('returns every selected trace to the phase caller even after bounded history is pruned', () => {
    const people = Array.from({ length: 80 }, (_, index) => ({ ...person(`p${String(index).padStart(3, '0')}`), locationCellId: `${Math.floor(index / 16)},1`, currentActivity: { locationId: `activity.commons.${Math.floor(index / 16)},1` } }))
    const relationships = [0, 1, 2, 3, 4].flatMap((group) => people.slice(group * 16 + 1, group * 16 + 16).map((candidate) => ({ id: `${people[group * 16]!.id}|${candidate.id}` })))
    const organizations: never[] = []; const lifecycle = { nextOrganizationSequence: 1, latestFormationTraces: [], latestMembershipTraces: [] }
    const result = advanceOrganizationLifecycle({ tick: 24, definitions: [definition], people: people as never, organizations, relationships: relationships as never, lifecycle, nextPermille: () => 0 })
    expect(result.formationTraces).toHaveLength(5)
    expect(result.membershipTraces.filter((trace) => trace.selected)).toHaveLength(70)
    expect(lifecycle.latestMembershipTraces).toHaveLength(64)
  })
  it('keeps explicit role change and leaving separate from relationship evidence', () => {
    const organization = { id: 'club', name: 'Club', kind: 'club', locationCellId: '1,1', activityLocationId: 'activity.commons.1,1', members: [{ personId: 'a', role: 'member' }], serviceCapacity: 8, sharedRuleIds: [] } as OrganizationState
    expect(applyOrganizationMembershipChange(organization, 'a', 'role-changed', 'steward')).toMatchObject({ role: 'steward' })
    expect(applyOrganizationMembershipChange(organization, 'a', 'left')).toMatchObject({ personId: 'a' })
    expect(organization.members).toEqual([])
  })
})
