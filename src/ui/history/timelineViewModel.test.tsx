import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SimulationEvent, StatisticSample } from '../../simulation/domain/types'
import { HistoryPanel } from '../HistoryPanel'
import { buildEvidenceTimeline, eventEntityRefs } from './timelineViewModel'

const event = (id: string, tick: number, type: SimulationEvent['type'], payload: Record<string, string | number | boolean | null>): SimulationEvent => ({ id, runId: 'run-1', tick, sequence: tick, type, version: 1, payload } as SimulationEvent)

describe('evidence timeline view model', () => {
  it('uses stable canonical order and separates world, context, and selected-entity lanes', () => {
    const events = [
      event('community', 4, 'COMMUNITY_MEASURES_UPDATED', { communityId: 'community-1', communityName: 'North', windowStartTick: 0, windowEndTick: 4, exposedPersonHours: 1, encounters: 0, foodSecurityPermille: 500, foodSecurityDeltaPermille: 0 }),
      event('world', 2, 'RUN_STARTED', {}),
      event('person', 3, 'PERSON_AGED', { personId: 'person-1', ageYears: 20 }),
    ]
    const view = buildEvidenceTimeline({ events, statistics: [], metricIds: [], fromTick: 0, toTick: 10, selectedEntityId: 'person-1' })
    expect(view.lanes.find(([id]) => id === 'world')?.[1].map((entry) => entry.event.id)).toEqual(['world'])
    expect(view.lanes.find(([id]) => id === 'community')?.[1].map((entry) => entry.event.id)).toEqual(['community'])
    expect(view.lanes.find(([id]) => id === 'entity')?.[1].map((entry) => entry.event.id)).toEqual(['person'])
  })

  it('preserves metric gaps and reports bounded event truncation', () => {
    const statistics = [{ runId: 'run-1', tick: 0, metricVersion: 1, scope: 'world', metricId: 'population.count', value: 2 }, { runId: 'run-1', tick: 24, metricVersion: 1, scope: 'world', metricId: 'population.count', value: 3 }] as StatisticSample[]
    const view = buildEvidenceTimeline({ events: [event('a', 1, 'RUN_STARTED', {}), event('b', 2, 'RUN_PAUSED', {})], statistics, metricIds: ['population.count'], fromTick: 0, toTick: 24, eventLimit: 1 })
    expect(view.truncated).toBe(true)
    expect(view.series[0]?.values).toHaveLength(2)
    expect(view.series[0]?.provenance.cadenceTicks).toBe(24)
  })

  it('extracts exact typed entity links without treating arbitrary strings as entities', () => {
    expect(eventEntityRefs(event('e', 1, 'HOUSEHOLD_RELOCATED', { householdId: 'h', sourceCellId: '0,0', destinationCellId: '1,0', foodAccessDeltaPermille: 0, travelCost: 1, householdTiePermille: 0, crowdingDelta: 0, destinationSettlementId: 'settlement-2', sourceSettlementId: 'settlement-1', servicesPermille: 0, infrastructurePermille: 0, riskCostPermille: 0, utilityPermille: 0, probabilityPermille: 1000, randomRollPermille: 0 }))).toEqual([
      { kind: 'cell', id: '0,0' }, { kind: 'cell', id: '1,0' }, { kind: 'settlement', id: 'settlement-1' }, { kind: 'settlement', id: 'settlement-2' },
    ])
  })

  it('renders range controls, accessible lanes, exact payload, and future boundaries', () => {
    const selected = event('person', 3, 'PERSON_AGED', { personId: 'person-1', ageYears: 20 })
    const markup = renderToStaticMarkup(<HistoryPanel events={[selected]} statistics={[]} checkpoints={[]} selectedEntityId="person-1" selectedEventId="person" currentTick={10} onTimeRange={() => undefined} onInspectPerson={() => undefined} onInspectEntity={() => undefined} onInspectEvent={() => undefined} onRefresh={() => undefined} loading={false} />)
    expect(markup).toContain('Multi-lane recorded evidence')
    expect(markup).toContain('aria-label="Timeline range controls"')
    expect(markup).toContain('Exact recorded payload')
    expect(markup).toContain('require authoritative historical-analysis contracts from #103')
  })
})
