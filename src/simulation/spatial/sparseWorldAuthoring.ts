import type { GeographicCell, Terrain, TerrainTypeOverride, ElevationOverride, ResourceCapacityOverride } from '../domain/types'
import { cellId } from './hex'
import { worldChunkKey } from './worldChunks'

/** Maximum authored canvas size; active simulation materialization has a separate limit. */
export const SPARSE_AUTHORING_MAX_CELLS = 1_000_000_000

export interface SparseWorldAuthoringDraft {
  seed: string
  width: number
  height: number
  terrainBase?: 'seeded-valley' | 'blank-land'
  terrainOverrides?: readonly TerrainTypeOverride[]
  elevationOverrides?: readonly ElevationOverride[]
  resourceCapacityOverrides?: readonly ResourceCapacityOverride[]
}

/** A bounded streamed result that never allocates cells outside the request. */
export interface SparseAuthoringViewport { chunkKeys: string[]; cells: GeographicCell[] }

export function projectSparseAuthoringViewport(draft: SparseWorldAuthoringDraft, bounds: { minQ: number; maxQ: number; minR: number; maxR: number }): SparseAuthoringViewport {
  validateSparseDraft(draft)
  const count = (bounds.maxQ - bounds.minQ + 1) * (bounds.maxR - bounds.minR + 1)
  if (!Number.isSafeInteger(count) || count < 1 || count > 4096) throw new RangeError('Sparse authoring viewport may contain from 1 through 4096 cells')
  if (!Number.isSafeInteger(bounds.minQ) || !Number.isSafeInteger(bounds.maxQ) || !Number.isSafeInteger(bounds.minR) || !Number.isSafeInteger(bounds.maxR) || bounds.minQ < 0 || bounds.minR < 0 || bounds.maxQ >= draft.width || bounds.maxR >= draft.height || bounds.minQ > bounds.maxQ || bounds.minR > bounds.maxR) throw new RangeError('Sparse authoring viewport bounds are invalid')
  const terrain = new Map((draft.terrainOverrides ?? []).map((entry) => [entry.cellId, entry.terrain]))
  const elevation = new Map((draft.elevationOverrides ?? []).map((entry) => [entry.cellId, entry.elevation]))
  const capacity = new Map((draft.resourceCapacityOverrides ?? []).map((entry) => [entry.cellId, entry.resourceCapacity]))
  const cells: GeographicCell[] = []
  for (let r = bounds.minR; r <= bounds.maxR; r += 1) for (let q = bounds.minQ; q <= bounds.maxQ; q += 1) {
    const id = cellId({ q, r }); const base = generatedCell(draft, q, r)
    const nextTerrain = terrain.get(id) ?? base.terrain
    const nextElevation = elevation.get(id) ?? base.elevation
    const nextCapacity = nextTerrain === 'water' ? 0 : capacity.get(id) ?? base.resourceCapacity
    cells.push(coherentCell(id, q, r, nextTerrain, nextElevation, nextCapacity))
  }
  return { chunkKeys: [...new Set(cells.map((cell) => worldChunkKey(cell.q, cell.r)))].sort(), cells }
}

function validateSparseDraft(draft: SparseWorldAuthoringDraft): void {
  if (!draft || !Number.isSafeInteger(draft.width) || !Number.isSafeInteger(draft.height) || draft.width < 1 || draft.height < 1 || draft.width * draft.height > SPARSE_AUTHORING_MAX_CELLS) throw new RangeError('Sparse authoring dimensions are invalid')
  if (draft.terrainBase !== undefined && draft.terrainBase !== 'seeded-valley' && draft.terrainBase !== 'blank-land') throw new Error('Sparse authoring terrain baseline is invalid')
  const seen = new Set<string>()
  for (const entry of [...(draft.terrainOverrides ?? []), ...(draft.elevationOverrides ?? []), ...(draft.resourceCapacityOverrides ?? [])]) {
    const [qText, rText, ...extra] = entry.cellId.split(','); const q = Number(qText); const r = Number(rText)
    if (extra.length || !Number.isSafeInteger(q) || !Number.isSafeInteger(r) || q < 0 || r < 0 || q >= draft.width || r >= draft.height) throw new Error(`Sparse authoring override is outside canvas: ${entry.cellId}`)
  }
  for (const entry of draft.terrainOverrides ?? []) { if (entry.terrain !== 'water' && entry.terrain !== 'plain' && entry.terrain !== 'hill') throw new Error('Sparse authoring terrain override is invalid'); if (seen.has(`terrain:${entry.cellId}`)) throw new Error(`Duplicate sparse terrain override: ${entry.cellId}`); seen.add(`terrain:${entry.cellId}`) }
  for (const entry of draft.elevationOverrides ?? []) { if (!Number.isSafeInteger(entry.elevation) || entry.elevation < 0 || entry.elevation > 1000) throw new Error('Sparse authoring elevation override is invalid') }
  for (const entry of draft.resourceCapacityOverrides ?? []) { if (!Number.isSafeInteger(entry.resourceCapacity) || entry.resourceCapacity < 0 || entry.resourceCapacity > 1000) throw new Error('Sparse authoring resource override is invalid') }
}

function generatedCell(draft: SparseWorldAuthoringDraft, q: number, r: number): GeographicCell {
  const blank = draft.terrainBase === 'blank-land'; const noise = hash(`${draft.seed}\u001f${q}\u001f${r}`)
  const elevation = blank ? 300 : 150 + noise % 500
  const terrain: Terrain = blank ? 'plain' : elevation > 600 ? 'hill' : noise % 29 === 0 ? 'water' : 'plain'
  return coherentCell(cellId({ q, r }), q, r, terrain, elevation, terrain === 'water' ? 0 : 100 + noise % 101)
}

function coherentCell(id: string, q: number, r: number, terrain: Terrain, elevation: number, resourceCapacity: number): GeographicCell {
  const water = terrain === 'water'; const habitability = water ? 0 : terrain === 'hill' ? Math.max(150, 780 - elevation) : Math.max(450, 900 - Math.abs(elevation - 300))
  return { id, q, r, terrain, elevation, habitability, movementCost: water ? 0 : terrain === 'hill' ? 1800 : 1000, resourceCapacity: water ? 0 : resourceCapacity, foodAmount: water ? 0 : resourceCapacity, foodRegenerationPerDay: water || resourceCapacity === 0 ? 0 : Math.max(1, Math.floor(resourceCapacity / 12)) }
}

function hash(value: string): number { let result = 2166136261; for (const byte of new TextEncoder().encode(value)) { result ^= byte; result = Math.imul(result, 16777619) } return result >>> 0 }
