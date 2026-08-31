import { describe, expect, it, vi } from 'vitest'
import { PersistenceOperationQueue } from './usePersistenceController'

describe('persistence controller', () => {
  it('preserves write ordering and recovers after a persistence failure', async () => {
    const order: string[] = []
    const controller = new PersistenceOperationQueue()
    const first = controller.persistDraft(async () => { order.push('first'); throw new Error('storage failed') })
    const second = controller.persistDraft(async () => { order.push('second') })
    await expect(first).rejects.toThrow('storage failed')
    await second
    expect(order).toEqual(['first', 'second'])
  })

  it('rejects new work after unmount disposal', async () => {
    const controller = new PersistenceOperationQueue()
    const request = vi.fn(async () => 'snapshot')
    controller.dispose()
    await expect(controller.requestSnapshot(request)).rejects.toThrow('disposed')
    expect(request).not.toHaveBeenCalled()
  })
})
