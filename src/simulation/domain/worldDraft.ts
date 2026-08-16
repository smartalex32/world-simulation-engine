import { generateValley } from '../spatial/worldGenerator'
import type { Terrain, WorldCreationDraft, WorldDraftPreview, WorldDraftRecord } from './types'
import { normalizeWorldCreationRequest, validateWorldCreationDraftLimits } from './worldCreation'

export const WORLD_DRAFT_RECORD_VERSION = 2 as const

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
  const generated = generateValley(current.draft.seed.trim() || 'valley-001', current.draft.width, current.draft.height)
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
  }
}
