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

export function eventEntityRefs(event: SimulationEvent): readonly { kind: 'person' | 'organization' | 'settlement' | 'community' | 'cell'; id: string }[] {
  const refs: { kind: 'person' | 'organization' | 'settlement' | 'community' | 'cell'; id: string }[] = []
  if (event.cellId) refs.push({ kind: 'cell', id: event.cellId })
  for (const [key, value] of Object.entries(event.payload)) {
    if (typeof value !== 'string' || value.length === 0) continue
    if (key.endsWith('PersonId') || ['personId', 'otherPersonId'].includes(key)) refs.push({ kind: 'person', id: value })
    else if (['parentIds', 'sourcePersonIds', 'founderPersonIds', 'participantIds'].includes(key)) value.split(',').map((id) => id.trim()).filter(Boolean).forEach((id) => refs.push({ kind: 'person', id }))
    else if (key === 'organizationId' || key === 'councilOrganizationId') refs.push({ kind: 'organization', id: value })
    else if (key.endsWith('SettlementId')) refs.push({ kind: 'settlement', id: value })
    else if (key === 'communityId') refs.push({ kind: 'community', id: value })
    else if (key === 'cellId' || key.endsWith('CellId')) refs.push({ kind: 'cell', id: value })
  }
  return [...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()].sort((a, b) => compareStableText(`${a.kind}:${a.id}`, `${b.kind}:${b.id}`))
}

function metricLabel(metricId: WorldStatisticMetricId): string {
  return metricId.replaceAll('.', ' ').replace(/([A-Z])/g, ' $1')
}

function metricUnit(metricId: WorldStatisticMetricId): 'count' | 'permille' {
  return metricId.endsWith('Permille') || metricId === 'social.networkDensityPermille' ? 'permille' : 'count'
}
