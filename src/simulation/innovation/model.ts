import type { HouseholdInventory, PersonState, PracticalTechnique } from '../domain/types'
import type { Pcg32 } from '../rng/pcg32'

export const INNOVATION_STREAM = 'innovation.practical-experiment'
export const TECHNIQUE_ID = 'technique.foraging.efficient-harvest' as const
export function attemptPracticalExperiment(person: PersonState, inventory: HouseholdInventory, tick: number, rng: Pcg32): PracticalTechnique | undefined {
  if (person.techniques?.some((technique) => technique.id === TECHNIQUE_ID) || inventory.tools < 1) return undefined
  const knowledge = person.knowledge?.['knowledge.foraging'] ?? 0
  if (knowledge < 500) return undefined
  const roll = rng.nextInt(1000); const probability = Math.min(850, 120 + knowledge / 2)
  if (roll >= probability) return undefined
  inventory.tools -= 1
  const technique: PracticalTechnique = { id: TECHNIQUE_ID, personId: person.id, createdTick: tick, knowledgePermille: knowledge, toolCost: 1, successRollPermille: roll }
  person.techniques = [...(person.techniques ?? []), technique]
  return technique
}
export function techniqueHarvestBonusPermille(person: PersonState): number { return person.techniques?.some((technique) => technique.id === TECHNIQUE_ID) ? 150 : 0 }
