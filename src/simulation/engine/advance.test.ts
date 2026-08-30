import { describe, expect, it } from 'vitest'
import { SimulationEngine, TICK_PHASE_MANIFEST } from './engine'

describe('projection-free engine advance', () => {
  it('declares the immutable canonical phase order, cadence, and RNG ownership', () => {
    expect(TICK_PHASE_MANIFEST.map((phase) => [phase.id, phase.cadence])).toEqual([
      ['clock-and-lifecycle', 'hourly'],
      ['needs', 'hourly'],
      ['journeys', 'hourly'],
      ['activities-and-school', 'hourly'],
      ['decisions-and-actions', 'hourly'],
      ['encounters-and-markets', 'hourly'],
      ['exposure-environment-and-health', 'hourly'],
      ['monthly-processing', 'monthly'],
      ['annual-processing', 'annual'],
      ['daily-processing-and-statistics', 'daily'],
    ])
    expect(TICK_PHASE_MANIFEST.find((phase) => phase.id === 'decisions-and-actions')?.rngStreams).toContain('actions')
    expect(TICK_PHASE_MANIFEST.find((phase) => phase.id === 'encounters-and-markets')?.rngStreams).toContain('encounters')
  })

  it('matches step state, telemetry, and digest at the same tick', async () => {
    const stepped = SimulationEngine.create('advance-equivalence')
    const advanced = SimulationEngine.create('advance-equivalence')
    const stepResult = stepped.step(48)
    const advanceResult = advanced.advance(48)
    expect(advanceResult.changeSet.categories).toEqual(expect.arrayContaining(['people', 'locations', 'relationships', 'communities']))
    expect(advanceResult.events).toEqual(stepResult.events)
    expect(advanceResult.statistics).toEqual(stepResult.statistics)
    expect(await advanced.snapshot()).toEqual(await stepped.snapshot())
  })

  it('preserves state-at-tick when one logical batch is split into worker-sized quanta', async () => {
    const whole = SimulationEngine.create('advance-quantum')
    const split = SimulationEngine.create('advance-quantum')
    whole.advance(72)
    for (let remaining = 72; remaining > 0; remaining -= 24) split.advance(Math.min(24, remaining), { clockEventHours: remaining <= 24 ? 72 : false })
    const wholeSnapshot = await whole.snapshot()
    const splitSnapshot = await split.snapshot()
    expect(splitSnapshot.digest).toBe(wholeSnapshot.digest)
    expect(splitSnapshot.state).toEqual(wholeSnapshot.state)
  })

  it('does not change digest or event sequence when a partial-batch snapshot is observed', async () => {
    const engine = SimulationEngine.create('advance-observation')
    engine.advance(24, { clockEventHours: false })
    const first = await engine.snapshot()
    const second = await engine.snapshot()
    expect(second.digest).toBe(first.digest)
    expect(second.state.nextEventSequence).toBe(first.state.nextEventSequence)
    expect(second.state).toEqual(first.state)
  })

  it('validates deferred clock options before mutating authoritative state', async () => {
    const engine = SimulationEngine.create('advance-invalid-clock')
    const before = await engine.snapshot()
    expect(() => engine.advance(1, { clockEventHours: 0 })).toThrow(/Clock event hours/)
    expect((await engine.snapshot()).digest).toBe(before.digest)
  })
})
