import { describe, expect, it } from 'vitest'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'
import { CheckpointTelemetryBuffer, SimulationBatchScheduler, TELEMETRY_EVENT_FLUSH_THRESHOLD, TELEMETRY_STATISTIC_FLUSH_THRESHOLD, TelemetryBuffer, validateWorkerContinuation } from './frameScheduler'

describe('worker frame scheduling', () => {
  it('splits a logical batch into 24-tick quanta and emits one logical clock duration', () => {
    const scheduler = new SimulationBatchScheduler()
    expect(scheduler.next(72)).toEqual({ ticks: 24, clockEventHours: false })
    expect(scheduler.next(72)).toEqual({ ticks: 24, clockEventHours: false })
    expect(scheduler.next(72)).toEqual({ ticks: 24, clockEventHours: 72 })
    expect(scheduler.state()).toEqual({ remaining: 0, advanced: 0 })
  })

  it('finalizes a paused partial batch so step then play cannot resume stale work', () => {
    const scheduler = new SimulationBatchScheduler()
    scheduler.next(720)
    expect(scheduler.finalizePartial()).toBe(24)
    expect(scheduler.state()).toEqual({ remaining: 0, advanced: 0 })
    expect(scheduler.next(24)).toEqual({ ticks: 24, clockEventHours: 24 })
  })

  it('keeps a speed change pending until the current logical batch completes', () => {
    const scheduler = new SimulationBatchScheduler()
    scheduler.next(72)
    expect(scheduler.next(1)).toEqual({ ticks: 24, clockEventHours: false })
    expect(scheduler.next(1)).toEqual({ ticks: 24, clockEventHours: 72 })
    expect(scheduler.next(1)).toEqual({ ticks: 1, clockEventHours: 1 })
  })

  it('exposes scheduler state observationally without changing a partial batch', () => {
    const scheduler = new SimulationBatchScheduler()
    scheduler.next(720)
    const before = scheduler.state()
    expect(scheduler.state()).toEqual(before)
    expect(scheduler.next(720)).toEqual({ ticks: 24, clockEventHours: false })
    expect(scheduler.state()).toEqual({ remaining: 672, advanced: 48 })
  })

  it('restores a partial logical batch without changing its completion boundary', () => {
    const original = new SimulationBatchScheduler()
    original.next(720)
    const restored = new SimulationBatchScheduler()
    restored.restore(original.state())
    for (let index = 0; index < 28; index += 1) expect(restored.next(24).clockEventHours).toBe(false)
    expect(restored.next(24)).toEqual({ ticks: 24, clockEventHours: 720 })
    expect(restored.state()).toEqual({ remaining: 0, advanced: 0 })
  })

  it('validates versioned worker continuations without adding them to canonical state', () => {
    expect(validateWorkerContinuation({ version: 1, ticksPerBatch: 720, batch: { remaining: 696, advanced: 24 } })).toEqual({
      version: 1,
      ticksPerBatch: 720,
      batch: { remaining: 696, advanced: 24 },
    })
    expect(() => validateWorkerContinuation({ version: 1, ticksPerBatch: 720, batch: { remaining: 0, advanced: 24 } })).toThrow(/idle or partially advanced/)
    expect(() => validateWorkerContinuation({ version: 2, ticksPerBatch: 720, batch: { remaining: 696, advanced: 24 } })).toThrow(/Unsupported worker continuation/)
  })

  it('flushes at deterministic thresholds without dropping telemetry', () => {
    const buffer = new TelemetryBuffer()
    const events = Array.from({ length: TELEMETRY_EVENT_FLUSH_THRESHOLD }, (_, index) => event(index))
    buffer.append(events.slice(0, 500), [])
    expect(buffer.shouldFlush()).toBe(false)
    buffer.append(events.slice(500), [])
    expect(buffer.shouldFlush()).toBe(true)
    expect(buffer.drain().events).toEqual(events)
    expect(buffer.counts()).toEqual({ events: 0, statistics: 0 })

    const statistics = Array.from({ length: TELEMETRY_STATISTIC_FLUSH_THRESHOLD }, (_, index) => statistic(index))
    buffer.append([], statistics)
    expect(buffer.shouldFlush()).toBe(true)
    expect(buffer.drain().statistics).toEqual(statistics)
  })

  it('replays an uncommitted checkpoint delta and prunes only after its watermark advances', () => {
    const buffer = new CheckpointTelemetryBuffer()
    buffer.append([event(0), event(1)], [statistic(1)])
    expect(buffer.since(-1, -1).events.map(({ sequence }) => sequence)).toEqual([0, 1])
    expect(buffer.since(-1, -1).events.map(({ sequence }) => sequence)).toEqual([0, 1])
    buffer.append([event(2)], [statistic(2)])
    const next = buffer.since(1, 1)
    expect(next.events.map(({ sequence }) => sequence)).toEqual([2])
    expect(next.statistics.map(({ tick }) => tick)).toEqual([2])
  })
})

function event(index: number): SimulationEvent {
  return { id: `event-${index}`, runId: 'run-test', tick: index, sequence: index, type: 'CLOCK_ADVANCED', version: 1, payload: { hours: 1, currentTick: index } }
}

function statistic(index: number): StatisticSample {
  return { runId: 'run-test', tick: index, metricVersion: 1, metricId: 'world.cellCount', scope: 'world', value: index }
}
