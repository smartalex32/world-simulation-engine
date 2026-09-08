import type { WorkbenchProjection } from '../../projection'
import type { WorldStatisticMetricId } from '../../simulation/domain/types'
import type { MetricUnit } from '../visualization'

export type AnalyticsMetricCategory = 'overview' | 'population' | 'resources' | 'social' | 'systems'
export type AnalyticsFidelity = 'all' | 'detailed' | 'cohort'
export type MetricDirection = 'higher-is-better' | 'lower-is-better' | 'neutral'

export interface AnalyticsMetricDefinition {
  id: string
  label: string
  category: AnalyticsMetricCategory
  unit: MetricUnit
  direction: MetricDirection
  cadenceTicks?: number
  aggregationLevel: 'world' | 'settlement-average' | 'community-observation'
  source: string
  requiredCapability: string
  caveat: string
  statisticId?: WorldStatisticMetricId
  current?: (projection: WorkbenchProjection) => number | undefined
}

function weightedAverage(values: readonly { value: number; weight: number }[]): number | undefined {
  const denominator = values.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0)
  if (denominator === 0) return undefined
  return Math.round(values.reduce((sum, entry) => sum + entry.value * Math.max(0, entry.weight), 0) / denominator)
}

/** Stable metadata and adapters for every default dashboard card. */
export const ANALYTICS_METRICS: readonly AnalyticsMetricDefinition[] = Object.freeze([
  { id: 'population.count', label: 'Population', category: 'population', unit: 'count', direction: 'neutral', cadenceTicks: 24, aggregationLevel: 'world', source: 'daily world statistic with projection fallback', requiredCapability: 'population', caveat: 'Detailed and cohort population are authoritative but remain distinct.', statisticId: 'population.count', current: (projection) => projection.summary.populationCount },
  { id: 'population.averageHunger', label: 'Average hunger', category: 'population', unit: 'permille', direction: 'lower-is-better', cadenceTicks: 24, aggregationLevel: 'world', source: 'daily world statistic with projection fallback', requiredCapability: 'person needs', caveat: 'A world mean does not describe individual distribution.', statisticId: 'population.averageHunger', current: (projection) => projection.summary.averageHunger },
  { id: 'lifecycle.births', label: 'Births per day', category: 'population', unit: 'count', direction: 'neutral', cadenceTicks: 24, aggregationLevel: 'world', source: 'daily retained statistic', requiredCapability: 'life cycle', caveat: 'This is an interval count, not a cumulative total.', statisticId: 'lifecycle.births' },
  { id: 'lifecycle.deaths', label: 'Deaths per day', category: 'population', unit: 'count', direction: 'lower-is-better', cadenceTicks: 24, aggregationLevel: 'world', source: 'daily retained statistic', requiredCapability: 'life cycle', caveat: 'This is an interval count, not a cumulative total.', statisticId: 'lifecycle.deaths' },
  { id: 'resources.totalFood', label: 'World food', category: 'resources', unit: 'count', direction: 'higher-is-better', cadenceTicks: 24, aggregationLevel: 'world', source: 'daily retained statistic', requiredCapability: 'environment resources', caveat: 'Cell food and household food stores are separate stocks.', statisticId: 'resources.totalFood' },
  { id: 'economy.householdFoodStores', label: 'Household food stores', category: 'resources', unit: 'count', direction: 'higher-is-better', aggregationLevel: 'world', source: 'bounded economic projection', requiredCapability: 'household economy', caveat: 'Owned food units are not a combined wealth score.', current: (projection) => projection.economy.foodUnits },
  { id: 'economy.foodInequality', label: 'Food-store inequality', category: 'resources', unit: 'permille', direction: 'lower-is-better', aggregationLevel: 'world', source: 'bounded economic projection', requiredCapability: 'household economy', caveat: 'Gini evidence covers household-owned food only.', current: (projection) => projection.economy.foodGiniPermille },
  { id: 'social.relationshipCount', label: 'Relationships', category: 'social', unit: 'count', direction: 'neutral', cadenceTicks: 24, aggregationLevel: 'world', source: 'daily world statistic with projection fallback', requiredCapability: 'relationships', caveat: 'Retained ties are not the same as current co-presence.', statisticId: 'social.relationshipCount', current: (projection) => projection.summary.relationshipCount },
  { id: 'social.averageFamiliarity', label: 'Average familiarity', category: 'social', unit: 'permille', direction: 'higher-is-better', cadenceTicks: 24, aggregationLevel: 'world', source: 'daily retained statistic', requiredCapability: 'relationships', caveat: 'A mean can conceal directional and relationship-type differences.', statisticId: 'social.averageFamiliarity' },
  { id: 'community.socialTrust', label: 'Observed social trust', category: 'social', unit: 'permille', direction: 'higher-is-better', aggregationLevel: 'community-observation', source: 'community catchment projections', requiredCapability: 'community measures', caveat: 'Geographic exposure measure; not membership.', current: (projection) => weightedAverage(projection.communities.map((community) => ({ value: community.emergent['community.emergent.socialTrust'], weight: community.catchment.cellCount }))) },
  { id: 'infrastructure.condition', label: 'Infrastructure condition', category: 'systems', unit: 'permille', direction: 'higher-is-better', aggregationLevel: 'settlement-average', source: 'settlement service projections', requiredCapability: 'infrastructure', caveat: 'Unweighted average across settlement service profiles.', current: (projection) => projection.settlementServices.length ? Math.round(projection.settlementServices.reduce((sum, service) => sum + service.infrastructureConditionPermille, 0) / projection.settlementServices.length) : undefined },
  { id: 'organizations.count', label: 'Organizations', category: 'systems', unit: 'count', direction: 'neutral', aggregationLevel: 'world', source: 'organization profile projection', requiredCapability: 'organizations', caveat: 'Count reflects explicit organizations only.', current: (projection) => projection.organizationProfiles.length },
  { id: 'governance.legitimacy', label: 'Local legitimacy', category: 'systems', unit: 'permille', direction: 'higher-is-better', aggregationLevel: 'community-observation', source: 'local governance projections', requiredCapability: 'governance', caveat: 'Average of explicit catchment profiles; not national authority.', current: (projection) => projection.governanceProfiles.length ? Math.round(projection.governanceProfiles.reduce((sum, profile) => sum + profile.legitimacyPermille, 0) / projection.governanceProfiles.length) : undefined },
  { id: 'knowledge.foraging', label: 'Observed foraging knowledge', category: 'systems', unit: 'permille', direction: 'higher-is-better', aggregationLevel: 'community-observation', source: 'collective knowledge observations', requiredCapability: 'knowledge', caveat: 'Observed person knowledge; not a technology tier.', current: (projection) => weightedAverage(projection.collectiveKnowledge.map((entry) => ({ value: entry.averageForagingKnowledge, weight: entry.observedResidentCount }))) },
  { id: 'culture.valleyFluency', label: 'Observed Valley fluency', category: 'social', unit: 'permille', direction: 'neutral', aggregationLevel: 'community-observation', source: 'collective culture observations', requiredCapability: 'culture and language', caveat: 'Language evidence does not imply collective identity.', current: (projection) => weightedAverage(projection.collectiveCultures.map((entry) => ({ value: entry.averageValleyFluency, weight: entry.observedResidentCount }))) },
  { id: 'conflict.activeContentions', label: 'Active contentions', category: 'social', unit: 'count', direction: 'lower-is-better', aggregationLevel: 'community-observation', source: 'contention profile projection', requiredCapability: 'local contention', caveat: 'Interpersonal disputes only; organized warfare is not modeled.', current: (projection) => projection.contentionProfiles.reduce((sum, entry) => sum + entry.activeContentionCount, 0) },
  { id: 'generation.observedChildren', label: 'Observed child records', category: 'population', unit: 'count', direction: 'neutral', aggregationLevel: 'community-observation', source: 'generational evidence projection', requiredCapability: 'generational evidence', caveat: 'Retained child evidence; completed society feedback is not modeled.', current: (projection) => projection.generationalEvidence.reduce((sum, entry) => sum + entry.observedChildCount, 0) },
  { id: 'health.populationBurden', label: 'Population health burden', category: 'population', unit: 'permille', direction: 'lower-is-better', aggregationLevel: 'world', source: 'no aggregate projection', requiredCapability: 'aggregate health metric', caveat: 'Detailed health states are not aggregated in the current bounded projection.' },
  { id: 'conflict.warfare', label: 'Organized warfare', category: 'social', unit: 'count', direction: 'lower-is-better', aggregationLevel: 'world', source: 'no projection', requiredCapability: 'warfare', caveat: 'Organized warfare remains explicitly unmodeled.' },
])

export const ANALYTICS_HISTORY_METRICS = Object.freeze(ANALYTICS_METRICS.flatMap((definition) => definition.statisticId ? [definition.statisticId] : []))

export function analyticsMetric(id: string): AnalyticsMetricDefinition | undefined {
  return ANALYTICS_METRICS.find((definition) => definition.id === id)
}
