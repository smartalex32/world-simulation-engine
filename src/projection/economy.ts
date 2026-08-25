import type { HouseholdState, PersonState } from '../simulation/domain/types'

/**
 * Bounded, read-only material evidence for the workbench. Food and tools stay
 * separate: this intentionally does not manufacture a generic wealth score.
 */
export interface ProjectedEconomicSummary {
  householdCount: number
  householdsWithoutFoodCount: number
  foodUnits: number
  toolUnits: number
  foodGiniPermille: number
  toolGiniPermille: number
  occupationCounts: { dependent: number; household: number; forager: number; unassigned: number }
}

export function buildProjectedEconomicSummary(households: readonly HouseholdState[], people: readonly PersonState[]): ProjectedEconomicSummary {
  const orderedHouseholds = [...households].sort((first, second) => first.id.localeCompare(second.id))
  const food = orderedHouseholds.map((household) => Math.max(0, household.inventory?.food ?? 0))
  const tools = orderedHouseholds.map((household) => Math.max(0, household.inventory?.tools ?? 0))
  const occupationCounts = { dependent: 0, household: 0, forager: 0, unassigned: 0 }
  for (const person of people) {
    if (person.lifeStatus === 'dead') continue
    switch (person.occupation) {
      case 'dependent': occupationCounts.dependent += 1; break
      case 'household': occupationCounts.household += 1; break
      case 'forager': occupationCounts.forager += 1; break
      default: occupationCounts.unassigned += 1
    }
  }
  return {
    householdCount: orderedHouseholds.length,
    householdsWithoutFoodCount: food.filter((value) => value === 0).length,
    foodUnits: food.reduce((sum, value) => sum + value, 0),
    toolUnits: tools.reduce((sum, value) => sum + value, 0),
    foodGiniPermille: giniPermille(food),
    toolGiniPermille: giniPermille(tools),
    occupationCounts,
  }
}

/** Integer Gini coefficient in 0–1000; 0 means equal holdings, 1000 maximal inequality. */
function giniPermille(values: readonly number[]): number {
  if (values.length === 0) return 0
  const ordered = [...values].sort((first, second) => first - second)
  const total = ordered.reduce((sum, value) => sum + value, 0)
  if (total === 0) return 0
  const weighted = ordered.reduce((sum, value, index) => sum + (index + 1) * value, 0)
  return Math.round((2 * weighted / (ordered.length * total) - (ordered.length + 1) / ordered.length) * 1000)
}
