import type { OrganizationLifecycleState, OrganizationState } from './types'

/** Detailed identities referenced by current or retained institutional history
 * must survive cohort dematerialization until an explicit archival model exists. */
export function organizationPersonReferences(organizations: readonly OrganizationState[], lifecycle: OrganizationLifecycleState): Set<string> {
  const refs = new Set<string>()
  const add = (id: string | undefined) => { if (id) refs.add(id) }
  for (const org of organizations) {
    for (const member of [...org.members, ...(org.closedMembership?.members ?? [])]) add(member.personId)
    add(org.leadership?.leaderPersonId)
    for (const trace of org.leadership?.latestTraces ?? []) {
      add(trace.previousLeaderPersonId); add(trace.selectedLeaderPersonId)
      for (const candidate of trace.candidates) add(candidate.personId)
    }
    for (const record of [...(org.decisions?.pending ?? []), ...(org.decisions?.latestResolutions ?? [])]) record.participantIds.forEach(add)
    for (const entry of [...(org.reputationLedger?.observations ?? []), ...(org.reputationLedger?.currentByObserver ?? [])]) if (entry.observer.kind === 'person') add(entry.observer.id)
  }
  for (const trace of lifecycle.latestFormationTraces) trace.candidatePersonIds.forEach(add)
  for (const trace of lifecycle.latestMembershipTraces) add(trace.personId)
  for (const trace of lifecycle.latestTransitionTraces ?? []) trace.memberIds.forEach(add)
  return refs
}
