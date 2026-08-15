import type { GeographicCell, PersonState } from '../domain/types'
import type { RandomProvider } from '../rng/pcg32'
import { hexNeighbors } from '../spatial/hex'

export function generatePopulation(cells: GeographicCell[], random: RandomProvider, count = 200): PersonState[] {
  const rng = random.stream('population')
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  const homes = cells.filter((cell) => cell.habitability >= 500 && cell.movementCost > 0)
  if (homes.length === 0) throw new Error('World has no habitable cells for population placement')

  return Array.from({ length: count }, (_, index) => {
    const home = homes[rng.nextInt(homes.length)]
    if (!home) throw new Error('Unable to select a home cell')
    const knownCellIds = [home.id, ...hexNeighbors(home)
      .map(({ q, r }) => byId.get(`${q},${r}`))
      .filter((cell): cell is GeographicCell => Boolean(cell?.movementCost))
      .map((cell) => cell.id)]
      .sort()
    return {
      id: `person-${(index + 1).toString().padStart(4, '0')}`,
      ageYears: 18 + rng.nextInt(48),
      locationCellId: home.id,
      homeCellId: home.id,
      traits: {
        curiosity: rng.nextInt(1001),
        riskTolerance: rng.nextInt(1001),
        sociability: rng.nextInt(1001),
      },
      hunger: rng.nextInt(301),
      knownCellIds,
    }
  })
}
