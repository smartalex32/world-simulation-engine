import type { SimulationState } from '../domain/types'
import { failCanonicalValidation as fail } from '../validation/error'

/** Canonical validation owned by the conflict subsystem. */
export function validateDisputeState(state: SimulationState): void {
  const ids = new Set(state.disputes.map((entry) => entry.id))
  if (ids.size !== state.disputes.length || state.disputes.some((entry, index) => index > 0 && state.disputes[index - 1]!.id >= entry.id)) fail('disputes', 'state.disputes', 'identity-or-ordering', 'Disputes are not uniquely canonically ordered')
  const personIds = new Set(state.people.map((person) => person.id))
  const communityIds = new Set(state.communities.map((community) => community.catchment.id))
  for (const dispute of state.disputes) if (!personIds.has(dispute.personAId) || !personIds.has(dispute.personBId) || dispute.personAId >= dispute.personBId || dispute.id !== `dispute.${dispute.personAId}|${dispute.personBId}` || !communityIds.has(dispute.communityId) || !Number.isSafeInteger(dispute.grievance) || dispute.grievance < 0 || dispute.grievance > 1000 || !Number.isSafeInteger(dispute.incidents) || dispute.incidents < 1 || !Number.isSafeInteger(dispute.lastIncidentTick) || dispute.lastIncidentTick < 1 || dispute.lastIncidentTick > state.tick) fail('disputes', `state.disputes.${dispute.id}`, 'state-or-reference', `Dispute ${dispute.id} has invalid state or references`)
}
