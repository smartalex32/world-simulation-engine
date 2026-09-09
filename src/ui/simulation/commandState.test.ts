import { describe, expect, it } from 'vitest'
import { initialWorkbenchCommandState, workbenchCommandReducer } from './commandState'

describe('simulation command presentation state', () => {
  it('prevents duplicate submission and ignores stale acknowledgements', () => {
    const pending = workbenchCommandReducer(initialWorkbenchCommandState, { type: 'submit', command: 'step', correlation: 4 })
    expect(pending.step.status).toBe('pending')
    expect(workbenchCommandReducer(pending, { type: 'submit', command: 'step', correlation: 5 })).toBe(pending)
    expect(workbenchCommandReducer(pending, { type: 'settle', command: 'step', correlation: 3, succeeded: true })).toBe(pending)
    expect(workbenchCommandReducer(pending, { type: 'settle', command: 'step', correlation: 4, succeeded: true }).step.status).toBe('succeeded')
  })

  it('retains correlated failure evidence and resets it when a run is replaced', () => {
    const pending = workbenchCommandReducer(initialWorkbenchCommandState, { type: 'submit', command: 'play', correlation: 1 })
    const failed = workbenchCommandReducer(pending, { type: 'settle', command: 'play', correlation: 1, succeeded: false, error: 'worker stopped' })
    expect(failed.play).toEqual({ status: 'failed', correlation: 1, error: 'worker stopped' })
    expect(workbenchCommandReducer(failed, { type: 'replace-run' })).toBe(initialWorkbenchCommandState)
  })

  it('keeps unsupported cancellation unavailable', () => {
    expect(initialWorkbenchCommandState.cancel.status).toBe('unavailable')
    expect(workbenchCommandReducer(initialWorkbenchCommandState, { type: 'submit', command: 'cancel', correlation: 1 })).toBe(initialWorkbenchCommandState)
  })
})
