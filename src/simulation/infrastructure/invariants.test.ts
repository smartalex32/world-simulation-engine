import { beforeAll, describe, expect, it } from 'vitest'
import type { SimulationState } from '../domain/types'
import { SimulationEngine } from '../engine/engine'
import { validateInfrastructureState } from './invariants'

describe('infrastructure canonical validation', () => {
  let canonical: SimulationState

  beforeAll(async () => {
    canonical = structuredClone((await SimulationEngine.create('infrastructure-validator').snapshot()).state)
  })

  it('accepts canonical infrastructure state', () => {
    expect(() => validateInfrastructureState(canonical)).not.toThrow()
  })

  it('rejects infrastructure that references a missing world cell', () => {
    const state = structuredClone(canonical)
    const asset = state.infrastructure[0]
    expect(asset).toBeDefined()
    asset!.cellIds = ['missing-cell']
    expect(() => validateInfrastructureState(state)).toThrow(`Infrastructure asset ${asset!.id} has invalid cells`)
  })
})
