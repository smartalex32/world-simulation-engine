import type { PersonLifeStage, PersonState, RelationshipState } from '../domain/types'

/** Named streams keep life-cycle draws isolated from decisions and encounters. */
export const LIFE_CYCLE_STREAM = {
  mortality: 'life-cycle.mortality',
  partnership: 'life-cycle.partnership',
  birth: 'life-cycle.birth',
  inheritance: 'life-cycle.inheritance',
} as const

export const LIFE_CYCLE_INTERVAL_HOURS = 8760
export const PARTNERSHIP_MINIMUM_AGE = 18
export const BIRTH_PARENT_MINIMUM_AGE = 18
export const BIRTH_PARENT_MAXIMUM_AGE = 45

export function lifeStageForAge(ageYears: number): PersonLifeStage {
  if (!Number.isSafeInteger(ageYears) || ageYears < 0) throw new RangeError('Age must be a non-negative safe integer')
  if (ageYears < 2) return 'infant'
  if (ageYears < 13) return 'child'
  if (ageYears < 18) return 'adolescent'
  if (ageYears < 65) return 'adult'
  return 'olderAdult'
}

/** Annual probability, in permille. The 120+ terminal band bounds very long runs. */
export function annualMortalityPermille(ageYears: number): number {
  if (ageYears < 75) return 0
  if (ageYears < 85) return 45
  if (ageYears < 100) return 180
  if (ageYears < 120) return 500
  return 1000
}

/** Relationship-gated eligibility; global arbitrary matching is intentionally excluded. */
export function partnershipEligible(first: PersonState, second: PersonState, relationship: RelationshipState | undefined): boolean {
  if (!relationship || first.id === second.id || first.lifeStatus === 'dead' || second.lifeStatus === 'dead') return false
  if (first.partnerId || second.partnerId || first.ageYears < PARTNERSHIP_MINIMUM_AGE || second.ageYears < PARTNERSHIP_MINIMUM_AGE) return false
  return relationship.familiarity >= 500 && relationship.interactionCount >= 3
    && relationship.aToB.trust >= 500 && relationship.bToA.trust >= 500
    && relationship.aToB.affection >= 500 && relationship.bToA.affection >= 500
}

export function birthEligible(first: PersonState, second: PersonState): boolean {
  if (first.lifeStatus === 'dead' || second.lifeStatus === 'dead' || first.partnerId !== second.id || second.partnerId !== first.id) return false
  return first.ageYears >= BIRTH_PARENT_MINIMUM_AGE && first.ageYears <= BIRTH_PARENT_MAXIMUM_AGE
    && second.ageYears >= BIRTH_PARENT_MINIMUM_AGE && second.ageYears <= BIRTH_PARENT_MAXIMUM_AGE
}
