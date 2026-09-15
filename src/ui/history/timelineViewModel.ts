import { eventEntityRefs } from '../../history/entityReferences'
export { eventEntityRefs } from '../../history/entityReferences'
import { EVENT_CATALOG, type EventRetentionClass } from '../../simulation/events/catalog'
import type { SimulationEvent, StatisticSample, WorldStatisticMetricId } from '../../simulation/domain/types'
import { compareStableText } from '../../shared/stableOrder'
import { buildTimeSeriesViewModel, type TimeSeriesViewModel } from '../visualization'

export type EvidenceLaneId = 'world' | 'community' | 'entity'

export interface TimelineEventView {
  event: SimulationEvent
  lane: EvidenceLaneId
  retention: EventRetentionClass
  stack: number
  involved: readonly { kind: 'person' | 'organization' | 'settlement' | 'community' | 'cell'; id: string }[]
}

export interface EvidenceTimelineViewModel {
  lanes: readonly (readonly [EvidenceLaneId, readonly TimelineEventView[]])[]
  series: readonly TimeSeriesViewModel[]
  fromTick: number
  toTick: number
  truncated: boolean
}

export function buildEvidenceTimeline(input: {
  events: readonly SimulationEvent[]
  statistics: readonly StatisticSample[]
  metricIds: readonly WorldStatisticMetricId[]
  fromTick: number
  toTick: number
  selectedEntityId?: string
  eventLimit?: number
}): EvidenceTimelineViewModel {
  const limit = Math.max(1, Math.floor(input.eventLimit ?? 200))
  const ordered = input.events
    .filter((event) => event.tick >= input.fromTick && event.tick <= input.toTick)
    .slice()
    .sort((a, b) => a.tick - b.tick || a.sequence - b.sequence || compareStableText(a.id, b.id))
  const bounded = ordered.slice(Math.max(0, ordered.length - limit))
  const events = bounded.map((event, index) => {
    const involved = eventEntityRefs(event)
    const lane: EvidenceLaneId = input.selectedEntityId && involved.some((entity) => entity.id === input.selectedEntityId)
      ? 'entity'
      : involved.some((entity) => entity.kind === 'community' || entity.kind === 'settlement' || entity.kind === 'organization') ? 'community' : 'world'
    const previousAtTick = bounded.slice(0, index).filter((candidate) => candidate.tick === event.tick && eventLane(candidate, input.selectedEntityId) === lane).length
    return { event, lane, retention: EVENT_CATALOG[event.type].retention, stack: previousAtTick, involved }
  })
  const lanes = (['world', 'community', 'entity'] as const).map((lane) => [lane, events.filter((event) => event.lane === lane)] as const)
  const series = input.metricIds.map((metricId) => buildTimeSeriesViewModel({
    id: metricId,
    label: metricLabel(metricId),
    unit: metricUnit(metricId),
    fromTick: input.fromTick,
    toTick: input.toTick,
    values: input.statistics.filter((sample) => sample.scope === 'world' && sample.metricId === metricId).map((sample) => ({ tick: sample.tick, value: sample.value })),
    provenance: { source: 'persisted statistic samples', cadenceTicks: 24 },
  }))
  return { lanes, series, fromTick: input.fromTick, toTick: input.toTick, truncated: ordered.length > bounded.length }
}

function eventLane(event: SimulationEvent, selectedEntityId?: string): EvidenceLaneId {
  const involved = eventEntityRefs(event)
  if (selectedEntityId && involved.some((entity) => entity.id === selectedEntityId)) return 'entity'
  return involved.some((entity) => entity.kind === 'community' || entity.kind === 'settlement' || entity.kind === 'organization') ? 'community' : 'world'
}

function metricLabel(metricId: WorldStatisticMetricId): string {
  return metricId.replaceAll('.', ' ').replace(/([A-Z])/g, ' $1')
}

function metricUnit(metricId: WorldStatisticMetricId): 'count' | 'permille' {
  return metricId.endsWith('Permille') || metricId === 'social.networkDensityPermille' ? 'permille' : 'count'
}
