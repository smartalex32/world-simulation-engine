import type { SimulationEvent, StatisticSample, WorldStatisticMetricId } from '../simulation/domain/types'
import { compareStableText } from '../shared/stableOrder'

/**
 * Historical views are derived only from persisted authoritative events and
 * statistic samples.  They deliberately do not infer unrecorded causes.
 */
export const HISTORY_METRICS = [
  'population.count',
  'population.aliveCount',
  'resources.totalFood',
  'social.encounters',
  'social.relationshipCount',
] as const satisfies readonly WorldStatisticMetricId[]

export interface HistoricalHighlight {
  event: SimulationEvent
  reason: 'life-cycle' | 'relationship' | 'knowledge' | 'community-change' | 'organization-change' | 'error'
}

const HIGHLIGHT_REASONS: Partial<Record<SimulationEvent['type'], HistoricalHighlight['reason']>> = {
  PERSON_BORN: 'life-cycle',
  PERSON_DIED: 'life-cycle',
  PARTNERSHIP_FORMED: 'relationship',
  PERSON_KNOWLEDGE_DISCOVERED: 'knowledge',
  COMMUNITY_MEASURES_UPDATED: 'community-change',
  ORGANIZATION_LEADERSHIP_CHANGED: 'organization-change',
  ORGANIZATION_DECISION_RESOLVED: 'organization-change',
  ERROR: 'error',
}

/** Returns exact recorded participation, including comma-separated parent IDs. */
export function eventInvolvesPerson(event: SimulationEvent, personId: string): boolean {
  for (const [key, value] of Object.entries(event.payload)) {
    if (typeof value !== 'string') continue
    if (key.endsWith('PersonId') || key === 'personId' || key === 'otherPersonId') {
      if (value === personId) return true
    }
    if (key === 'parentIds' && value.split(',').some((id) => id.trim() === personId)) return true
  }
  return false
}

/** Newest first, with a stable ID tie-breaker for events sharing a tick. */
export function personTimeline(events: readonly SimulationEvent[], personId: string, limit = 100): SimulationEvent[] {
  return events
    .filter((event) => eventInvolvesPerson(event, personId))
    .sort((first, second) => second.tick - first.tick || compareStableText(second.id, first.id))
    .slice(0, limit)
}

/** Curated labels identify significant recorded events; no synthetic events are created. */
export function historicalHighlights(events: readonly SimulationEvent[], limit = 24): HistoricalHighlight[] {
  return events
    .flatMap((event) => {
      const reason = HIGHLIGHT_REASONS[event.type]
      return reason ? [{ event, reason }] : []
    })
    .sort((first, second) => second.event.tick - first.event.tick || compareStableText(second.event.id, first.event.id))
    .slice(0, limit)
}

/** Chronological, world-scoped samples appropriate for a small trend display. */
export function metricTimeline(samples: readonly StatisticSample[], metricId: WorldStatisticMetricId): StatisticSample[] {
  return samples
    .filter((sample): sample is Extract<StatisticSample, { scope: 'world' }> => sample.scope === 'world' && sample.metricId === metricId)
    .sort((first, second) => first.tick - second.tick || compareStableText(first.metricId, second.metricId))
}

export function metricDelta(samples: readonly StatisticSample[], metricId: WorldStatisticMetricId): number | undefined {
  const timeline = metricTimeline(samples, metricId)
  if (timeline.length < 2) return undefined
  return timeline.at(-1)!.value - timeline[0]!.value
}
