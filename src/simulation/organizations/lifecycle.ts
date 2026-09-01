import type { OrganizationDefinition, OrganizationLifecycleFactors, OrganizationLifecycleState, OrganizationMember, OrganizationMembershipChange, OrganizationMembershipTrace, OrganizationState } from './types'
import type { PersonState, RelationshipState } from '../domain/types'
import { getPersonVariable } from '../variables/storage'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { compareStableText } from '../../shared/stableOrder'

export const ORGANIZATION_LIFECYCLE_STREAM = 'organization.lifecycle' as const
const TRACE_LIMIT = 64

/** A bounded daily evaluator. Candidates come from shared activity locations;
 * organizations are indexed by location, never crossed with every person. */
export function advanceOrganizationLifecycle(input: { tick: number; definitions: readonly OrganizationDefinition[]; people: readonly PersonState[]; organizations: OrganizationState[]; relationships: readonly RelationshipState[]; lifecycle: OrganizationLifecycleState; nextPermille: () => number }): { formations: number; memberships: number } {
  const activeDefinitions = input.definitions.filter((definition) => definition.lifecycle?.formation && input.tick % definition.lifecycle.cadenceHours === 0).sort((a, b) => compareStableText(a.id, b.id))
  if (activeDefinitions.length === 0) return { formations: 0, memberships: 0 }
  const peopleByActivity = indexPeopleByActivity(input.people)
  const relationshipIds = new Set(input.relationships.map((relationship) => relationship.id))
  const organizationsByActivity = new Map<string, OrganizationState[]>()
  for (const organization of input.organizations) { const values = organizationsByActivity.get(organization.activityLocationId) ?? []; values.push(organization); organizationsByActivity.set(organization.activityLocationId, values) }
  let formations = 0; let memberships = 0
  for (const [activityLocationId, people] of [...peopleByActivity.entries()].sort(([a], [b]) => compareStableText(a, b))) {
    const pair = relatedPair(people, relationshipIds)
    if (!pair) continue
    const factors = factorsFor(pair, relationshipIds)
    for (const definition of activeDefinitions) {
      const roll = input.nextPermille(); const probability = evaluateProbability(definition.lifecycle!.baseFormationPermille, factors)
      if (roll >= probability) { appendFormation(input.lifecycle, { tick: input.tick, kindId: definition.id, candidatePersonIds: pair.map((person) => person.id), locationCellId: pair[0].locationCellId, baseProbabilityPermille: definition.lifecycle!.baseFormationPermille, factors, finalProbabilityPermille: probability, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: roll, formed: false, rejectionReason: 'probability' }); continue }
      const sequence = input.lifecycle.nextOrganizationSequence++; const id = `organization.${definition.id}.${String(sequence).padStart(6, '0')}`
      const organization: OrganizationState = { id, name: `${definition.name} ${sequence}`, kind: definition.id, locationCellId: pair[0].locationCellId, activityLocationId, members: pair.map((person) => ({ personId: person.id, role: definition.lifecycle!.defaultMemberRoleId })), serviceCapacity: definition.initialService.serviceCapacity, sharedRuleIds: [...definition.sharedRuleIds] }
      input.organizations.push(organization); organizationsByActivity.set(activityLocationId, [...(organizationsByActivity.get(activityLocationId) ?? []), organization]); appendFormation(input.lifecycle, { tick: input.tick, kindId: definition.id, candidatePersonIds: pair.map((person) => person.id), locationCellId: organization.locationCellId, baseProbabilityPermille: definition.lifecycle!.baseFormationPermille, factors, finalProbabilityPermille: probability, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: roll, formed: true, organizationId: id }); formations += 1
    }
    for (const organization of organizationsByActivity.get(activityLocationId) ?? []) {
      const definition = activeDefinitions.find((candidate) => candidate.id === organization.kind); if (!definition) continue
      for (const person of people) if (!organization.members.some((member) => member.personId === person.id)) {
        const roll = input.nextPermille(); const probability = evaluateProbability(definition.lifecycle!.baseMembershipPermille, factors)
        const selected = roll < probability; const trace: OrganizationMembershipTrace = { tick: input.tick, organizationId: organization.id, personId: person.id, change: 'joined', nextRoleId: definition.lifecycle!.defaultMemberRoleId, baseProbabilityPermille: definition.lifecycle!.baseMembershipPermille, factors, finalProbabilityPermille: probability, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: roll, selected, ...(selected ? {} : { rejectionReason: 'probability' }) }; appendMembership(input.lifecycle, trace)
        if (selected) { organization.members.push({ personId: person.id, role: definition.lifecycle!.defaultMemberRoleId }); memberships += 1 }
      }
    }
  }
  input.organizations.sort((a, b) => compareStableText(a.id, b.id)); for (const organization of input.organizations) organization.members.sort((a, b) => compareStableText(a.personId, b.personId))
  return { formations, memberships }
}

/** Explicit transition primitive; it never touches relationships or person identity. */
export function applyOrganizationMembershipChange(organization: OrganizationState, personId: string, change: OrganizationMembershipChange, nextRoleId?: string): OrganizationMember | undefined {
  const index = organization.members.findIndex((member) => member.personId === personId)
  if (change === 'joined') { if (index >= 0 || !nextRoleId) throw new Error('Invalid organization join transition'); const member = { personId, role: nextRoleId }; organization.members.push(member); organization.members.sort((a, b) => compareStableText(a.personId, b.personId)); return member }
  if (index < 0) throw new Error('Invalid organization membership transition')
  if (change === 'left') return organization.members.splice(index, 1)[0]
  if (!nextRoleId) throw new Error('Role change requires a role')
  organization.members[index] = { personId, role: nextRoleId }; return organization.members[index]
}

function indexPeopleByActivity(people: readonly PersonState[]): Map<string, PersonState[]> { const result = new Map<string, PersonState[]>(); for (const person of people) if (person.lifeStatus === 'alive' && person.currentActivity.locationId) { const values = result.get(person.currentActivity.locationId) ?? []; values.push(person); result.set(person.currentActivity.locationId, values) }; for (const values of result.values()) values.sort((a, b) => compareStableText(a.id, b.id)); return result }
function relatedPair(people: readonly PersonState[], relationships: ReadonlySet<string>): [PersonState, PersonState] | undefined { for (let i = 0; i < people.length; i += 1) for (let j = i + 1; j < people.length; j += 1) { const a = people[i]!; const b = people[j]!; if (relationships.has(a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`)) return [a, b] } return undefined }
function factorsFor(people: readonly PersonState[], relationships: ReadonlySet<string>): OrganizationLifecycleFactors { const interestPermille = Math.floor(people.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity), 0) / people.length); const relationshipPermille = relatedPair(people, relationships) ? 1000 : 0; return { activityPermille: 1000, relationshipPermille, interestPermille, exposurePermille: Math.min(1000, people.reduce((sum, person) => sum + (person.lastEncounter ? 500 : 0), 0) / people.length) } }
function evaluateProbability(base: number, factors: OrganizationLifecycleFactors): number { return Math.max(0, Math.min(1000, base + Math.floor((factors.activityPermille + factors.relationshipPermille + factors.interestPermille + factors.exposurePermille) / 16))) }
function appendFormation(state: OrganizationLifecycleState, trace: OrganizationLifecycleState['latestFormationTraces'][number]): void { state.latestFormationTraces.push(trace); if (state.latestFormationTraces.length > TRACE_LIMIT) state.latestFormationTraces.splice(0, state.latestFormationTraces.length - TRACE_LIMIT) }
function appendMembership(state: OrganizationLifecycleState, trace: OrganizationMembershipTrace): void { state.latestMembershipTraces.push(trace); if (state.latestMembershipTraces.length > TRACE_LIMIT) state.latestMembershipTraces.splice(0, state.latestMembershipTraces.length - TRACE_LIMIT) }
