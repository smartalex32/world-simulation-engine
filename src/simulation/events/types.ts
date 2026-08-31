import type { SimulationEventPayload, SimulationEventType } from './catalog'

export interface SimulationEvent<T extends SimulationEventType = SimulationEventType> {
  id: string
  runId: string
  tick: number
  sequence: number
  type: T
  version: 1
  cellId?: string
  payload: SimulationEventPayload<T>
}

export type WorldStatisticMetricId = 'world.cellCount' | 'world.habitableCells' | 'engine.simulatedDays' | 'population.count' | 'population.aliveCount' | 'population.averageHunger' | 'lifecycle.births' | 'lifecycle.deaths' | 'lifecycle.partnershipsFormed' | 'spatial.occupiedCells' | 'spatial.averageTravelCost' | 'resources.totalFood' | 'resources.foodRegenerated' | 'resources.foodConsumed' | 'resources.failedMeals' | 'economy.householdFood' | 'economy.productiveHours' | 'economy.foodProduced' | 'economy.agriculturalFoodProduced' | 'economy.foodShared' | 'economy.exchangeCount' | 'social.encounters' | 'social.encountersPer1000People' | 'social.relationshipCount' | 'social.networkDensityPermille' | 'social.averageFamiliarity' | 'social.positiveEncounters' | 'social.tenseEncounters' | 'activity.homePersonHours' | 'activity.commonsPersonHours' | 'activity.travelPersonHours' | 'household.parentChildCoExposureSourceHours' | 'development.experiences' | 'development.curiosityChanges' | 'development.absoluteCuriosityChange' | 'development.broaderExperiences' | 'development.broaderChanges'

export type CommunityStatisticMetricId = 'community.emergent.socialTrust' | 'community.emergent.cohesion' | 'community.emergent.cooperation' | 'community.emergent.conflict' | 'community.emergent.innovationClimate' | 'community.structural.foodSecurity' | 'community.exposedPersonHours' | 'community.encounters'

interface StatisticSampleBase {
  runId: string
  tick: number
  metricVersion: 1
  value: number
}

export type StatisticSample = StatisticSampleBase & (
  | { metricId: WorldStatisticMetricId; scope: 'world'; scopeId?: never }
  | { metricId: CommunityStatisticMetricId; scope: 'community'; scopeId: string }
)
