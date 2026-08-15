import type { PersonVariableDefinition, PersonVariableId, PersonVariableValues } from '../variables/types'
import type {
  CommunityDailyCounterState,
  CommunityEmergentId,
  CommunityFeedbackEdgeDefinition,
  CommunitySimulationState,
  CommunityVariableDefinition,
} from '../community/types'

export const ENGINE_VERSION = '0.8.0'
export const SNAPSHOT_SCHEMA_VERSION = 8
export const BASE_TICK_HOURS = 1
export const VARIABLE_REGISTRY_VERSION = 1
export const INFLUENCE_REGISTRY_VERSION = 1
export const HOUSEHOLD_MODEL_VERSION = 1
export const ACTIVITY_REGISTRY_VERSION = 1
export const DEVELOPMENT_REGISTRY_VERSION = 1
export const COMMUNITY_REGISTRY_VERSION = 1

export type Terrain = 'water' | 'plain' | 'hill'

export interface HexCoord {
  q: number
  r: number
}

export interface GeographicCell extends HexCoord {
  id: string
  terrain: Terrain
  elevation: number
  habitability: number
  movementCost: number
  resourceCapacity: number
  foodAmount: number
  foodRegenerationPerDay: number
}

export interface HexGrid {
  width: number
  height: number
  cells: GeographicCell[]
}

export interface WorldState {
  id: string
  name: string
  grid: HexGrid
}

export type HouseholdId = string
export type ParentChildLinkId = string
export type ActivityLocationId = string
export type ActivityLocationKind = 'home' | 'commons'
export type CurrentActivityKind = ActivityLocationKind | 'travel'
export type ActivityScheduleId = 'activity.schedule.child.v1' | 'activity.schedule.adult.v1'

export interface HouseholdState {
  id: HouseholdId
  homeCellId: string
  homeActivityLocationId: ActivityLocationId
  memberIds: string[]
}

export interface ParentChildLink {
  id: ParentChildLinkId
  householdId: HouseholdId
  parentId: string
  childId: string
}

export interface ActivityLocationState {
  id: ActivityLocationId
  kind: ActivityLocationKind
  cellId: string
  householdId?: HouseholdId
}

export interface CurrentActivityState {
  kind: CurrentActivityKind
  locationId: ActivityLocationId | null
  sinceTick: number
}

export interface CuriosityInheritanceTrace {
  modelId: 'inheritance.parental-baseline-variation.v1'
  targetId: 'person.trait.curiosity'
  parentIds: string[]
  parentalMeanPermille: number
  populationBaselinePermille: number
  randomVariationPermille: number
  parentalWeightPermille: number
  baselineWeightPermille: number
  variationWeightPermille: number
  finalValue: number
}

export type DevelopmentAgeBand = 'childhood' | 'adolescence' | 'adult' | 'lateLife'
export type DevelopmentExposureChannelId = 'exposure.parent.curiosity-modeling'
export type DevelopmentExperienceType = 'experience.parent.curiosity-modeling'
export type DevelopmentEdgeId = 'development.parent-curiosity-to-curiosity'

export interface DevelopmentExposureAccumulator {
  channelId: DevelopmentExposureChannelId
  windowStartTick: number
  sourcePersonIds: string[]
  recipientHours: number
  sourceHours: number
  weightedSourceValueHours: number
  lastExposureTick?: number
}

export interface ParentCuriosityModelingExperience {
  id: string
  type: DevelopmentExperienceType
  personId: string
  householdId: HouseholdId
  sourcePersonIds: string[]
  activityLocationId: ActivityLocationId
  startTick: number
  endTick: number
  recipientHours: number
  sourceHours: number
  sourceMeanPermille: number
  exposureStrengthPermille: number
}

export interface DevelopmentChangeTrace {
  edgeId: DevelopmentEdgeId
  targetId: 'person.trait.curiosity'
  experienceId: string
  previousValue: number
  sourceValuePermille: number
  gapPermille: number
  exposureStrengthPermille: number
  ageBand: DevelopmentAgeBand
  plasticityPermille: number
  resolution: 'deterministic'
  applicationProbabilityPermille: 1000
  requestedDelta: number
  appliedDelta: number
  currentValue: number
}

export interface PersonDevelopmentState {
  exposures: DevelopmentExposureAccumulator[]
  lastExperience?: ParentCuriosityModelingExperience
  lastChange?: DevelopmentChangeTrace
}

export type EncounterOutcome = 'positive' | 'neutral' | 'tense'
export type EncounterRole = 'initiator' | 'participant'

export interface RelationshipPerspective {
  affection: number
  trust: number
  respect: number
  fear: number
}

export interface RelationshipState {
  id: string
  personAId: string
  personBId: string
  familiarity: number
  interactionFrequency: number
  interactionCount: number
  lastInteractionTick: number
  aToB: RelationshipPerspective
  bToA: RelationshipPerspective
}

export interface LastEncounter {
  tick: number
  otherPersonId: string
  cellId: string
  activityLocationId: ActivityLocationId
  role: EncounterRole
  outcome: EncounterOutcome
  outcomeWeight: number
  totalOutcomeWeight: number
  probabilityPermille: number
  familiarityBefore: number
  familiarityAfter: number
}

export type ActionName = 'eat' | 'move' | 'explore' | 'rest' | 'socialize'

export interface UnattributedUtilityContribution {
  kind: 'base' | 'context' | 'interaction'
  factor: string
  value: number
  edgeId?: never
  sourceId?: never
  targetId?: never
  sourceValue?: never
  weightPermille?: never
}

export interface InfluenceUtilityContribution {
  kind: 'influence'
  factor: string
  value: number
  edgeId: string
  sourceId: PersonVariableId
  targetId: `decision.${ActionName}.utility`
  sourceValue: number
  weightPermille: number
}

export interface CommunityInfluenceUtilityContribution {
  kind: 'communityInfluence'
  factor: string
  value: number
  edgeId: string
  sourceId: CommunityEmergentId
  targetId: 'decision.socialize.utility' | 'decision.explore.utility'
  sourceValue: number
  centeredSourceValue: number
  weightPermille: number
  communityId: string
}

export type UtilityContribution = UnattributedUtilityContribution | InfluenceUtilityContribution | CommunityInfluenceUtilityContribution

export interface ActionAlternative {
  action: ActionName
  weight: number
}

export interface ActionDecision {
  tick: number
  action: ActionName
  targetCellId?: string
  weight: number
  totalWeight: number
  probabilityPermille: number
  contributions: UtilityContribution[]
  alternatives: ActionAlternative[]
}

export interface JourneyState {
  kind: 'move' | 'explore'
  destinationCellId: string
  totalCost: number
  remainingCost: number
}

export interface PersonState {
  id: string
  ageYears: number
  ageHoursIntoYear: number
  locationCellId: string
  homeCellId: string
  householdId: HouseholdId
  activityScheduleId: ActivityScheduleId
  currentActivity: CurrentActivityState
  originTraces: CuriosityInheritanceTrace[]
  development: PersonDevelopmentState
  variables: PersonVariableValues
  knownCellIds: string[]
  journey?: JourneyState
  lastDecision?: ActionDecision
  lastEncounter?: LastEncounter
}

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
}

export interface RunConfiguration {
  seed: string
  worldWidth: number
  worldHeight: number
  baseTickHours: number
  variableRegistryVersion: number
  influenceRegistryVersion: number
  householdModelVersion: number
  activityRegistryVersion: number
  developmentRegistryVersion: number
  communityRegistryVersion: number
}

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
  households: HouseholdState[]
  parentChildLinks: ParentChildLink[]
  activityLocations: ActivityLocationState[]
  communities: CommunitySimulationState[]
  dailyCommunityCounters: CommunityDailyCounterState[]
  relationships: RelationshipState[]
  dailySpatialCounters: DailySpatialCounters
  dailySocialCounters: DailySocialCounters
  dailyActivityCounters: DailyActivityCounters
  dailyDevelopmentCounters: DailyDevelopmentCounters
  randomStreams: RandomStreamSnapshot[]
}

export interface SimulationEvent {
  id: string
  runId: string
  tick: number
  type: 'RUN_CREATED' | 'RUN_STARTED' | 'RUN_PAUSED' | 'CLOCK_ADVANCED' | 'SNAPSHOT_SAVED' | 'RUN_LOADED' | 'PERSON_STARTED_TRAVEL' | 'PERSON_MOVED' | 'PERSON_ATE' | 'PERSON_FAILED_TO_EAT' | 'PERSON_EXPLORED' | 'PERSON_RESTED' | 'PERSON_SOCIALIZED' | 'PERSON_ACTIVITY_CHANGED' | 'PERSON_AGED' | 'PERSON_ENCOUNTERED' | 'RELATIONSHIP_FORMED' | 'PERSON_EXPERIENCED_PARENT_MODELING' | 'PERSON_VARIABLE_DEVELOPED' | 'COMMUNITY_MEASURES_UPDATED' | 'ERROR'
  version: 1
  cellId?: string
  payload: Record<string, string | number | boolean | null>
}

export type WorldStatisticMetricId = 'world.cellCount' | 'world.habitableCells' | 'engine.simulatedDays' | 'population.count' | 'population.averageHunger' | 'spatial.occupiedCells' | 'spatial.averageTravelCost' | 'resources.totalFood' | 'resources.foodConsumed' | 'resources.failedMeals' | 'social.encounters' | 'social.encountersPer1000People' | 'social.relationshipCount' | 'social.networkDensityPermille' | 'social.averageFamiliarity' | 'social.positiveEncounters' | 'social.tenseEncounters' | 'activity.homePersonHours' | 'activity.commonsPersonHours' | 'activity.travelPersonHours' | 'household.parentChildCoExposureSourceHours' | 'development.experiences' | 'development.curiosityChanges' | 'development.absoluteCuriosityChange'

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

export interface SnapshotEnvelope {
  schemaVersion: number
  engineVersion: string
  state: SimulationState
  digest: string
}

export interface WorldProjection {
  runId: string
  tick: number
  seed: string
  engineVersion: string
  world: WorldState
  people: PersonState[]
  households: HouseholdState[]
  parentChildLinks: ParentChildLink[]
  activityLocations: ActivityLocationState[]
  communities: CommunitySimulationState[]
  relationships: RelationshipState[]
  variableDefinitions: readonly PersonVariableDefinition[]
  communityVariableDefinitions: readonly CommunityVariableDefinition[]
  communityFeedbackDefinitions: readonly CommunityFeedbackEdgeDefinition[]
  digest?: string
}
