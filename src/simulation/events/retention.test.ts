import { describe, expect, it } from 'vitest'
import type { SimulationEvent, SimulationEventType } from '../domain/types'
import { EVENT_CATALOG } from './catalog'
import { EventSink, completeRetention, mergeRetention } from './retention'

describe('typed event retention', () => {
  it('catalogs every event with a version, codec, and explicit retention class', () => {
    const entries = Object.entries(EVENT_CATALOG)
    expect(entries.length).toBeGreaterThan(40)
    for (const [, definition] of entries) {
      expect(definition.version).toBe(1)
      expect(definition.payloadSchema).toBeDefined()
      expect(['durable', 'bounded', 'sampled']).toContain(definition.retention)
      expect(definition.decode).toBeTypeOf('function')
      if (definition.retention !== 'durable') {
        expect(definition.sampleEveryHours).toBeGreaterThan(0)
        expect(definition.initialSampleHours).toBeGreaterThan(0)
      }
    }
  })

  it('never lets sampled routine volume evict durable lifecycle evidence', () => {
    const sink = new EventSink()
    for (let sequence = 0; sequence < 600; sequence += 1) sink.emit(event(sequence, 'PERSON_RESTED'))
    sink.emit(event(600, 'PERSON_DIED'))
    const batch = sink.batch()
    expect(batch.events.filter(({ type }) => type === 'PERSON_RESTED')).toHaveLength(EVENT_CATALOG.PERSON_RESTED.batchLimit!)
    expect(batch.events).toContainEqual(expect.objectContaining({ type: 'PERSON_DIED', sequence: 600 }))
    expect(batch.retention).toMatchObject({ firstProducedSequence: 0, lastProducedSequence: 600, droppedByType: { PERSON_RESTED: 580 } })
    expect(batch.retention.droppedSequenceRanges).toEqual([{ first: 20, last: 599 }])
  })

  it('merges deterministic watermarks and dropped counts across worker quanta', () => {
    const first = completeRetention([event(0, 'RUN_CREATED')])
    const sink = new EventSink()
    for (let sequence = 1; sequence <= 30; sequence += 1) sink.emit(event(sequence, 'PERSON_RESTED'))
    const merged = mergeRetention([first, sink.batch().retention])
    expect(merged).toMatchObject({ firstProducedSequence: 0, lastProducedSequence: 30, firstRetainedSequence: 0, lastRetainedSequence: 20, droppedByType: { PERSON_RESTED: 10 } })
  })

  it('samples routine evidence by absolute simulation time rather than call boundaries', () => {
    const whole = new EventSink()
    const first = new EventSink()
    const second = new EventSink()
    for (let tick = 1; tick <= 336; tick += 1) {
      const value = { ...event(tick, 'PERSON_RESTED'), tick }
      whole.emit(value)
      if (tick <= 168) first.emit(value)
      else second.emit(value)
    }
    const wholeBatch = whole.batch()
    const firstBatch = first.batch()
    const secondBatch = second.batch()
    expect([...firstBatch.events, ...secondBatch.events]).toEqual(wholeBatch.events)
    expect(mergeRetention([firstBatch.retention, secondBatch.retention])).toEqual(wholeBatch.retention)
    expect(wholeBatch.events.map(({ tick }) => tick)).toEqual([1, 168, 336])
  })
})

function event(sequence: number, type: SimulationEventType): SimulationEvent {
  const payload = type === 'PERSON_DIED'
    ? { personId: 'person-1', ageYears: 80, mortalityPermille: 10, baseMortalityPermille: 5, healthMortalityRiskPermille: 2, diseaseMortalityPermille: 3 }
    : type === 'RUN_CREATED' ? { seed: 'seed', width: 1, height: 1, population: 1, worldName: 'World' }
      : { personId: 'person-1', fromCellId: '0,0', targetCellId: null, actionWeight: 1, probabilityPermille: 1000, travelCost: 0 }
  return { id: `run:0:${sequence}`, runId: 'run', tick: 0, sequence, type, version: 1, payload } as SimulationEvent
}
