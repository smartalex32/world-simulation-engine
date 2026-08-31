import type { SimulationState } from '../kernel/types'

export interface SnapshotEnvelope {
  schemaVersion: number
  engineVersion: string
  state: SimulationState
  digest: string
  /** Retained audit evidence when an authenticated historical envelope was transformed. */
  migrationProvenance?: SnapshotMigrationProvenance
}

/**
 * Envelope metadata only. It never participates in the canonical simulation
 * state digest, but makes a persisted migration independently inspectable.
 */
export interface SnapshotMigrationProvenance {
  sourceSchemaVersion: number
  sourceEngineVersion: string
  sourceDigest: string
  targetSchemaVersion: number
  /** Canonical state digest immediately after the authenticated migration. */
  targetStateDigest: string
  schemaPath: SnapshotMigrationPathStep[]
  /** Authenticates the envelope-level audit evidence while state digest stays simulation-only. */
  targetEnvelopeDigest: string
}

export interface SnapshotMigrationPathStep {
  fromSchemaVersion: number
  toSchemaVersion: number
  kind: 'data-shape' | 'behavior-upgrade'
}
