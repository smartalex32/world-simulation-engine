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

/** Explainable, non-fluid hydrology derived from an authored elevation surface. */
export interface HydrologyCell extends DrainageCell {
  watershedCellCount: number
  upstreamCellCount: number
  river: boolean
  lake: boolean
}

export interface HydrologyModel {
  cells: ReadonlyMap<string, HydrologyCell>
  riverCellIds: readonly string[]
  lakeCellIds: readonly string[]
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

/**
 * Derives watershed sizes, ephemeral river evidence, and closed-basin lakes.
 * This is intentionally a graph calculation, not a global fluid simulation:
 * every outcome is a pure function of the grid and stable cell ordering.
 */
export function deriveHydrology(grid: HexGrid, riverThresholdCells = 12): HydrologyModel {
  if (!Number.isSafeInteger(riverThresholdCells) || riverThresholdCells < 1) throw new RangeError('River threshold must be a positive integer')
  const drainage = deriveDrainage(grid)
  const cells = [...grid.cells].sort((first, second) => compareStableText(first.id, second.id))
  const upstream = new Map(cells.map((cell) => [cell.id, cell.terrain === 'water' ? 0 : 1]))
  // Strict downhill edges guarantee an elevation-descending topological order.
  for (const cell of [...cells].sort((first, second) => second.elevation - first.elevation || compareStableText(first.id, second.id))) {
    const downstream = drainage.get(cell.id)?.downstreamCellId
    if (downstream !== undefined) upstream.set(downstream, (upstream.get(downstream) ?? 0) + (upstream.get(cell.id) ?? 0))
  }
  const watershedSize = new Map<string, number>()
  for (const cell of cells) {
    const basin = drainage.get(cell.id)?.basinId ?? cell.id
    watershedSize.set(basin, (watershedSize.get(basin) ?? 0) + 1)
  }
  const result = new Map<string, HydrologyCell>()
  const riverCellIds: string[] = []
  const lakeCellIds: string[] = []
  for (const cell of cells) {
    const detail = drainage.get(cell.id)!
    const lake = cell.terrain !== 'water' && detail.downstreamCellId === undefined && (watershedSize.get(detail.basinId) ?? 0) > 1
    const river = cell.terrain !== 'water' && !lake && (upstream.get(cell.id) ?? 0) >= riverThresholdCells
    if (river) riverCellIds.push(cell.id)
    if (lake) lakeCellIds.push(cell.id)
    result.set(cell.id, { ...detail, upstreamCellCount: upstream.get(cell.id) ?? 0, watershedCellCount: watershedSize.get(detail.basinId) ?? 0, river, lake })
  }
  return { cells: result, riverCellIds, lakeCellIds }
}
