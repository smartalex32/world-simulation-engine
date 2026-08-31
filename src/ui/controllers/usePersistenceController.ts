import { useEffect, useMemo } from 'react'

/** Owns serialization of observational snapshots and accepted draft writes. */
export class PersistenceOperationQueue {
  private snapshotTail: Promise<void> = Promise.resolve()
  private draftTail: Promise<void> = Promise.resolve()
  private disposed = false

  requestSnapshot<T>(request: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Persistence controller is disposed'))
    const result = this.snapshotTail.then(request)
    this.snapshotTail = result.then(() => undefined, () => undefined)
    return result
  }

  persistDraft(write: () => Promise<unknown>): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Persistence controller is disposed'))
    const result = this.draftTail.then(write)
    this.draftTail = result.then(() => undefined, () => undefined)
    return result.then(() => undefined)
  }

  dispose(): void { this.disposed = true }
}

export function usePersistenceController(): PersistenceOperationQueue {
  const controller = useMemo(() => new PersistenceOperationQueue(), [])
  useEffect(() => () => controller.dispose(), [controller])
  return controller
}
