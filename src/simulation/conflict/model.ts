import type { DisputeState, EncounterOutcome } from '../domain/types'

export function disputeId(first: string, second: string): string { return first < second ? `dispute.${first}|${second}` : `dispute.${second}|${first}` }
export function applyDispute(existing: DisputeState | undefined, first: string, second: string, outcome: EncounterOutcome, communityId: string, tick: number): DisputeState | undefined {
  if (outcome !== 'tense') return existing
  const base: DisputeState = existing ?? { id: disputeId(first, second), personAId: first < second ? first : second, personBId: first < second ? second : first, grievance: 0, incidents: 0, lastIncidentTick: 0, communityId }
  return { ...base, grievance: Math.min(1000, base.grievance + 120), incidents: base.incidents + 1, lastIncidentTick: tick, communityId }
}
