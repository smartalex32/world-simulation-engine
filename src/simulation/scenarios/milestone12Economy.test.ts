import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'

describe('Milestone 12 economy validation', () => {
  it('keeps food ownership explicit while foragers produce and people consume from household stores', async () => {
    const engine = SimulationEngine.create('milestone-12-production')
    const initial = await engine.snapshot()
    expect(initial.state.people.some((person) => person.occupation === 'forager')).toBe(true)
    expect(initial.state.people.every((person) => person.occupation !== undefined)).toBe(true)
    expect(initial.state.households.every((household) => (household.inventory?.food ?? -1) >= 0)).toBe(true)

    const result = engine.step(48)
    const produced = result.statistics.filter((sample) => sample.metricId === 'economy.foodProduced')
    const consumed = result.statistics.filter((sample) => sample.metricId === 'resources.foodConsumed')
    expect(produced.some((sample) => sample.value > 0)).toBe(true)
    expect(consumed.some((sample) => sample.value > 0)).toBe(true)
    // The worker batch intentionally bounds returned events; daily statistics
    // remain the durable proof that production occurred across the full run.

    const restored = await SimulationEngine.restore(await engine.snapshot())
    expect(await restored.snapshot()).toEqual(await engine.snapshot())
  }, 30_000)
})
