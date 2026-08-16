import type { EncounterOutcome, RelationshipPerspective, RelationshipState } from '../domain/types'
import {
  DAILY_FREQUENCY_RETENTION_PERMILLE,
  INITIAL_FAMILIARITY,
  INITIAL_INTERACTION_FREQUENCY,
  INITIAL_PERSPECTIVE,
  RELATIONSHIP_DELTAS,
  RELATIONSHIP_MAX,
  RELATIONSHIP_MIN,
} from './config'

export function relationshipId(firstPersonId: string, secondPersonId: string): string {
  if (firstPersonId === secondPersonId) throw new Error('A person cannot have a relationship with themselves')
  return firstPersonId < secondPersonId
    ? `${firstPersonId}|${secondPersonId}`
    : `${secondPersonId}|${firstPersonId}`
}

export function createRelationship(firstPersonId: string, secondPersonId: string): RelationshipState {
  const personAId = firstPersonId < secondPersonId ? firstPersonId : secondPersonId
  const personBId = firstPersonId < secondPersonId ? secondPersonId : firstPersonId
  return {
    id: relationshipId(personAId, personBId),
    personAId,
    personBId,
    familiarity: INITIAL_FAMILIARITY,
    interactionFrequency: INITIAL_INTERACTION_FREQUENCY,
    interactionCount: 0,
    lastInteractionTick: 0,
    aToB: { ...INITIAL_PERSPECTIVE },
    bToA: { ...INITIAL_PERSPECTIVE },
  }
}

export function applyEncounter(relationship: RelationshipState, outcome: EncounterOutcome, tick: number): RelationshipState {
  const delta = RELATIONSHIP_DELTAS[outcome]
  return {
    ...relationship,
    familiarity: clamp(relationship.familiarity + delta.familiarity),
    interactionFrequency: clamp(relationship.interactionFrequency + delta.interactionFrequency),
    interactionCount: relationship.interactionCount + 1,
    lastInteractionTick: tick,
    aToB: applyPerspectiveDelta(relationship.aToB, delta),
    bToA: applyPerspectiveDelta(relationship.bToA, delta),
  }
}

export function decayInteractionFrequency(relationship: RelationshipState): RelationshipState {
  return {
    ...relationship,
    interactionFrequency: Math.floor(relationship.interactionFrequency * DAILY_FREQUENCY_RETENTION_PERMILLE / 1000),
  }
}

export function otherPersonId(relationship: RelationshipState, personId: string): string | undefined {
  if (relationship.personAId === personId) return relationship.personBId
  if (relationship.personBId === personId) return relationship.personAId
  return undefined
}

export function perspectiveFrom(relationship: RelationshipState, personId: string): RelationshipPerspective | undefined {
  if (relationship.personAId === personId) return relationship.aToB
  if (relationship.personBId === personId) return relationship.bToA
  return undefined
}

function applyPerspectiveDelta(perspective: RelationshipPerspective, delta: typeof RELATIONSHIP_DELTAS[EncounterOutcome]): RelationshipPerspective {
  return {
    affection: clamp(perspective.affection + delta.affection),
    trust: clamp(perspective.trust + delta.trust),
    respect: clamp(perspective.respect + delta.respect),
    fear: clamp(perspective.fear + delta.fear),
  }
}

function clamp(value: number): number {
  return Math.max(RELATIONSHIP_MIN, Math.min(RELATIONSHIP_MAX, value))
}
