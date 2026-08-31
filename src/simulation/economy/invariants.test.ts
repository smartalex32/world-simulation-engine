import { beforeAll, describe, expect, it } from 'vitest'
import type { SimulationState } from '../domain/types'
import { SimulationEngine } from '../engine/engine'
import { validateEconomyState } from './invariants'

describe('economy canonical validation', () => {
  let canonical: SimulationState

  beforeAll(async () => {
    canonical = structuredClone((await SimulationEngine.create('economy-validator').snapshot()).state)
  })

  it('accepts canonical economy state', () => {
    expect(() => validateEconomyState(canonical)).not.toThrow()
  })

  it('rejects ledgers that do not match the canonical market collection', () => {
    const state = structuredClone(canonical)
    state.economy.markets = []
    expect(() => validateEconomyState(state)).toThrow('economy markets do not match canonical markets')
  })
})
