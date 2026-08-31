import type { SimulationState } from '../domain/types'
import { failCanonicalValidation as fail } from '../validation/error'
import { relationshipId } from './model'

/** Canonical validation owned by the relationship subsystem. */
export function validateRelationshipState(state: SimulationState): void {
  if (new Set(state.relationships.map((relationship) => relationship.id)).size !== state.relationships.length) fail('relationships', 'state.relationships', 'duplicate-id', 'Relationships contain duplicate IDs')
  const orderedIds = state.relationships.map((relationship) => relationship.id).sort()
  if (state.relationships.some((relationship, index) => relationship.id !== orderedIds[index])) fail('relationships', 'state.relationships', 'ordering', 'Relationships are not in canonical order')
  const personIds = new Set(state.people.map((person) => person.id))
  for (const relationship of state.relationships) {
    if (relationship.personAId >= relationship.personBId || relationship.id !== relationshipId(relationship.personAId, relationship.personBId)) fail('relationships', `state.relationships.${relationship.id}`, 'identity', `Relationship ${relationship.id} is not canonical`)
    if (!personIds.has(relationship.personAId) || !personIds.has(relationship.personBId)) fail('relationships', `state.relationships.${relationship.id}`, 'missing-reference', `Relationship ${relationship.id} contains a missing person`)
    const bounded = [relationship.familiarity, relationship.interactionFrequency, ...Object.values(relationship.aToB), ...Object.values(relationship.bToA)]
    if (bounded.some((value) => !Number.isInteger(value) || value < 0 || value > 1000)) fail('relationships', `state.relationships.${relationship.id}`, 'dimensions', `Relationship ${relationship.id} has invalid dimensions`)
    if (!Number.isSafeInteger(relationship.interactionCount) || relationship.interactionCount < 1 || !Number.isSafeInteger(relationship.lastInteractionTick) || relationship.lastInteractionTick < 1 || relationship.lastInteractionTick > state.tick) fail('relationships', `state.relationships.${relationship.id}`, 'interaction-state', `Relationship ${relationship.id} has invalid interaction state`)
  }
}
