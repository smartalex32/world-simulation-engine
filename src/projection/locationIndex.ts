import type { GeographicCell } from '../simulation/domain/types'
import { compareStableText } from '../shared/stableOrder'
import { projectionChunkKey } from './chunks'
import { PROJECTION_CHUNK_SIZE, type AxialViewportBounds } from './types'

export interface IndexedProjectionLocation { id: string; cellId: string }

export function buildLocationChunkIndex(entries: readonly IndexedProjectionLocation[], cells: ReadonlyMap<string, GeographicCell>): ReadonlyMap<string, readonly IndexedProjectionLocation[]> {
  const chunks = new Map<string, IndexedProjectionLocation[]>()
  for (const entry of entries) {
    const cell = cells.get(entry.cellId)
    if (!cell) continue
    const key = projectionChunkKey(cell.q, cell.r)
    const values = chunks.get(key)
    if (values) values.push(entry)
    else chunks.set(key, [entry])
  }
  return new Map([...chunks.entries()].sort(([a], [b]) => compareStableText(a, b)).map(([key, values]) => [key, values.sort((a, b) => compareStableText(a.id, b.id))]))
}

export function visibleIndexedLocations(index: ReadonlyMap<string, readonly IndexedProjectionLocation[]>, cells: ReadonlyMap<string, GeographicCell>, bounds: AxialViewportBounds): IndexedProjectionLocation[] {
  const visible: IndexedProjectionLocation[] = []
  for (let r = Math.floor(bounds.minR / PROJECTION_CHUNK_SIZE); r <= Math.floor(bounds.maxR / PROJECTION_CHUNK_SIZE); r += 1) for (let q = Math.floor(bounds.minQ / PROJECTION_CHUNK_SIZE); q <= Math.floor(bounds.maxQ / PROJECTION_CHUNK_SIZE); q += 1) {
    for (const entry of index.get(projectionChunkKey(q * PROJECTION_CHUNK_SIZE, r * PROJECTION_CHUNK_SIZE)) ?? []) {
      const cell = cells.get(entry.cellId)
      if (cell && cell.q >= bounds.minQ && cell.q <= bounds.maxQ && cell.r >= bounds.minR && cell.r <= bounds.maxR) visible.push(entry)
    }
  }
  return visible.sort((a, b) => compareStableText(a.id, b.id))
}
