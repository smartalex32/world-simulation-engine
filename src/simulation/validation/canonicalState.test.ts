import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import { createContentPackRuntime } from '../../contentPacks/runtime'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'
import { CanonicalSimulationValidationError, validateCanonicalSimulationState } from './canonicalState'

describe('canonical simulation state validation', () => {
  it('reports deterministic structured details for a cross-reference failure', async () => {
    const state = structuredClone((await SimulationEngine.create('canonical-validator-error').snapshot()).state)
    state.randomStreams = []

    try {
      validateCanonicalSimulationState(state, createContentPackRuntime(DEFAULT_PREINDUSTRIAL_PACK))
      throw new Error('Expected canonical validation to reject the corrupted random streams')
    } catch (error) {
      expect(error).toBeInstanceOf(CanonicalSimulationValidationError)
      expect((error as CanonicalSimulationValidationError).detail).toMatchObject({ subsystem: 'randomStreams', path: 'state.randomStreams', code: 'missing-required-stream' })
    }
  })
})
