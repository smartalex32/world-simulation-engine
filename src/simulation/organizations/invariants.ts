import type { SimulationState } from '../domain/types'
import type { OrganizationDefinition } from './types'
import { failCanonicalValidation as fail } from '../validation/error'

/** Canonical validation owned by the organization subsystem. */
export function validateOrganizationState(state: SimulationState, definitions: ReadonlyMap<string, OrganizationDefinition>): void {
  const ids = new Set(state.organizations.map((organization) => organization.id))
  if (ids.size !== state.organizations.length || state.organizations.some((organization, index) => index > 0 && state.organizations[index - 1]!.id >= organization.id)) fail('organizations', 'state.organizations', 'identity-or-ordering', 'Organizations are not uniquely canonically ordered')
  const cellsById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
  const locationsById = new Map(state.activityLocations.map((location) => [location.id, location]))
  const personIds = new Set(state.people.map((person) => person.id))
  for (const organization of state.organizations) {
    const definition = definitions.get(organization.kind)
    if (!definition) fail('organizations', `state.organizations.${organization.id}.kind`, 'kind', `Organization ${organization.id} has unknown kind`)
    if (organization.members.some((member, index) => !definition.memberRoleIds.includes(member.role) || (index > 0 && organization.members[index - 1]!.personId === member.personId))) fail('organizations', `state.organizations.${organization.id}.members`, 'member-role', `Organization ${organization.id} has invalid member role`)
    if (!cellsById.get(organization.locationCellId)?.movementCost || locationsById.get(organization.activityLocationId)?.cellId !== organization.locationCellId || organization.members.some((member, index) => !personIds.has(member.personId) || (index > 0 && organization.members[index - 1]!.personId >= member.personId))) fail('organizations', `state.organizations.${organization.id}`, 'member-or-location-reference', `Organization ${organization.id} has invalid members or location`)
    if (!Number.isSafeInteger(organization.serviceCapacity) || organization.serviceCapacity < 1) fail('organizations', `state.organizations.${organization.id}.serviceCapacity`, 'capacity', `Organization ${organization.id} has invalid service capacity`)
    if (organization.sharedRuleIds.length !== definition.sharedRuleIds.length || organization.sharedRuleIds.some((id, index) => id !== definition.sharedRuleIds[index])) fail('organizations', `state.organizations.${organization.id}.sharedRuleIds`, 'shared-rules', `Organization ${organization.id} does not match its defined rules`)
  }
  const lifecycle = state.organizationLifecycle
  if (!Number.isSafeInteger(lifecycle.nextOrganizationSequence) || lifecycle.nextOrganizationSequence < 1) fail('organizations', 'state.organizationLifecycle.nextOrganizationSequence', 'sequence', 'Organization lifecycle sequence is invalid')
  const generatedSequences = state.organizations.map((organization) => /^organization\.[^.]+\.(\d{6})$/.exec(organization.id)?.[1]).filter((sequence): sequence is string => sequence !== undefined).map(Number)
  if (generatedSequences.some((sequence) => sequence >= lifecycle.nextOrganizationSequence)) fail('organizations', 'state.organizationLifecycle.nextOrganizationSequence', 'sequence-collision', 'Organization lifecycle sequence could collide with an existing organization')
  if (lifecycle.latestFormationTraces.some((trace, index) => !validTraceNumbers(trace) || (index > 0 && lifecycle.latestFormationTraces[index - 1]!.tick > trace.tick))) fail('organizations', 'state.organizationLifecycle.latestFormationTraces', 'trace-ordering', 'Organization formation traces are invalid')
  if (lifecycle.latestMembershipTraces.some((trace, index) => !validTraceNumbers(trace) || (index > 0 && lifecycle.latestMembershipTraces[index - 1]!.tick > trace.tick))) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'trace-ordering', 'Organization membership traces are invalid')
  for (const trace of lifecycle.latestFormationTraces) {
    if (!definitions.has(trace.kindId) || !cellsById.has(trace.locationCellId) || !Array.isArray(trace.candidatePersonIds) || trace.candidatePersonIds.some((personId) => !personIds.has(personId)) || typeof trace.formed !== 'boolean' || !validLifecycleReason(trace.rejectionReason) || (trace.formed ? !trace.organizationId : trace.organizationId !== undefined)) fail('organizations', 'state.organizationLifecycle.latestFormationTraces', 'formation-schema', 'Organization formation trace is invalid')
    if (trace.formed) { const organization = state.organizations.find((candidate) => candidate.id === trace.organizationId); if (!organization || organization.kind !== trace.kindId || organization.locationCellId !== trace.locationCellId) fail('organizations', 'state.organizationLifecycle.latestFormationTraces', 'organization-reference', 'Organization formation trace does not match its organization') }
  }
  for (const trace of lifecycle.latestMembershipTraces) {
    const organization = state.organizations.find((candidate) => candidate.id === trace.organizationId)
    const definition = organization ? definitions.get(organization.kind) : undefined
    const validRole = (role: unknown): role is string => typeof role === 'string' && Boolean(definition?.memberRoleIds.includes(role))
    const validTransition = trace.change === 'joined' ? trace.previousRoleId === undefined && validRole(trace.nextRoleId) : trace.change === 'role-changed' ? validRole(trace.previousRoleId) && validRole(trace.nextRoleId) && trace.previousRoleId !== trace.nextRoleId : trace.change === 'left' ? validRole(trace.previousRoleId) && trace.nextRoleId === undefined : false
    if (!organization || !personIds.has(trace.personId) || typeof trace.selected !== 'boolean' || !validLifecycleReason(trace.rejectionReason) || !validTransition) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'membership-reference', 'Organization membership trace is invalid')
  }
}

function validTraceNumbers(trace: { tick: unknown; baseProbabilityPermille: unknown; finalProbabilityPermille: unknown; randomRollPermille: unknown; factors: unknown }): boolean {
  const permille = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000
  if (!(typeof trace.tick === 'number' && Number.isSafeInteger(trace.tick) && trace.tick >= 0) || ![trace.baseProbabilityPermille, trace.finalProbabilityPermille, trace.randomRollPermille].every(permille) || !trace.factors || typeof trace.factors !== 'object') return false
  const factors = trace.factors as Record<string, unknown>
  return ['activityPermille', 'proximityPermille', 'relationshipPermille', 'interestPermille', 'exposurePermille'].every((name) => Number.isSafeInteger(factors[name]) && (factors[name] as number) >= 0 && (factors[name] as number) <= 1000)
}

function validLifecycleReason(reason: unknown): boolean { return reason === undefined || ['disabled', 'insufficient-activity', 'already-member', 'no-relationship', 'no-role', 'probability', 'invalid-transition'].includes(reason as string) }
