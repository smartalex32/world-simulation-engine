import { WORLD_GENERATOR_VERSION } from './types'
import type { WorldDraftRecord } from './types'
import { validateWorldDraftRecord } from './worldDraft'

export const WORLD_DRAFT_BUNDLE_VERSION = 1 as const

export interface WorldDraftBundle {
  format: 'world-simulation-draft'
  bundleVersion: typeof WORLD_DRAFT_BUNDLE_VERSION
  worldGeneratorVersion: typeof WORLD_GENERATOR_VERSION
  draft: WorldDraftRecord
}

/** Returns a detached, portable authoring bundle without timestamps or UI state. */
export function exportWorldDraftBundle(record: WorldDraftRecord): WorldDraftBundle {
  return {
    format: 'world-simulation-draft',
    bundleVersion: WORLD_DRAFT_BUNDLE_VERSION,
    worldGeneratorVersion: WORLD_GENERATOR_VERSION,
    draft: validateWorldDraftRecord(record),
  }
}

/** Rejects unsupported formats instead of silently reinterpreting authored geometry. */
export function importWorldDraftBundle(value: unknown): WorldDraftRecord {
  if (!value || typeof value !== 'object') throw new Error('Draft import is invalid')
  const bundle = value as Partial<WorldDraftBundle>
  if (bundle.format !== 'world-simulation-draft') throw new Error('Draft import format is unsupported')
  if (bundle.bundleVersion !== WORLD_DRAFT_BUNDLE_VERSION) throw new Error(`Unsupported draft bundle version: ${String(bundle.bundleVersion)}`)
  if (bundle.worldGeneratorVersion !== WORLD_GENERATOR_VERSION) throw new Error(`Unsupported world generator version: ${String(bundle.worldGeneratorVersion)}`)
  return validateWorldDraftRecord(bundle.draft)
}
