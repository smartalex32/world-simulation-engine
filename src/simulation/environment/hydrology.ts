import type { GeographicCell, HexGrid } from '../domain/types'
import { cellId, hexNeighbors } from '../spatial/hex'
import { compareStableText } from '../../shared/stableOrder'

/** Derived drainage evidence. It is not mutable water simulation or a terrain edit. */
export interface DrainageCell {
  cellId: string
  /** The immediately lower neighbor selected with a stable tie-breaker. */
  downstreamCellId?: string
  /** Stable terminal sink reached by following strictly downhill flow. */
  basinId: string
}

/**
 * Builds a deterministic, acyclic drainage graph from the authored elevation
 * surface. Only strictly lower neighbors receive flow, so flats remain local
 * sinks until a future lake/filled-depression model gives them an outlet.
 */
export function deriveDrainage(grid: HexGrid): ReadonlyMap<string, DrainageCell> {
  const cells = new Map(grid.cells.map((cell) => [cell.id, cell]))
  const flow = new Map<string, string | undefined>()
  for (const cell of grid.cells) {
    if (cell.terrain === 'water') { flow.set(cell.id, undefined); continue }
    const lower = hexNeighbors(cell)
      .map((coordinate) => cells.get(cellId(coordinate)))
      .filter((candidate): candidate is GeographicCell => candidate !== undefined && candidate.elevation < cell.elevation)
      .sort((a, b) => a.elevation - b.elevation || compareStableText(a.id, b.id))[0]
    flow.set(cell.id, lower?.id)
  }
  const result = new Map<string, DrainageCell>()
  const basinFor = (id: string): string => {
    const existing = result.get(id)
    if (existing) return existing.basinId
    const downstream = flow.get(id)
    const basinId = downstream === undefined ? id : basinFor(downstream)
    result.set(id, { cellId: id, ...(downstream === undefined ? {} : { downstreamCellId: downstream }), basinId })
    return basinId
  }
  for (const cell of grid.cells) basinFor(cell.id)
  return result
}
