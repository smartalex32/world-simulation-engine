import { generateValley } from '../spatial/worldGenerator'
import type { DraftViewportProjection, DraftViewportRequest, Terrain, TerrainTypeOverride, WorldCreationDraft, WorldDraftPreview, WorldDraftRecord } from './types'
import { normalizeWorldCreationRequest, validateWorldCreationDraftLimits } from './worldCreation'

export const WORLD_DRAFT_RECORD_VERSION = 2 as const
export const MAX_TERRAIN_PAINT_CELLS = 512

/** Creates a detached, serializable draft record. This is never simulation state. */
export function createWorldDraftRecord(draftId: string, draft: WorldCreationDraft): WorldDraftRecord {
  validateDraftId(draftId)
  validateWorldCreationDraftLimits(draft)
  const initialDraft = cloneDraft(draft)
  return { version: WORLD_DRAFT_RECORD_VERSION, draftId, revision: 0, initialDraft, draft: cloneDraft(initialDraft) }
}

/** Replaces the authored draft after optimistic-revision validation. */
export function updateWorldDraftRecord(record: WorldDraftRecord, draft: WorldCreationDraft, expectedRevision?: number): WorldDraftRecord {
  const current = validateWorldDraftRecord(record)
  if (expectedRevision !== undefined && expectedRevision !== current.revision) {
    throw new Error(`World draft revision conflict: expected ${expectedRevision}, current ${current.revision}`)
  }
  validateWorldCreationDraftLimits(draft)
  return { ...current, revision: current.revision + 1, draft: cloneDraft(draft) }
}

/** Restores the original authored input while advancing the draft revision. */
export function resetWorldDraftRecord(record: WorldDraftRecord, expectedRevision?: number): WorldDraftRecord {
  const current = validateWorldDraftRecord(record)
  if (expectedRevision !== undefined && expectedRevision !== current.revision) {
    throw new Error(`World draft revision conflict: expected ${expectedRevision}, current ${current.revision}`)
  }
  return { ...current, revision: current.revision + 1, draft: cloneDraft(current.initialDraft) }
}

/**
 * Atomically replaces one independent population zone's cells. The complete
 * generated-terrain normalization happens before the returned record is made
 * available, so bad cells, duplicates, overlap, and allocation errors leave
 * the active draft unchanged at the worker boundary.
 */
export function updateWorldDraftZoneCells(record: WorldDraftRecord, zoneId: string, cellIds: readonly string[], expectedRevision?: number): WorldDraftRecord {
  const current = validateWorldDraftRecord(record)
  if (expectedRevision !== undefined && expectedRevision !== current.revision) {
    throw new Error(`World draft revision conflict: expected ${expectedRevision}, current ${current.revision}`)
  }
  if (!Array.isArray(cellIds)) throw new Error('Population zone cells are invalid')
  const zone = current.draft.populationZones.find((candidate) => candidate.id === zoneId)
  if (!zone) throw new Error(`Population zone is unknown: ${zoneId}`)
  if (zone.settlementId !== undefined) throw new Error(`Population zone ${zoneId} is settlement-linked and its cells cannot be edited without moving its anchor`)
  const canonicalCellIds = [...cellIds].sort(compareText)
  const patchedDraft: WorldCreationDraft = {
    ...cloneDraft(current.draft),
    populationZones: current.draft.populationZones.map((candidate) => candidate.id === zoneId
      ? { id: candidate.id, name: candidate.name, populationCount: candidate.populationCount, cellIds: canonicalCellIds }
      : { ...candidate, cellIds: candidate.cellIds ? [...candidate.cellIds] : undefined }),
  }
  validateWorldCreationDraftLimits(patchedDraft)
  const generated = generateValley(patchedDraft.seed.trim() || 'valley-001', patchedDraft.width, patchedDraft.height, { terrainOverrides: patchedDraft.terrainOverrides })
  const normalized = normalizeWorldCreationRequest(patchedDraft, generated.world.grid.cells)
  const normalizedZone = normalized.populationZones.find((candidate) => candidate.id === zoneId)
  if (!normalizedZone) throw new Error(`Population zone is unknown: ${zoneId}`)
  return {
    ...current,
    revision: current.revision + 1,
    draft: {
      ...patchedDraft,
      populationZones: patchedDraft.populationZones.map((candidate) => candidate.id === zoneId
        ? { id: candidate.id, name: candidate.name, populationCount: candidate.populationCount, cellIds: [...normalizedZone.cellIds] }
        : candidate),
    },
  }
}

/** Atomically paints one bounded batch of cells with a selected terrain type. */
export function paintWorldDraftTerrain(record: WorldDraftRecord, cellIds: readonly string[], terrain: Terrain, expectedRevision?: number): WorldDraftRecord {
  const current = validateWorldDraftRecord(record)
  if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new Error(`World draft revision conflict: expected ${expectedRevision}, current ${current.revision}`)
  if (!Array.isArray(cellIds) || cellIds.length === 0 || cellIds.length > MAX_TERRAIN_PAINT_CELLS) throw new Error(`Terrain paint must contain from 1 through ${MAX_TERRAIN_PAINT_CELLS} cells`)
  if (terrain !== 'water' && terrain !== 'plain' && terrain !== 'hill') throw new Error('Terrain paint type is invalid')
  const base = generateValley(current.draft.seed.trim() || 'valley-001', current.draft.width, current.draft.height)
  const baseTerrainByCellId = new Map(base.world.grid.cells.map((cell) => [cell.id, cell.terrain]))
  const next = new Map((current.draft.terrainOverrides ?? []).map((override) => [override.cellId, override.terrain]))
  for (const cellId of [...cellIds].sort(compareText)) {
    const baseTerrain = baseTerrainByCellId.get(cellId)
    if (!baseTerrain) throw new Error(`Terrain paint contains an unknown cell: ${cellId}`)
    if (terrain === baseTerrain) next.delete(cellId)
    else next.set(cellId, terrain)
  }
  const terrainOverrides: TerrainTypeOverride[] = [...next.entries()].map(([cellId, paintedTerrain]) => ({ cellId, terrain: paintedTerrain })).sort((first, second) => compareText(first.cellId, second.cellId))
  const draft = cloneDraft({ ...current.draft, terrainOverrides })
  validateWorldCreationDraftLimits(draft)
  // Preview validates terrain-driven placement effects before exposing a revision.
  previewWorldDraft({ ...current, revision: current.revision + 1, draft })
  return { ...current, revision: current.revision + 1, draft }
}

/** Builds a deterministic bounded terrain-only projection for draft editing. */
export function projectWorldDraftViewport(record: WorldDraftRecord, request: DraftViewportRequest): DraftViewportProjection {
  const current = validateWorldDraftRecord(record)
  const bounds = request?.bounds
  if (!Number.isSafeInteger(request?.revision) || request.revision < 0) throw new Error('Draft viewport revision is invalid')
  if (!bounds || !Number.isSafeInteger(bounds.minQ) || !Number.isSafeInteger(bounds.maxQ) || !Number.isSafeInteger(bounds.minR) || !Number.isSafeInteger(bounds.maxR) || bounds.minQ > bounds.maxQ || bounds.minR > bounds.maxR) throw new Error('Draft viewport bounds are invalid')
  const requestedCellCount = (bounds.maxQ - bounds.minQ + 1) * (bounds.maxR - bounds.minR + 1)
  if (!Number.isSafeInteger(requestedCellCount) || requestedCellCount > 4096) throw new RangeError('Draft viewport may contain at most 4096 cells')
  const generated = generateValley(current.draft.seed.trim() || 'valley-001', current.draft.width, current.draft.height, { terrainOverrides: current.draft.terrainOverrides })
  const normalized = normalizeWorldCreationRequest(current.draft, generated.world.grid.cells)
  const zone = request.selectedZoneId === undefined ? undefined : normalized.populationZones.find((candidate) => candidate.id === request.selectedZoneId)
  if (request.selectedZoneId !== undefined && !zone) throw new Error(`Population zone is unknown: ${request.selectedZoneId}`)
  const selectedCellIds = new Set(zone?.cellIds ?? [])
  const cells = generated.world.grid.cells
    .filter((cell) => cell.q >= bounds.minQ && cell.q <= bounds.maxQ && cell.r >= bounds.minR && cell.r <= bounds.maxR)
    .sort((first, second) => compareText(first.id, second.id))
    .map((cell) => ({ ...cell, selected: selectedCellIds.has(cell.id) }))
  return { version: 1, draftId: current.draftId, draftRevision: current.revision, revision: request.revision, ...(request.selectedZoneId === undefined ? {} : { selectedZoneId: request.selectedZoneId }), cells }
}

/** Validates untrusted persisted data and returns a detached normalized copy. */
export function validateWorldDraftRecord(value: unknown): WorldDraftRecord {
  if (!value || typeof value !== 'object') throw new Error('World draft record is invalid')
  const record = value as Partial<WorldDraftRecord>
  if (record.version !== WORLD_DRAFT_RECORD_VERSION) throw new Error(`Unsupported world draft record version: ${String(record.version)}`)
  validateDraftId(record.draftId)
  const revision = record.revision
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) throw new Error('World draft revision is invalid')
  validateWorldCreationDraftLimits(record.draft as WorldCreationDraft)
  validateWorldCreationDraftLimits(record.initialDraft as WorldCreationDraft)
  return {
    version: WORLD_DRAFT_RECORD_VERSION,
    draftId: record.draftId,
    revision,
    initialDraft: cloneDraft(record.initialDraft as WorldCreationDraft),
    draft: cloneDraft(record.draft as WorldCreationDraft),
  }
}

/**
 * Generates only a bounded authoring preview. It shares creation normalization
 * with SimulationEngine.create but never instantiates or mutates a live engine.
 */
export function previewWorldDraft(record: WorldDraftRecord): WorldDraftPreview {
  const current = validateWorldDraftRecord(record)
  const generated = generateValley(current.draft.seed.trim() || 'valley-001', current.draft.width, current.draft.height, { terrainOverrides: current.draft.terrainOverrides })
  const creation = normalizeWorldCreationRequest(current.draft, generated.world.grid.cells)
  const terrainCounts: Record<Terrain, number> = { water: 0, plain: 0, hill: 0 }
  let passableCellCount = 0
  for (const cell of generated.world.grid.cells) {
    terrainCounts[cell.terrain] += 1
    if (cell.movementCost > 0) passableCellCount += 1
  }
  return {
    version: 1,
    draftId: current.draftId,
    revision: current.revision,
    creation,
    worldId: generated.world.id,
    cellCount: generated.world.grid.cells.length,
    passableCellCount,
    terrainCounts,
  }
}

function validateDraftId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error('World draft ID is invalid')
}

function cloneDraft(value: WorldCreationDraft): WorldCreationDraft {
  return {
    ...value,
    populationZones: value.populationZones.map((zone) => ({ ...zone, cellIds: zone.cellIds ? [...zone.cellIds] : undefined })),
    settlements: value.settlements.map((settlement) => ({ ...settlement })),
    terrainOverrides: value.terrainOverrides?.map((override) => ({ ...override })),
  }
}

function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0
}
