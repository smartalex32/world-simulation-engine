import { describe, expect, it, vi } from 'vitest'
import { createSessionDisposer, initialSimulationSessionState, simulationSessionReducer } from './useSimulationSession'

describe('simulation session controller', () => {
  it('correlates controller failures into paused presentation state', () => {
    const state = simulationSessionReducer({ ...initialSimulationSessionState, status: 'playing' }, { type: 'response', response: { type: 'ERROR', requestId: 'step-1', message: 'step failed' } })
    expect(state).toMatchObject({ status: 'paused', error: 'step failed' })
  })

  it('disposes the injected worker and subscription exactly once', () => {
    const unsubscribe = vi.fn()
    const dispose = vi.fn()
    const cleanup = createSessionDisposer({ dispose }, unsubscribe)
    cleanup(); cleanup()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
