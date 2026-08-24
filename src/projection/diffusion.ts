import type { PersonState, SettlementState } from '../simulation/domain/types'
import type { ProjectedSettlementDiffusion } from './types'

/** Read-only regional language/culture observation from actual homes, never settlement membership. */
export function buildProjectedSettlementDiffusion(settlements: readonly SettlementState[], people: readonly PersonState[]): ProjectedSettlementDiffusion[] {
  return [...settlements].sort((a, b) => a.id.localeCompare(b.id)).map((settlement) => {
    const residents = people.filter((person) => person.lifeStatus !== 'dead' && person.homeCellId === settlement.anchorCellId)
    const count = residents.length
    const valley = count ? Math.round(residents.reduce((sum, person) => sum + (person.language?.fluency['language.valley'] ?? 0), 0) / count) : 0
    const exploration = count ? Math.round(residents.reduce((sum, person) => sum + (person.culture?.beliefs['belief.exploration'] ?? 0), 0) / count) : 0
    return { settlementId: settlement.id, observedResidentCount: count, averageValleyFluency: valley, averageExplorationBelief: exploration }
  })
}
