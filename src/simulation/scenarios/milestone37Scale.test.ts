import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'

describe('Milestone 37 authoritative scale baseline', () => {
  it('preserves canonical output across a larger detailed world with static road indexing', async () => {
    const first = SimulationEngine.create('scale-road-index', 64, 48)
    const second = SimulationEngine.create('scale-road-index', 64, 48)
    first.step(120); second.step(120)
    expect((await first.snapshot()).digest).toBe((await second.snapshot()).digest)
  }, 30_000)
})
