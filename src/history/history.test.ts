import { describe, expect, it } from 'vitest'
import { eventInvolvesPerson, historicalHighlights, metricDelta, metricTimeline, personTimeline } from './history'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'

function event(id: string, tick: number, type: SimulationEvent['type'], payload: SimulationEvent['payload']): SimulationEvent {
  return { id, tick, type, payload, runId: 'run-history', version: 1 }
}

describe('historical evidence views', () => {
  const events = [
    event('event-1', 12, 'PERSON_BORN', { personId: 'child', parentIds: 'parent-a,parent-b' }),
    event('event-2', 18, 'PERSON_ENCOUNTERED', { personId: 'parent-a', otherPersonId: 'neighbor' }),
    event('event-3', 20, 'PERSON_KNOWLEDGE_DISCOVERED', { personId: 'neighbor' }),
  ]

  it('uses only explicit event participation for person timelines', () => {
    expect(eventInvolvesPerson(events[0]!, 'parent-b')).toBe(true)
    expect(eventInvolvesPerson(events[1]!, 'child')).toBe(false)
    expect(personTimeline(events, 'parent-a').map(({ id }) => id)).toEqual(['event-2', 'event-1'])
  })

  it('labels only curated authoritative events as highlights', () => {
    expect(historicalHighlights(events).map(({ event: item, reason }) => [item.id, reason])).toEqual([
      ['event-3', 'knowledge'],
      ['event-1', 'life-cycle'],
    ])
  })

  it('keeps world metric trends chronological and scope-safe', () => {
    const samples: StatisticSample[] = [
      { runId: 'run-history', tick: 48, metricVersion: 1, metricId: 'population.count', scope: 'world', value: 12 },
      { runId: 'run-history', tick: 24, metricVersion: 1, metricId: 'population.count', scope: 'world', value: 10 },
      { runId: 'run-history', tick: 48, metricVersion: 1, metricId: 'community.emergent.socialTrust', scope: 'community', scopeId: 'community-west', value: 600 },
    ]
    expect(metricTimeline(samples, 'population.count').map(({ tick }) => tick)).toEqual([24, 48])
    expect(metricDelta(samples, 'population.count')).toBe(2)
  })
})
