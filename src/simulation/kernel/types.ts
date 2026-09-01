import type { CommunityDailyCounterState, CommunitySimulationState } from '../community/types'
import type { PopulationCohortState, PopulationFidelityState } from '../cohorts/types'
import type { EconomyState, MarketState } from '../economy/types'
import type { ActivityLocationState, HouseholdState, ParentChildLink } from '../households/types'
import type { InfrastructureAssetState } from '../infrastructure/types'
import type { DisputeState, LocalGovernanceState, OrganizationLifecycleState, OrganizationState } from '../organizations/types'
import type { PersonState, RelationshipState } from '../people/types'
import type { WorldCreationRequest, WorldState } from '../spatial/types'

export interface DailySpatialCounters {
  travelCost: number
  completedMoves: number
  foodConsumed: number
  failedMeals: number
}

export interface DailySocialCounters {
  encounters: number
  positiveEncounters: number
  neutralEncounters: number
  tenseEncounters: number
  relationshipsFormed: number
}

export interface DailyActivityCounters {
  homePersonHours: number
  commonsPersonHours: number
  travelPersonHours: number
}

export interface DailyDevelopmentCounters {
  parentChildCoExposureSourceHours: number
  developmentExperiences: number
  developmentChanges: number
  absoluteCuriosityChange: number
  broaderDevelopmentExperiences: number
  broaderDevelopmentChanges: number
}

export interface DailyLifeCycleCounters {
  births: number
  deaths: number
  partnershipsFormed: number
  householdMoves: number
  lifeStageTransitions: number
}

/** Daily, whole-food-unit accounting. Transfers preserve total household food. */
export interface DailyEconomicCounters {
  productiveHours: number
  foodProduced: number
  agriculturalFoodProduced: number
  foodConsumedFromHouseholds: number
  foodShared: number
  exchangeCount: number
}

/** Daily environmental recovery remains distinct from person production and use. */
export interface DailyEnvironmentalCounters {
  foodRegenerated: number
}

export interface RunConfiguration {
  seed: string
  worldWidth: number
  worldHeight: number
  worldGeneratorVersion: number
  worldCreation: WorldCreationRequest
  baseTickHours: number
  contentPackId: string
  contentPackVersion: string
  /** Canonical resolved graph fingerprint; ordinary snapshots retain references only. */
  contentPackChecksum?: string
  contentPackDependencies?: readonly { id: string; version: string; checksum: string }[]
  contentPackModelVersion: number
  variableRegistryVersion: number
  influenceRegistryVersion: number
  householdModelVersion: number
  activityRegistryVersion: number
  developmentRegistryVersion: number
  communityRegistryVersion: number
  environmentModelVersion: number
  lifeCycleModelVersion: number
  economyModelVersion?: number
  organizationModelVersion?: number
  cultureModelVersion?: number
  languageModelVersion?: number
  governanceModelVersion?: number
  conflictModelVersion?: number
  knowledgeModelVersion?: number
  healthModelVersion?: number
  innovationModelVersion?: number
  infrastructureModelVersion?: number
  cohortModelVersion: number
}

/** Exact, authoritative aggregate for ordinary distant people. It is static until later cohort systems own advancement. */

export interface RandomStreamSnapshot {
  name: string
  stateHex: string
  incrementHex: string
}

export interface SimulationState {
  runId: string
  tick: number
  nextEventSequence: number
  config: RunConfiguration
  world: WorldState
  people: PersonState[]
  cohorts: PopulationCohortState[]
  populationFidelity: PopulationFidelityState
  households: HouseholdState[]
  markets: MarketState[]
  economy: EconomyState
  organizations: OrganizationState[]
  organizationLifecycle?: OrganizationLifecycleState
  infrastructure: InfrastructureAssetState[]
  governance: LocalGovernanceState[]
  disputes: DisputeState[]
  parentChildLinks: ParentChildLink[]
  activityLocations: ActivityLocationState[]
  communities: CommunitySimulationState[]
  dailyCommunityCounters: CommunityDailyCounterState[]
  relationships: RelationshipState[]
  dailySpatialCounters: DailySpatialCounters
  dailySocialCounters: DailySocialCounters
  dailyActivityCounters: DailyActivityCounters
  dailyDevelopmentCounters: DailyDevelopmentCounters
  dailyLifeCycleCounters: DailyLifeCycleCounters
  dailyEconomicCounters?: DailyEconomicCounters
  dailyEnvironmentalCounters?: DailyEnvironmentalCounters
  randomStreams: RandomStreamSnapshot[]
}
