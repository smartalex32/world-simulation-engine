import type { SimulationState } from '../domain/types'
import { failCanonicalValidation as fail } from '../validation/error'

/** Canonical validation owned by the organization subsystem. */
export function validateOrganizationState(state: SimulationState): void {
  const ids = new Set(state.organizations.map((organization) => organization.id))
  if (ids.size !== state.organizations.length || state.organizations.some((organization, index) => index > 0 && state.organizations[index - 1]!.id >= organization.id)) fail('organizations', 'state.organizations', 'identity-or-ordering', 'Organizations are not uniquely canonically ordered')
  const cellsById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
  const locationsById = new Map(state.activityLocations.map((location) => [location.id, location]))
  const personIds = new Set(state.people.map((person) => person.id))
  for (const organization of state.organizations) {
    if (organization.kind !== 'school') fail('organizations', `state.organizations.${organization.id}.kind`, 'kind', `Organization ${organization.id} has invalid kind`)
    if (organization.members.some((member) => member.role !== 'learner')) fail('organizations', `state.organizations.${organization.id}.members`, 'member-role', `Organization ${organization.id} has invalid member role`)
    if (!cellsById.get(organization.locationCellId)?.movementCost || locationsById.get(organization.activityLocationId)?.cellId !== organization.locationCellId || organization.members.some((member, index) => !personIds.has(member.personId) || (index > 0 && organization.members[index - 1]!.personId >= member.personId))) fail('organizations', `state.organizations.${organization.id}`, 'member-or-location-reference', `Organization ${organization.id} has invalid members or location`)
    if (!Number.isSafeInteger(organization.serviceCapacity) || organization.serviceCapacity < 1) fail('organizations', `state.organizations.${organization.id}.serviceCapacity`, 'capacity', `Organization ${organization.id} has invalid service capacity`)
  }
}
