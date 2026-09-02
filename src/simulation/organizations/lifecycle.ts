import type { PersonState, RelationshipState } from '../domain/types'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { getPersonVariable } from '../variables/storage'
import { compareStableText } from '../../shared/stableOrder'
import type {
  OrganizationDefinition,
  OrganizationFormationTrace,
  OrganizationLifecycleFactors,
  OrganizationLifecycleState,
  OrganizationMember,
  OrganizationMembershipChange,
  OrganizationMembershipTrace,
  OrganizationState,
} from './types'
import { createOrganizationAssetAccount, createOrganizationReputationLedger } from './ledger'
import { createOrganizationDecisionState, createOrganizationLeadershipState } from './governance'

export const ORGANIZATION_LIFECYCLE_STREAM = 'organization.lifecycle' as const
export const ORGANIZATION_LIFECYCLE_TRACE_LIMIT = 64
/** Each activity or organization evaluates at most this many people per cadence. */
export const MAX_LIFECYCLE_CANDIDATES_PER_ACTIVITY = 16
const FACTOR_DIVISOR = 20
const RECENT_EXPOSURE_HOURS = 24

export interface OrganizationLifecycleOutcome {
  formations: number
  memberships: number
  formationTraces: OrganizationFormationTrace[]
  membershipTraces: OrganizationMembershipTrace[]
}

interface LifecycleInput {
  tick: number
  definitions: readonly OrganizationDefinition[]
  people: readonly PersonState[]
  organizations: OrganizationState[]
  relationships: readonly RelationshipState[]
  lifecycle: OrganizationLifecycleState
  nextPermille: () => number
  /** Engine-resolved authoritative geographic scope for each commons activity. */
  formationScopeByActivityLocation?: ReadonlyMap<string, string>
  /** Legacy snapshots preserve pre-account/evidence pack semantics. */
  assetAndReputationEnabled?: boolean
  /** Legacy snapshots preserve pre-leadership/decision pack semantics. */
  leadershipAndDecisionsEnabled?: boolean
}

/**
 * Run one pack-defined lifecycle cadence. Formation is indexed by occupied
 * activity location. Membership is indexed by organization and considers only
 * a bounded rotating window of current members and local non-members.
 */
export function advanceOrganizationLifecycle(input: LifecycleInput): OrganizationLifecycleOutcome {
  const definitions = [...input.definitions]
    .filter((definition) => definition.lifecycle && input.tick % definition.lifecycle.cadenceHours === 0)
    .sort((first, second) => compareStableText(first.id, second.id))
  if (definitions.length === 0) return emptyOutcome()

  const peopleByActivity = indexPeopleByActivity(input.people)
  const peopleById = new Map(input.people.map((person) => [person.id, person]))
  const relationshipIds = new Set(input.relationships.map((relationship) => relationship.id))
  const relationshipPeers = indexRelationshipPeers(input.relationships)
  const organizationIds = new Set(input.organizations.map((organization) => organization.id))
  const organizationScopeKeys = new Set(input.organizations.map((organization) => organizationScopeKey(
    organization.kind,
    input.formationScopeByActivityLocation?.get(organization.activityLocationId) ?? organization.activityLocationId,
  )))
  const formedMemberIds = new Map<string, ReadonlySet<string>>()
  const formationTraces: OrganizationFormationTrace[] = []
  const membershipTraces: OrganizationMembershipTrace[] = []
  let formations = 0
  let memberships = 0

  const recordFormation = (trace: Omit<OrganizationFormationTrace, 'sequence'>): OrganizationFormationTrace => {
    const recorded = { ...trace, sequence: input.lifecycle.nextTraceSequence++ }
    formationTraces.push(recorded)
    appendBounded(input.lifecycle.latestFormationTraces, recorded)
    return recorded
  }
  const recordMembership = (trace: Omit<OrganizationMembershipTrace, 'sequence'>): OrganizationMembershipTrace => {
    const recorded = { ...trace, sequence: input.lifecycle.nextTraceSequence++ }
    membershipTraces.push(recorded)
    appendBounded(input.lifecycle.latestMembershipTraces, recorded)
    return recorded
  }

  for (const [activityLocationId, occupants] of [...peopleByActivity.entries()]
    .filter(([id]) => id.startsWith('activity.commons.'))
    .sort(([first], [second]) => compareStableText(first, second))) {
    const formationScopeId = input.formationScopeByActivityLocation?.get(activityLocationId) ?? activityLocationId
    if (input.formationScopeByActivityLocation && !input.formationScopeByActivityLocation.has(activityLocationId)) continue
    const candidates = boundedWindow(occupants, input.tick)
    for (const definition of definitions) {
      const lifecycle = definition.lifecycle!
      if (!lifecycle.formation.enabled) continue
      const scopeKey = organizationScopeKey(definition.id, formationScopeId)
      if (organizationScopeKeys.has(scopeKey)) continue

      const pair = formationPair(candidates, relationshipIds)
      const factors = formationFactors(pair ?? candidates, relationshipIds, input.tick, activityLocationId)
      if (!pair) {
        recordFormation({
          tick: input.tick,
          kindId: definition.id,
          candidatePersonIds: candidates.map((person) => person.id),
          locationCellId: candidates[0]?.locationCellId ?? activityCellId(activityLocationId),
          baseProbabilityPermille: lifecycle.formation.baseProbabilityPermille,
          factors,
          finalProbabilityPermille: 0,
          formed: false,
          rejectionReason: 'insufficient-activity',
        })
        continue
      }

      const probability = organizationLifecycleProbability(lifecycle.formation.baseProbabilityPermille, factors, 'engagement')
      const roll = input.nextPermille()
      if (roll >= probability) {
        recordFormation({
          tick: input.tick,
          kindId: definition.id,
          candidatePersonIds: pair.map((person) => person.id),
          locationCellId: pair[0].locationCellId,
          baseProbabilityPermille: lifecycle.formation.baseProbabilityPermille,
          factors,
          finalProbabilityPermille: probability,
          rngStream: ORGANIZATION_LIFECYCLE_STREAM,
          randomRollPermille: roll,
          formed: false,
          rejectionReason: 'probability',
        })
        continue
      }

      const { id, sequence } = nextOrganizationId(definition.id, input.lifecycle, organizationIds)
      const members = pair.map((person) => ({ personId: person.id, role: lifecycle.membership.defaultRoleId }))
      const assets = input.assetAndReputationEnabled ? createOrganizationAssetAccount(definition) : undefined
      const reputationLedger = input.assetAndReputationEnabled ? createOrganizationReputationLedger(definition) : undefined
      const leadership = input.leadershipAndDecisionsEnabled ? createOrganizationLeadershipState(definition) : undefined
      const decisions = input.leadershipAndDecisionsEnabled ? createOrganizationDecisionState(definition) : undefined
      const organization: OrganizationState = {
        id,
        name: `${definition.name} ${sequence}`,
        kind: definition.id,
        locationCellId: pair[0].locationCellId,
        activityLocationId,
        members,
        serviceCapacity: definition.initialService.serviceCapacity,
        sharedRuleIds: [...definition.sharedRuleIds],
        ...(assets ? { assets } : {}),
        ...(reputationLedger ? { reputationLedger } : {}),
        ...(leadership ? { leadership } : {}),
        ...(decisions ? { decisions } : {}),
      }
      input.organizations.push(organization)
      organizationIds.add(id)
      organizationScopeKeys.add(scopeKey)
      formedMemberIds.set(id, new Set(members.map((member) => member.personId)))
      recordFormation({
        tick: input.tick,
        kindId: definition.id,
        candidatePersonIds: pair.map((person) => person.id),
        locationCellId: organization.locationCellId,
        baseProbabilityPermille: lifecycle.formation.baseProbabilityPermille,
        factors,
        finalProbabilityPermille: probability,
        rngStream: ORGANIZATION_LIFECYCLE_STREAM,
        randomRollPermille: roll,
        formed: true,
        organizationId: id,
      })
      formations += 1
    }
  }

  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]))
  for (const organization of [...input.organizations].sort((first, second) => compareStableText(first.id, second.id))) {
    const definition = definitionById.get(organization.kind)
    const lifecycle = definition?.lifecycle
    if (!definition || !lifecycle?.membership.enabled) continue

    const initialMemberIds = new Set(organization.members.map((member) => member.personId))
    const founders = formedMemberIds.get(organization.id) ?? new Set<string>()
    const existingMembers = boundedWindow(
      organization.members
        .filter((member) => !founders.has(member.personId))
        .sort((first, second) => compareStableText(first.personId, second.personId)),
      input.tick,
    )

    for (const member of existingMembers) {
      const person = peopleById.get(member.personId)
      if (!person) continue
      const factors = membershipFactors(person, organization, initialMemberIds, relationshipPeers, input.tick)
      const alternativeRole = member.role === lifecycle.membership.defaultRoleId
        && factors.interestPermille >= lifecycle.membership.roleChangeInterestThresholdPermille
        ? definition.memberRoleIds.find((role) => role !== member.role)
        : undefined
      const change: OrganizationMembershipChange = alternativeRole ? 'role-changed' : 'left'
      const baseProbability = alternativeRole
        ? lifecycle.membership.baseRoleChangeProbabilityPermille
        : lifecycle.membership.baseLeaveProbabilityPermille
      const probability = organizationLifecycleProbability(baseProbability, factors, alternativeRole ? 'engagement' : 'disengagement')
      const chance = evaluateChance(probability, input.nextPermille)
      recordMembership({
        tick: input.tick,
        organizationId: organization.id,
        personId: person.id,
        change,
        previousRoleId: member.role,
        ...(alternativeRole ? { nextRoleId: alternativeRole } : {}),
        baseProbabilityPermille: baseProbability,
        factors,
        finalProbabilityPermille: probability,
        ...chance,
      })
      if (chance.selected) {
        applyOrganizationMembershipChange(organization, person.id, change, alternativeRole)
        memberships += 1
      }
    }

    const localPeople = peopleByActivity.get(organization.activityLocationId) ?? []
    const joinCandidates = boundedWindow(
      localPeople.filter((person) => !initialMemberIds.has(person.id)),
      input.tick,
    )
    for (const person of joinCandidates) {
      const factors = membershipFactors(person, organization, new Set(organization.members.map((member) => member.personId)), relationshipPeers, input.tick)
      const probability = organizationLifecycleProbability(lifecycle.membership.baseJoinProbabilityPermille, factors, 'engagement')
      const chance = evaluateChance(probability, input.nextPermille)
      recordMembership({
        tick: input.tick,
        organizationId: organization.id,
        personId: person.id,
        change: 'joined',
        nextRoleId: lifecycle.membership.defaultRoleId,
        baseProbabilityPermille: lifecycle.membership.baseJoinProbabilityPermille,
        factors,
        finalProbabilityPermille: probability,
        ...chance,
      })
      if (chance.selected) {
        applyOrganizationMembershipChange(organization, person.id, 'joined', lifecycle.membership.defaultRoleId)
        memberships += 1
      }
    }
  }

  input.organizations.sort((first, second) => compareStableText(first.id, second.id))
  for (const organization of input.organizations) organization.members.sort((first, second) => compareStableText(first.personId, second.personId))
  return { formations, memberships, formationTraces, membershipTraces }
}

/** Positive evidence raises formation/join/role-change odds; its absence raises leave odds. */
export function organizationLifecycleProbability(base: number, factors: OrganizationLifecycleFactors, mode: 'engagement' | 'disengagement'): number {
  const values = Object.values(factors)
  const contribution = mode === 'engagement'
    ? values.reduce((sum, value) => sum + value, 0)
    : values.reduce((sum, value) => sum + 1000 - value, 0)
  return Math.max(0, Math.min(1000, base + Math.floor(contribution / FACTOR_DIVISOR)))
}

/** Explicit transition primitive; it never touches relationships, identity, or exposure. */
export function applyOrganizationMembershipChange(organization: OrganizationState, personId: string, change: OrganizationMembershipChange, nextRoleId?: string): OrganizationMember | undefined {
  const index = organization.members.findIndex((member) => member.personId === personId)
  if (change === 'joined') {
    if (index >= 0 || !nextRoleId) throw new Error('Invalid organization join transition')
    const member = { personId, role: nextRoleId }
    organization.members.push(member)
    organization.members.sort((first, second) => compareStableText(first.personId, second.personId))
    return member
  }
  if (index < 0) throw new Error('Invalid organization membership transition')
  if (change === 'left') return organization.members.splice(index, 1)[0]
  if (!nextRoleId || organization.members[index]!.role === nextRoleId) throw new Error('Role change requires a different role')
  organization.members[index] = { personId, role: nextRoleId }
  return organization.members[index]
}

function emptyOutcome(): OrganizationLifecycleOutcome {
  return { formations: 0, memberships: 0, formationTraces: [], membershipTraces: [] }
}

function evaluateChance(probability: number, nextPermille: () => number): Pick<OrganizationMembershipTrace, 'selected' | 'rngStream' | 'randomRollPermille' | 'rejectionReason'> {
  if (probability === 0) return { selected: false, rejectionReason: 'disabled' }
  const roll = nextPermille()
  return roll < probability
    ? { selected: true, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: roll }
    : { selected: false, rngStream: ORGANIZATION_LIFECYCLE_STREAM, randomRollPermille: roll, rejectionReason: 'probability' }
}

function formationFactors(people: readonly PersonState[], relationships: ReadonlySet<string>, tick: number, activityLocationId: string): OrganizationLifecycleFactors {
  const interestPermille = people.length === 0
    ? 0
    : Math.floor(people.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity), 0) / people.length)
  return {
    activityPermille: people.length >= 2 && people.every((person) => person.currentActivity.locationId === activityLocationId) ? 1000 : 0,
    proximityPermille: people.length >= 2 && people.every((person) => person.locationCellId === people[0]!.locationCellId) ? 1000 : 0,
    relationshipPermille: people.length >= 2 && hasRelationship(people[0]!.id, people[1]!.id, relationships) ? 1000 : 0,
    interestPermille,
    exposurePermille: people.length >= 2 && recentMutualEncounter(people[0]!, people[1]!, tick, activityLocationId) ? 1000 : 0,
  }
}

function membershipFactors(person: PersonState, organization: OrganizationState, memberIds: ReadonlySet<string>, relationshipPeers: ReadonlyMap<string, ReadonlySet<string>>, tick: number): OrganizationLifecycleFactors {
  const recentEncounter = person.lastEncounter
  const hasMemberRelationship = [...(relationshipPeers.get(person.id) ?? [])].some((peerId) => memberIds.has(peerId))
  return {
    activityPermille: person.lifeStatus !== 'dead' && person.currentActivity.locationId === organization.activityLocationId ? 1000 : 0,
    proximityPermille: person.lifeStatus !== 'dead' && person.locationCellId === organization.locationCellId ? 1000 : 0,
    relationshipPermille: hasMemberRelationship ? 1000 : 0,
    interestPermille: getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity),
    exposurePermille: recentEncounter
      && recentEncounter.tick <= tick
      && recentEncounter.tick > tick - RECENT_EXPOSURE_HOURS
      && recentEncounter.activityLocationId === organization.activityLocationId
      && memberIds.has(recentEncounter.otherPersonId) ? 1000 : 0,
  }
}

function indexRelationshipPeers(relationships: readonly RelationshipState[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const relationship of relationships) {
    const [firstId, secondId] = relationship.personAId && relationship.personBId
      ? [relationship.personAId, relationship.personBId]
      : relationship.id.split('|', 2)
    if (!firstId || !secondId) continue
    const firstPeers = result.get(firstId) ?? new Set<string>()
    const secondPeers = result.get(secondId) ?? new Set<string>()
    firstPeers.add(secondId)
    secondPeers.add(firstId)
    result.set(firstId, firstPeers)
    result.set(secondId, secondPeers)
  }
  return result
}

function formationPair(people: readonly PersonState[], relationships: ReadonlySet<string>): [PersonState, PersonState] | undefined {
  if (people.length < 2) return undefined
  for (let firstIndex = 0; firstIndex < people.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < people.length; secondIndex += 1) {
      const first = people[firstIndex]!
      const second = people[secondIndex]!
      if (hasRelationship(first.id, second.id, relationships)) return orderedPair(first, second)
    }
  }
  return orderedPair(people[0]!, people[1]!)
}

function recentMutualEncounter(first: PersonState, second: PersonState, tick: number, activityLocationId: string): boolean {
  return [first, second].some((person) => person.lastEncounter
    && person.lastEncounter.tick <= tick
    && person.lastEncounter.tick > tick - RECENT_EXPOSURE_HOURS
    && person.lastEncounter.activityLocationId === activityLocationId
    && person.lastEncounter.otherPersonId === (person.id === first.id ? second.id : first.id))
}

function hasRelationship(firstId: string, secondId: string, relationships: ReadonlySet<string>): boolean {
  return relationships.has(firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`)
}

function orderedPair(first: PersonState, second: PersonState): [PersonState, PersonState] {
  return compareStableText(first.id, second.id) <= 0 ? [first, second] : [second, first]
}

function boundedWindow<T>(values: readonly T[], tick: number): T[] {
  if (values.length <= MAX_LIFECYCLE_CANDIDATES_PER_ACTIVITY) return [...values]
  const offset = Math.max(0, Math.floor(tick / 24) - 1) % values.length
  return Array.from({ length: MAX_LIFECYCLE_CANDIDATES_PER_ACTIVITY }, (_, index) => values[(offset + index) % values.length]!)
}

function indexPeopleByActivity(people: readonly PersonState[]): Map<string, PersonState[]> {
  const result = new Map<string, PersonState[]>()
  for (const person of people) {
    if (person.lifeStatus === 'dead' || !person.currentActivity.locationId) continue
    const occupants = result.get(person.currentActivity.locationId) ?? []
    occupants.push(person)
    result.set(person.currentActivity.locationId, occupants)
  }
  for (const occupants of result.values()) occupants.sort((first, second) => compareStableText(first.id, second.id))
  return result
}

function nextOrganizationId(kindId: string, state: OrganizationLifecycleState, existingIds: ReadonlySet<string>): { id: string; sequence: number } {
  while (true) {
    const sequence = state.nextOrganizationSequence++
    const id = `organization.${kindId}.${String(sequence).padStart(6, '0')}`
    if (!existingIds.has(id)) return { id, sequence }
  }
}

function organizationScopeKey(kindId: string, scopeId: string): string {
  return `${kindId}\u0000${scopeId}`
}

function appendBounded<T>(values: T[], value: T): void {
  values.push(value)
  if (values.length > ORGANIZATION_LIFECYCLE_TRACE_LIMIT) values.splice(0, values.length - ORGANIZATION_LIFECYCLE_TRACE_LIMIT)
}

function activityCellId(activityLocationId: string): string {
  return activityLocationId.replace(/^activity\.commons\./, '')
}
