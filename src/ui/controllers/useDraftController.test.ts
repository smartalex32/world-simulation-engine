import { describe, expect, it } from 'vitest'
import { DraftOrderingController } from './useDraftController'

describe('draft controller', () => {
  it('rejects stale draft and viewport responses', () => {
    const controller = new DraftOrderingController()
    controller.open()
    expect(controller.acceptDraft(3)).toBe(true)
    expect(controller.acceptDraft(2)).toBe(false)
    controller.requestViewport(8)
    controller.invalidateViewport()
    expect(controller.acceptViewport(8)).toBe(false)
    expect(controller.acceptViewport(9)).toBe(true)
  })

  it('models commit, discard, and disposal transitions', () => {
    const controller = new DraftOrderingController()
    controller.open()
    controller.queue({ type: 'zone', zoneId: 'zone-1', cellIds: ['1,1'] })
    expect(controller.takeNext()).toMatchObject({ type: 'zone', zoneId: 'zone-1' })
    controller.beginCommit()
    expect(controller.state().lifecycle).toBe('committing')
    controller.recoverFromFailure()
    expect(controller.state().lifecycle).toBe('editing')
    controller.beginCommit()
    controller.close(); controller.dispose()
    expect(() => controller.open()).toThrow('disposed')
  })
})
