import {
  COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID,
  type CommunityVariableDefinition,
  type CommunityVariableId,
} from './types'

export const COMMUNITY_VARIABLE_DEFINITIONS: readonly CommunityVariableDefinition[] = Object.freeze([
  { id: 'community.emergent.socialTrust', label: 'Social trust', layer: 'emergent', unit: 'permille', order: 10, description: 'Encounter outcomes, experienced relationship trust, and local food security.' },
  { id: 'community.emergent.cohesion', label: 'Social cohesion', layer: 'emergent', unit: 'permille', order: 20, description: 'Encounter reach, familiarity, active relationship density, and shared commons exposure.' },
  { id: 'community.emergent.cooperation', label: 'Cooperation', layer: 'emergent', unit: 'permille', order: 30, description: 'A first cooperative-social-interaction proxy from outcomes, trust, and actual socializing.' },
  { id: 'community.emergent.conflict', label: 'Conflict pressure', layer: 'emergent', unit: 'permille', order: 40, description: 'Tense encounters, experienced fear, and food insecurity; this is not a violence model.' },
  { id: 'community.emergent.innovationClimate', label: 'Innovation climate', layer: 'emergent', unit: 'permille', order: 50, description: 'Exploration choices, completed exploration, and exposure-weighted curiosity.' },
  { id: COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID, label: 'Food security', layer: 'structural', unit: 'permille', order: 60, description: 'Local resource stock and observed meal access, kept distinct from emergent measures.' },
])

const definitionById = new Map<CommunityVariableId, CommunityVariableDefinition>(
  COMMUNITY_VARIABLE_DEFINITIONS.map((definition) => [definition.id, definition]),
)

export function getCommunityVariableDefinition(id: CommunityVariableId): CommunityVariableDefinition {
  const definition = definitionById.get(id)
  if (!definition) throw new Error(`Unknown community variable: ${id}`)
  return definition
}
