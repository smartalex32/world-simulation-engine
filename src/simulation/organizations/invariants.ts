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
    if (organization.members.some((member) => !definition.memberRoleIds.includes(member.role))) fail('organizations', `state.organizations.${organization.id}.members`, 'member-role', `Organization ${organization.id} has invalid member role`)
    if (!cellsById.get(organization.locationCellId)?.movementCost || locationsById.get(organization.activityLocationId)?.cellId !== organization.locationCellId || organization.members.some((member, index) => !personIds.has(member.personId) || (index > 0 && organization.members[index - 1]!.personId >= member.personId))) fail('organizations', `state.organizations.${organization.id}`, 'member-or-location-reference', `Organization ${organization.id} has invalid members or location`)
    if (!Number.isSafeInteger(organization.serviceCapacity) || organization.serviceCapacity < 1) fail('organizations', `state.organizations.${organization.id}.serviceCapacity`, 'capacity', `Organization ${organization.id} has invalid service capacity`)
    if (organization.sharedRuleIds.length !== definition.sharedRuleIds.length || organization.sharedRuleIds.some((id, index) => id !== definition.sharedRuleIds[index])) fail('organizations', `state.organizations.${organization.id}.sharedRuleIds`, 'shared-rules', `Organization ${organization.id} does not match its defined rules`)
  }
  const lifecycle = state.organizationLifecycle
  if (!lifecycle) return
  if (lifecycle.latestFormationTraces.some((trace, index) => !Number.isSafeInteger(trace.tick) || trace.tick < 0 || (index > 0 && lifecycle.latestFormationTraces[index - 1]!.tick > trace.tick))) fail('organizations', 'state.organizationLifecycle.latestFormationTraces', 'trace-ordering', 'Organization formation traces are invalid')
  if (lifecycle.latestMembershipTraces.some((trace, index) => !Number.isSafeInteger(trace.tick) || trace.tick < 0 || (index > 0 && lifecycle.latestMembershipTraces[index - 1]!.tick > trace.tick))) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'trace-ordering', 'Organization membership traces are invalid')
}
