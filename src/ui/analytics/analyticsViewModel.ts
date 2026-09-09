import type { WorkbenchProjection } from '../../projection'
import { historicalHighlights } from '../../history/history'
import type { SimulationEvent, StatisticSample } from '../../simulation/domain/types'
import { compareStableText } from '../../shared/stableOrder'
import type { WorkbenchEntityRef, WorkbenchTimeRange } from '../controllers/useWorkbenchNavigation'
import { buildComparisonRow, buildTimeSeriesViewModel, type ComparisonRowViewModel, type MetricCardViewModel, type TimeSeriesViewModel, type VisualizationAvailability } from '../visualization'
import { ANALYTICS_METRICS, type AnalyticsMetricCategory, type AnalyticsMetricDefinition } from './metricRegistry'

export interface AnalyticsCardViewModel extends MetricCardViewModel {
  definition: AnalyticsMetricDefinition
  sampleTick?: number
  delta?: number
  trend?: TimeSeriesViewModel
  trendMeaning: 'desirable' | 'undesirable' | 'neutral' | 'not-comparable'
}

export interface AnalyticsDashboardViewModel {
  cards: readonly AnalyticsCardViewModel[]
  settlementPopulation: readonly { id: string; label: string; value: number }[]
  detailedAgeBands: readonly { id: string; label: string; value: number; color: string }[]
  cohortAgeBands: readonly { id: string; label: string; value: number; color: string }[]
  detailedCompositionAvailability: VisualizationAvailability
  topNeeds: readonly { id: string; label: string; value: number }[]
  recentEvents: readonly SimulationEvent[]
}

export function buildAnalyticsDashboard(input: { projection: WorkbenchProjection; statistics: readonly StatisticSample[]; events: readonly SimulationEvent[]; range?: WorkbenchTimeRange; category: AnalyticsMetricCategory }): AnalyticsDashboardViewModel {
  const { projection } = input
  const range = input.range ?? { fromTick: Math.max(0, projection.tick - 720), toTick: projection.tick }
  const cards = ANALYTICS_METRICS
    .filter((definition) => input.category === 'overview' || definition.category === input.category)
    .map((definition) => buildAnalyticsCard(definition, projection, input.statistics, range))
  const ageBands = { children: 0, adults: 0, elders: 0 }
  for (const person of projection.people) {
    if (person.ageYears < 18) ageBands.children += 1
    else if (person.ageYears >= 65) ageBands.elders += 1
    else ageBands.adults += 1
  }
  const cohortAgeBands = projection.cohorts.reduce((total, cohort) => ({ children: total.children + cohort.ageBands.children, adults: total.adults + cohort.ageBands.adults, elders: total.elders + cohort.ageBands.elders }), { children: 0, adults: 0, elders: 0 })
  const needDefinitions = new Map(projection.variableDefinitions.map((definition) => [definition.id, definition]))
  const needIds = ['person.state.hunger', 'person.state.fatigue', 'person.need.socialConnection']
  const topNeeds = needIds.map((id) => ({
    id,
    label: needDefinitions.get(id)?.label ?? id.split('.').at(-1) ?? id,
    value: projection.people.length ? Math.round(projection.people.reduce((sum, person) => sum + (person.variables[id] ?? 0), 0) / projection.people.length) : 0,
  })).sort((left, right) => right.value - left.value || compareStableText(left.id, right.id))
  return {
    cards,
    settlementPopulation: projection.settlements.map((settlement) => ({ id: settlement.id, label: `${settlement.name} catchment`, value: settlement.nearbyResidentCount })),
    detailedAgeBands: composition(ageBands),
    cohortAgeBands: composition(cohortAgeBands),
    detailedCompositionAvailability: projection.detailBudget.peopleTruncated ? 'partial' : projection.people.length ? 'available' : 'empty',
    topNeeds,
    recentEvents: historicalHighlights(input.events).slice(0, 8).map((highlight) => highlight.event),
  }
}

export function buildAnalyticsCard(definition: AnalyticsMetricDefinition, projection: WorkbenchProjection, statistics: readonly StatisticSample[], range: WorkbenchTimeRange): AnalyticsCardViewModel {
  const samples = definition.statisticId ? statistics
    .filter((sample) => sample.scope === 'world' && sample.metricId === definition.statisticId && sample.tick >= range.fromTick && sample.tick <= range.toTick)
    .slice().sort((left, right) => left.tick - right.tick) : []
  const current = samples.at(-1)?.value ?? definition.current?.(projection)
  const delta = samples.length >= 2 ? samples.at(-1)!.value - samples[0]!.value : undefined
  const hasGap = definition.cadenceTicks !== undefined && samples.some((sample, index) => index > 0 && sample.tick - samples[index - 1]!.tick > definition.cadenceTicks! * 2)
  const unavailable = current === undefined && definition.current === undefined && samples.length === 0
  const availability: VisualizationAvailability = unavailable ? 'unavailable' : current === undefined ? 'empty' : hasGap ? 'gapped' : 'available'
  const trend = definition.statisticId ? buildTimeSeriesViewModel({
    id: definition.id,
    label: definition.label,
    unit: definition.unit,
    fromTick: range.fromTick,
    toTick: range.toTick,
    values: samples.flatMap((sample, index) => {
      const previous = samples[index - 1]
      const gap = previous && definition.cadenceTicks !== undefined && sample.tick - previous.tick > definition.cadenceTicks * 2
        ? [{ tick: previous.tick + definition.cadenceTicks, value: undefined, evidenceId: `${definition.id}:retention-gap:${previous.tick}` }]
        : []
      return [...gap, { tick: sample.tick, value: sample.value, evidenceId: `${sample.metricId}:${sample.tick}` }]
    }),
    provenance: { source: definition.source, projectionTick: projection.tick, cadenceTicks: definition.cadenceTicks },
  }) : undefined
  return {
    id: definition.id,
    label: definition.label,
    unit: definition.unit,
    value: current,
    previousValue: samples.length >= 2 ? samples[0]!.value : undefined,
    availability,
    provenance: { source: definition.source, projectionTick: projection.tick, cadenceTicks: definition.cadenceTicks, detail: definition.caveat },
    definition,
    sampleTick: samples.at(-1)?.tick ?? (current !== undefined ? projection.tick : undefined),
    delta,
    trend,
    trendMeaning: delta === undefined ? 'not-comparable' : delta === 0 || definition.direction === 'neutral' ? 'neutral' : (delta > 0) === (definition.direction === 'higher-is-better') ? 'desirable' : 'undesirable',
  }
}

export function buildScopeComparison(projection: WorkbenchProjection, left?: WorkbenchEntityRef, right?: WorkbenchEntityRef): readonly ComparisonRowViewModel[] {
  if (!left || !right) return []
  if (left.kind !== right.kind || (left.kind !== 'settlement' && left.kind !== 'region')) return [buildComparisonRow({ id: 'scope', label: 'Scope compatibility', unit: 'text', reason: 'Choose two settlements or two community catchments with the same scope.' })]
  if (left.kind === 'settlement') {
    const first = projection.settlements.find((entry) => entry.id === left.id)
    const second = projection.settlements.find((entry) => entry.id === right.id)
    const firstService = projection.settlementServices.find((entry) => entry.settlementId === left.id)
    const secondService = projection.settlementServices.find((entry) => entry.settlementId === right.id)
    return [
      buildComparisonRow({ id: 'residents', label: 'Nearby residents (geographic catchment)', unit: 'count', left: first?.nearbyResidentCount, right: second?.nearbyResidentCount }),
      buildComparisonRow({ id: 'food-stores', label: 'Household food stores', unit: 'count', left: first?.householdFoodStoreUnits, right: second?.householdFoodStoreUnits }),
      buildComparisonRow({ id: 'resources', label: 'Catchment resource capacity', unit: 'count', left: first?.catchmentResourceCapacity, right: second?.catchmentResourceCapacity }),
      buildComparisonRow({ id: 'infrastructure', label: 'Infrastructure condition', unit: 'permille', left: firstService?.infrastructureConditionPermille, right: secondService?.infrastructureConditionPermille }),
    ]
  }
  const first = projection.communities.find((entry) => entry.catchment.id === left.id)
  const second = projection.communities.find((entry) => entry.catchment.id === right.id)
  return [
    buildComparisonRow({ id: 'social-trust', label: 'Observed social trust', unit: 'permille', left: first?.emergent['community.emergent.socialTrust'], right: second?.emergent['community.emergent.socialTrust'] }),
    buildComparisonRow({ id: 'cohesion', label: 'Observed cohesion', unit: 'permille', left: first?.emergent['community.emergent.cohesion'], right: second?.emergent['community.emergent.cohesion'] }),
    buildComparisonRow({ id: 'food-security', label: 'Structural food security', unit: 'permille', left: first?.structural['community.structural.foodSecurity'], right: second?.structural['community.structural.foodSecurity'] }),
  ]
}

function composition(values: { children: number; adults: number; elders: number }) {
  return [
    { id: 'children', label: 'Children', value: values.children, color: '#d8aa68' },
    { id: 'adults', label: 'Adults', value: values.adults, color: '#58a58c' },
    { id: 'elders', label: 'Elders', value: values.elders, color: '#8f82c9' },
  ]
}
