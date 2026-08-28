import type { DisputeState, EncounterOutcome } from '../domain/types'
import { compareStableText } from '../../shared/stableOrder'

export function disputeId(first: string, second: string): string { return first < second ? `dispute.${first}|${second}` : `dispute.${second}|${first}` }
export function applyDispute(existing: DisputeState | undefined, first: string, second: string, outcome: EncounterOutcome, communityId: string, tick: number): DisputeState | undefined {
  if (outcome !== 'tense') return existing
  const base: DisputeState = existing ?? { id: disputeId(first, second), personAId: first < second ? first : second, personBId: first < second ? second : first, grievance: 0, incidents: 0, lastIncidentTick: 0, communityId }
  return { ...base, grievance: Math.min(1000, base.grievance + 120), incidents: base.incidents + 1, lastIncidentTick: tick, communityId }
}

export interface ContentionResolution { communityId: string; disputeCount: number; grievance: number; outcome: 'mediation' | 'withdrawal' | 'confrontation' }
/** Daily, deterministic, non-lethal resolution of a shared unresolved-dispute context. */
export function resolveCommunityContentions(disputes: Iterable<DisputeState>, legitimacyByCommunity: ReadonlyMap<string, number>): ContentionResolution[] {
  const groups = new Map<string, DisputeState[]>()
  for (const dispute of disputes) if (dispute.grievance >= 240) { const group = groups.get(dispute.communityId); if (group) group.push(dispute); else groups.set(dispute.communityId, [dispute]) }
  const results: ContentionResolution[] = []
  for (const [communityId, group] of [...groups.entries()].sort(([a], [b]) => compareStableText(a, b))) {
    const grievance = Math.round(group.reduce((sum, dispute) => sum + dispute.grievance, 0) / group.length)
    const legitimacy = legitimacyByCommunity.get(communityId) ?? 500
    const outcome = legitimacy >= 650 ? 'mediation' : grievance >= 700 ? 'confrontation' : 'withdrawal'
    const reduction = outcome === 'mediation' ? 180 : outcome === 'withdrawal' ? 100 : 40
    for (const dispute of group) dispute.grievance = Math.max(0, dispute.grievance - reduction)
    results.push({ communityId, disputeCount: group.length, grievance, outcome })
  }
  return results
}
