import type { SimulationState } from '../domain/types'
import { failCanonicalValidation as fail } from '../validation/error'

/** Canonical validation owned by the governance subsystem. */
export function validateGovernanceState(state: SimulationState): void {
  const ids = new Set(state.governance.map((entry) => entry.id))
  if (ids.size !== state.governance.length || state.governance.length !== state.communities.length || state.governance.some((entry, index) => entry.communityId !== state.communities[index]?.catchment.id)) fail('governance', 'state.governance', 'identity-or-ordering', 'Governance does not match canonical community registry order')
  const communityIds = new Set(state.communities.map((community) => community.catchment.id))
  const personIds = new Set(state.people.map((person) => person.id))
  for (const entry of state.governance) if (!communityIds.has(entry.communityId) || entry.id !== `governance.${entry.communityId}` || !Array.isArray(entry.representativeIds) || entry.representativeIds.some((id, index) => !personIds.has(id) || (index > 0 && entry.representativeIds[index - 1]! >= id)) || [entry.legitimacy, entry.serviceAccessPermille, entry.contributionFairnessPermille].some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000) || !Number.isSafeInteger(entry.lastUpdatedTick) || entry.lastUpdatedTick > state.tick) fail('governance', `state.governance.${entry.id}`, 'state-or-reference', `Governance ${entry.id} has invalid state or references`)
}
