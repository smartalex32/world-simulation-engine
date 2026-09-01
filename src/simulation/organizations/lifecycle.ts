import type { OrganizationDefinition, OrganizationFormationTrace, OrganizationLifecycleFactors, OrganizationLifecycleState, OrganizationMember, OrganizationMembershipChange, OrganizationMembershipTrace, OrganizationState } from './types'
import type { PersonState, RelationshipState } from '../domain/types'
import { getPersonVariable } from '../variables/storage'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { compareStableText } from '../../shared/stableOrder'

export const ORGANIZATION_LIFECYCLE_STREAM = 'organization.lifecycle' as const
const TRACE_LIMIT = 64
/** Hard cap keeps each activity evaluation bounded as populations grow. */
export const MAX_LIFECYCLE_CANDIDATES_PER_ACTIVITY = 16
export interface OrganizationLifecycleOutcome { formations: number; memberships: number; formationTraces: OrganizationFormationTrace[]; membershipTraces: OrganizationMembershipTrace[] }

/** A bounded daily evaluator. Candidates come from shared activity locations;
 * organizations are indexed by location, never crossed with every person. */
export function advanceOrganizationLifecycle(input: { tick: number; definitions: readonly OrganizationDefinition[]; people: readonly PersonState[]; organizations: OrganizationState[]; relationships: readonly RelationshipState[]; lifecycle: OrganizationLifecycleState; nextPermille: () => number }): OrganizationLifecycleOutcome {
  const activeDefinitions = input.definitions.filter((definition) => definition.lifecycle?.formation && input.tick % definition.lifecycle.cadenceHours === 0).sort((a, b) => compareStableText(a.id, b.id))
  if (activeDefinitions.length === 0) return { formations: 0, memberships: 0, formationTraces: [], membershipTraces: [] }
  const peopleByActivity = indexPeopleByActivity(input.people)
  const peopleById = new Map(input.people.map((person) => [person.id, person]))
  const relationshipIds = new Set(input.relationships.map((relationship) => relationship.id))
  const organizationsByActivity = new Map<string, OrganizationState[]>()
  for (const organization of input.organizations) { const values = organizationsByActivity.get(organization.activityLocationId) ?? []; values.push(organization); organizationsByActivity.set(organization.activityLocationId, values) }
  let formations = 0; let memberships = 0
  const formationTraces: OrganizationFormationTrace[] = []; const membershipTraces: OrganizationMembershipTrace[] = []
  const recordFormation = (trace: OrganizationFormationTrace) => { formationTraces.push(trace); appendFormation(input.lifecycle, trace) }
  const recordMembership = (trace: OrganizationMembershipTrace) => { membershipTraces.push(trace); appendMembership(input.lifecycle, trace) }
  for (const [activityLocationId, people] of [...peopleByActivity.entries()].filter(([id]) => id.startsWith('activity.commons.')).sort(([a], [b]) => compareStableText(a, b))) {
    const candidates = people.slice(0, MAX_LIFECYCLE_CANDIDATES_PER_ACTIVITY)
    const pair = relatedPair(candidates, relationshipIds)
    for (const definition of activeDefinitions) {
      if ((organizationsByActivity.get(activityLocationId) ?? []).some((organization) => organization.kind === definition.id)) continue
      const formationPeople = pair ?? candidates.slice(0, 2) as [PersonState, PersonState]
      const factors = factorsFor(formationPeople, relationshipIds)
      const rejectionReason = candidates.length < 2 ? 'insufficient-activity' : pair ? undefined : 'no-relationship'
      if (rejectionReason) { recordFormation({ tick: input.tick, kindId: definition.id, candidatePersonIds: formationPeople.map((person) => person.id), locationCellId: formationPeople[0]?.locationCellId ?? '', baseProbabilityPermille: definition.lifecycle!.baseFormationPermille, factors, finalProbabilityPermille: 0, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: 0, formed: false, rejectionReason }); continue }
      const roll = input.nextPermille(); const probability = evaluateProbability(definition.lifecycle!.baseFormationPermille, factors)
      if (roll >= probability) { recordFormation({ tick: input.tick, kindId: definition.id, candidatePersonIds: pair!.map((person) => person.id), locationCellId: pair![0].locationCellId, baseProbabilityPermille: definition.lifecycle!.baseFormationPermille, factors, finalProbabilityPermille: probability, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: roll, formed: false, rejectionReason: 'probability' }); continue }
      const sequence = input.lifecycle.nextOrganizationSequence++; const id = `organization.${definition.id}.${String(sequence).padStart(6, '0')}`
      const organization: OrganizationState = { id, name: `${definition.name} ${sequence}`, kind: definition.id, locationCellId: pair![0].locationCellId, activityLocationId, members: pair!.map((person) => ({ personId: person.id, role: definition.lifecycle!.defaultMemberRoleId })), serviceCapacity: definition.initialService.serviceCapacity, sharedRuleIds: [...definition.sharedRuleIds] }
      input.organizations.push(organization); organizationsByActivity.set(activityLocationId, [...(organizationsByActivity.get(activityLocationId) ?? []), organization]); recordFormation({ tick: input.tick, kindId: definition.id, candidatePersonIds: pair!.map((person) => person.id), locationCellId: organization.locationCellId, baseProbabilityPermille: definition.lifecycle!.baseFormationPermille, factors, finalProbabilityPermille: probability, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: roll, formed: true, organizationId: id }); formations += 1
    }
    const organizationByKind = new Map((organizationsByActivity.get(activityLocationId) ?? []).sort((a, b) => compareStableText(a.id, b.id)).map((organization) => [organization.kind, organization]))
    for (const definition of activeDefinitions) {
      const organization = organizationByKind.get(definition.id); if (!organization) continue
      for (const person of candidates) {
        const existing = organization.members.find((member) => member.personId === person.id)
        const factors = factorsForPerson(person, organization, peopleById, relationshipIds)
        if (!existing) {
          if (factors.relationshipPermille === 0 && factors.exposurePermille === 0) {
            recordMembership({ tick: input.tick, organizationId: organization.id, personId: person.id, change: 'joined', nextRoleId: definition.lifecycle!.defaultMemberRoleId, baseProbabilityPermille: definition.lifecycle!.baseMembershipPermille, factors, finalProbabilityPermille: 0, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: 0, selected: false, rejectionReason: 'no-relationship' })
            continue
          }
          const roll = input.nextPermille(); const probability = evaluateProbability(definition.lifecycle!.baseMembershipPermille, factors); const selected = roll < probability
          recordMembership({ tick: input.tick, organizationId: organization.id, personId: person.id, change: 'joined', nextRoleId: definition.lifecycle!.defaultMemberRoleId, baseProbabilityPermille: definition.lifecycle!.baseMembershipPermille, factors, finalProbabilityPermille: probability, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: roll, selected, ...(selected ? {} : { rejectionReason: 'probability' }) })
          if (selected) { applyOrganizationMembershipChange(organization, person.id, 'joined', definition.lifecycle!.defaultMemberRoleId); memberships += 1 }
          continue
        }
        const alternativeRole = existing.role === definition.lifecycle!.defaultMemberRoleId && factors.interestPermille >= 750 ? definition.memberRoleIds.find((role) => role !== existing.role) : undefined
        const change: OrganizationMembershipChange = alternativeRole ? 'role-changed' : 'left'
        const base = change === 'left' ? Math.max(0, 300 - factors.interestPermille) : alternativeRole ? Math.floor(definition.lifecycle!.baseMembershipPermille / 2) : 0
        const roll = base === 0 ? 0 : input.nextPermille(); const probability = base === 0 ? 0 : evaluateProbability(base, factors); const selected = roll < probability
        recordMembership({ tick: input.tick, organizationId: organization.id, personId: person.id, change, previousRoleId: existing.role, ...(change === 'role-changed' && alternativeRole ? { nextRoleId: alternativeRole } : {}), baseProbabilityPermille: base, factors, finalProbabilityPermille: probability, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: roll, selected, ...(selected ? {} : { rejectionReason: base > 0 ? 'probability' : 'no-role' }) })
        if (selected) { applyOrganizationMembershipChange(organization, person.id, change, change === 'role-changed' ? alternativeRole : undefined); memberships += 1 }
      }
    }
  }
  input.organizations.sort((a, b) => compareStableText(a.id, b.id)); for (const organization of input.organizations) organization.members.sort((a, b) => compareStableText(a.personId, b.personId))
  return { formations, memberships, formationTraces, membershipTraces }
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
function factorsFor(people: readonly PersonState[], relationships: ReadonlySet<string>): OrganizationLifecycleFactors { const interestPermille = people.length === 0 ? 0 : Math.floor(people.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity), 0) / people.length); const relationshipPermille = relatedPair(people, relationships) ? 1000 : 0; return { activityPermille: people.length ? 1000 : 0, proximityPermille: people.length > 1 ? 1000 : 0, relationshipPermille, interestPermille, exposurePermille: people.length ? Math.min(1000, people.reduce((sum, person) => sum + (person.lastEncounter ? 500 : 0), 0) / people.length) : 0 } }
function factorsForPerson(person: PersonState, organization: OrganizationState, peopleById: ReadonlyMap<string, PersonState>, relationships: ReadonlySet<string>): OrganizationLifecycleFactors { const members = organization.members.slice(0, MAX_LIFECYCLE_CANDIDATES_PER_ACTIVITY).map((member) => peopleById.get(member.personId)).filter((candidate): candidate is PersonState => Boolean(candidate)); const relationshipPermille = members.some((member) => relatedPair([person, member], relationships)) ? 1000 : 0; return { activityPermille: person.currentActivity.locationId === organization.activityLocationId ? 1000 : 0, proximityPermille: members.some((member) => member.locationCellId === person.locationCellId) ? 1000 : 0, relationshipPermille, interestPermille: getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity), exposurePermille: person.lastEncounter ? 500 : 0 } }
function evaluateProbability(base: number, factors: OrganizationLifecycleFactors): number { return Math.max(0, Math.min(1000, base + Math.floor((factors.activityPermille + factors.proximityPermille + factors.relationshipPermille + factors.interestPermille + factors.exposurePermille) / 20))) }
function appendFormation(state: OrganizationLifecycleState, trace: OrganizationLifecycleState['latestFormationTraces'][number]): void { state.latestFormationTraces.push(trace); if (state.latestFormationTraces.length > TRACE_LIMIT) state.latestFormationTraces.splice(0, state.latestFormationTraces.length - TRACE_LIMIT) }
function appendMembership(state: OrganizationLifecycleState, trace: OrganizationMembershipTrace): void { state.latestMembershipTraces.push(trace); if (state.latestMembershipTraces.length > TRACE_LIMIT) state.latestMembershipTraces.splice(0, state.latestMembershipTraces.length - TRACE_LIMIT) }
