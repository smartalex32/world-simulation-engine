import type { EncounterOutcome, RelationshipPerspective } from '../domain/types'

export const RELATIONSHIP_MIN = 0
export const RELATIONSHIP_MAX = 1000
export const INITIAL_FAMILIARITY = 0
export const INITIAL_INTERACTION_FREQUENCY = 0
export const INITIAL_PERSPECTIVE: Readonly<RelationshipPerspective> = {
  affection: 500,
  trust: 500,
  respect: 500,
  fear: 0,
}
export const DAILY_FREQUENCY_RETENTION_PERMILLE = 850

export interface RelationshipDelta {
  familiarity: number
  interactionFrequency: number
  affection: number
  trust: number
  respect: number
  fear: number
}

export const RELATIONSHIP_DELTAS: Readonly<Record<EncounterOutcome, RelationshipDelta>> = {
  positive: { familiarity: 70, interactionFrequency: 120, affection: 45, trust: 30, respect: 15, fear: -15 },
  neutral: { familiarity: 40, interactionFrequency: 100, affection: 5, trust: 5, respect: 3, fear: -5 },
  tense: { familiarity: 25, interactionFrequency: 90, affection: -35, trust: -30, respect: -10, fear: 35 },
}
