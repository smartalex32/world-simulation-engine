import { useEffect, useMemo } from 'react'
import type { Terrain } from '../../simulation/domain/types'
import type { WorldSetupValues } from '../WorldSetup'

export type DraftLifecycle = 'closed' | 'editing' | 'committing' | 'disposed'
export type PendingDraftOperation =
  | { type: 'update'; setup: WorldSetupValues }
  | { type: 'zone'; zoneId: string; cellIds: string[] }
  | { type: 'terrain'; terrain: Terrain; cellIds: string[] }
  | { type: 'elevation'; elevation: number; cellIds: string[] }
  | { type: 'resources'; resourceCapacity: number; cellIds: string[] }

/** Explicit authoring-order state machine; authoritative draft data remains in the worker. */
export class DraftOrderingController {
  private lifecycle: DraftLifecycle = 'closed'
  private acceptedRevision = -1
  private latestViewportRequestRevision = 0
  private minimumViewportRevision = 0
  private pending = new Map<PendingDraftOperation['type'], PendingDraftOperation>()

  open(): void { this.assertActive(); this.lifecycle = 'editing'; this.acceptedRevision = -1; this.latestViewportRequestRevision = 0; this.minimumViewportRevision = 0; this.pending.clear() }
  beginCommit(): void { this.assertEditing(); this.lifecycle = 'committing' }
  close(): void { this.assertActive(); this.lifecycle = 'closed'; this.pending.clear() }
  dispose(): void { this.lifecycle = 'disposed'; this.pending.clear() }

  queue(operation: PendingDraftOperation): void { this.assertEditing(); this.pending.set(operation.type, operation) }
  takeNext(): PendingDraftOperation | undefined {
    this.assertEditing()
    for (const type of ['update', 'zone', 'terrain', 'elevation', 'resources'] as const) {
      const operation = this.pending.get(type)
      if (operation) { this.pending.delete(type); return operation }
    }
    return undefined
  }

  recoverFromFailure(): void { this.assertActive(); if (this.lifecycle === 'committing') this.lifecycle = 'editing' }

  acceptDraft(revision: number): boolean {
    this.assertActive()
    if (!Number.isSafeInteger(revision) || revision < 0 || revision < this.acceptedRevision) return false
    this.acceptedRevision = revision
    return true
  }

  requestViewport(revision: number): void {
    this.assertEditing()
    this.latestViewportRequestRevision = Math.max(this.latestViewportRequestRevision, revision)
  }

  invalidateViewport(): void {
    this.assertEditing()
    this.minimumViewportRevision = this.latestViewportRequestRevision + 1
  }

  acceptViewport(revision: number): boolean {
    this.assertActive()
    return revision >= this.minimumViewportRevision && revision >= this.latestViewportRequestRevision
  }

  state(): Readonly<{ lifecycle: DraftLifecycle; acceptedRevision: number; latestViewportRequestRevision: number; minimumViewportRevision: number }> {
    return { lifecycle: this.lifecycle, acceptedRevision: this.acceptedRevision, latestViewportRequestRevision: this.latestViewportRequestRevision, minimumViewportRevision: this.minimumViewportRevision }
  }

  private assertEditing(): void { this.assertActive(); if (this.lifecycle !== 'editing') throw new Error(`Draft controller is not editing: ${this.lifecycle}`) }
  private assertActive(): void { if (this.lifecycle === 'disposed') throw new Error('Draft controller is disposed') }
}

export function useDraftController(): DraftOrderingController {
  const controller = useMemo(() => new DraftOrderingController(), [])
  useEffect(() => () => controller.dispose(), [controller])
  return controller
}
