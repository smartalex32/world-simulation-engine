import type { PersonVariableDefinition, PersonVariableId, PersonVariableValues } from '../variables/types'
import type {
  CommunityDailyCounterState,
  CommunityEmergentId,
  CommunityFeedbackEdgeDefinition,
  CommunitySimulationState,
  CommunityVariableDefinition,
} from '../community/types'

export const ENGINE_VERSION = '0.15.0'
export const SNAPSHOT_SCHEMA_VERSION = 15
export const BASE_TICK_HOURS = 1
export const VARIABLE_REGISTRY_VERSION = 1
export const INFLUENCE_REGISTRY_VERSION = 1
export const HOUSEHOLD_MODEL_VERSION = 2
export const ACTIVITY_REGISTRY_VERSION = 1
export const DEVELOPMENT_REGISTRY_VERSION = 2
export const COMMUNITY_REGISTRY_VERSION = 1
export const WORLD_GENERATOR_VERSION = 1
/** Versioned deterministic calendar/exposure rules used by Milestone 9. */
export const ENVIRONMENT_MODEL_VERSION = 1
export const LIFE_CYCLE_MODEL_VERSION = 1
export const WORLD_CELL_RADIUS_METERS = 1_000

export type Terrain = 'water' | 'plain' | 'hill'

/** A deliberate terrain-type edit retained in a draft and creation request. */
export interface TerrainTypeOverride {
  cellId: string
  terrain: Terrain
}

/** A deliberate absolute elevation edit, measured in the cell's 0–1000 scale. */
export interface ElevationOverride {
  cellId: string
  elevation: number
}

/** A deliberate resource-capacity edit in whole resource units. */
export interface ResourceCapacityOverride {
  cellId: string
  resourceCapacity: number
}

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

/** Physical interpretation of the pointy axial grid. It is fixed for the first creator. */
export interface WorldScale {
  layout: 'axial-pointy'
  hexRadiusMeters: number
}

/** A named spatial place. It has no political or demographic behavior in Milestone 8A. */
export interface SettlementState {
  id: string
  name: string
  anchorCellId: string
}

/** Exact initial resident allocation for a disjoint set of passable cells. */
export interface PopulationPlacementZone {
  id: string
  name: string
  cellIds: string[]
  populationCount: number
  settlementId?: string
}

export type WorldPlacementPreset = 'west' | 'center' | 'central' | 'east'

/** UI-friendly pre-generation placement. The engine resolves it to passable cell IDs. */
export interface PopulationPlacementZoneDraft {
  id: string
  name: string
  populationCount: number
  settlementId?: string
  cellIds?: string[]
  preset?: WorldPlacementPreset
  radiusCells?: number
}

export interface SettlementDraft {
  id: string
  name: string
  anchorCellId?: string
  preset?: WorldPlacementPreset
}

/** Ordered, contiguous passable cell geometry for a draft-only road segment. */
export interface RoadDraft {
  id: string
  cellIds: string[]
}

/** A named-free transportation segment. Roads have no ownership or economic meaning. */
export interface RoadState {
  id: string
  cellIds: string[]
}

export interface WorldCreationDraft {
  seed: string
  name: string
  width: number
  height: number
  initialPopulationCount: number
  populationZones: PopulationPlacementZoneDraft[]
  settlements: SettlementDraft[]
  roads?: RoadDraft[]
  /** Canonically sorted sparse terrain edits; absent means seeded terrain only. */
  terrainOverrides?: TerrainTypeOverride[]
  elevationOverrides?: ElevationOverride[]
  resourceCapacityOverrides?: ResourceCapacityOverride[]
}

export interface WorldCreationRequest {
  seed: string
  name: string
  width: number
  height: number
  initialPopulationCount: number
  populationZones: PopulationPlacementZone[]
  settlements: SettlementState[]
  /** Omitted when no authored roads exist, preserving legacy canonical worlds. */
  roads?: RoadState[]
  terrainOverrides: TerrainTypeOverride[]
  elevationOverrides: ElevationOverride[]
  resourceCapacityOverrides: ResourceCapacityOverride[]
}

/**
 * A non-authoritative, versioned world-authoring record. Drafts are editable
 * outside a live run and only become authoritative through an explicit worker
 * commit.
 */
export interface WorldDraftRecord {
  version: 2
  draftId: string
  revision: number
  /** Immutable authored input retained so reset never depends on UI state. */
  initialDraft: WorldCreationDraft
  draft: WorldCreationDraft
}

/** A bounded, deterministic result used by authoring UI before commit. */
export interface WorldDraftPreview {
  version: 1
  draftId: string
  revision: number
  creation: WorldCreationRequest
  worldId: string
  cellCount: number
  passableCellCount: number
  terrainCounts: Record<Terrain, number>
}

/** A bounded spatial request for read-only, generated draft terrain. */
export interface DraftViewportRequest {
  revision: number
  bounds: { minQ: number; maxQ: number; minR: number; maxR: number }
  selectedZoneId?: string
}

/** A generated terrain cell annotated only with membership in the requested zone. */
export interface DraftViewportCell extends GeographicCell {
  selected: boolean
}

/** Non-authoritative draft terrain projection; it must never be treated as a live frame. */
export interface DraftViewportProjection {
  version: 1
  draftId: string
  draftRevision: number
  revision: number
  selectedZoneId?: string
  cells: DraftViewportCell[]
}

export interface WorldState {
  id: string
  name: string
  scale: WorldScale
  grid: HexGrid
  settlements: SettlementState[]
  /** Omitted for legacy worlds without authored roads. */
  roads?: RoadState[]
}

export type HouseholdId = string
export type ParentChildLinkId = string
export type ActivityLocationId = string
export type ActivityLocationKind = 'home' | 'commons'
export type CurrentActivityKind = ActivityLocationKind | 'travel'
export type ActivityScheduleId = 'activity.schedule.child.v1' | 'activity.schedule.adolescent.v1' | 'activity.schedule.adult.v1'

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
export type BroaderDevelopmentChannelId = 'exposure.peer.relationship-modeling' | 'exposure.activity.exploration-practice' | 'exposure.community.catchment'
export type BroaderDevelopmentExperienceType = 'experience.peer.relationship-modeling' | 'experience.activity.exploration-practice' | 'experience.community.catchment'
export type BroaderDevelopmentEdgeId = 'development.peer-to-trust' | 'development.peer-to-sociability' | 'development.peer-to-conformity' | 'development.activity-exploration-to-persistence' | 'development.community-social-trust-to-trust' | 'development.community-cohesion-to-conformity' | 'development.community-innovation-to-curiosity'

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

/** A bounded, monthly evidence window for peer, activity, or community development. */
export interface BroaderDevelopmentExposureAccumulator {
  channelId: BroaderDevelopmentChannelId
  targetId: PersonVariableId
  windowStartTick: number
  sourcePersonIds: string[]
  recipientHours: number
  sourceHours: number
  weightedSourceValueHours: number
  lastExposureTick?: number
  sourceContextId?: string
}

export interface BroaderDevelopmentExperience {
  id: string
  type: BroaderDevelopmentExperienceType
  channelId: BroaderDevelopmentChannelId
  personId: string
  targetId: PersonVariableId
  startTick: number
  endTick: number
  recipientHours: number
  sourceHours: number
  sourceMeanPermille: number
  exposureStrengthPermille: number
  sourcePersonIds: string[]
  sourceContextId?: string
}

export interface BroaderDevelopmentChangeTrace {
  edgeId: BroaderDevelopmentEdgeId
  targetId: PersonVariableId
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

export interface BroaderDevelopmentState {
  exposures: BroaderDevelopmentExposureAccumulator[]
  lastExperience?: BroaderDevelopmentExperience
  lastChange?: BroaderDevelopmentChangeTrace
}

export interface PersonDevelopmentState {
  exposures: DevelopmentExposureAccumulator[]
  lastExperience?: ParentCuriosityModelingExperience
  lastChange?: DevelopmentChangeTrace
  broader?: BroaderDevelopmentState
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

/**
 * Lifetime, location-derived environmental exposure. These are observations,
 * not community membership effects: each hour is credited only to the cell a
 * person actually occupies.
 */
export interface EnvironmentalExposureState {
  observedHours: number
  foodAccessibleHours: number
  difficultTerrainHours: number
  thermalLoadPermilleHours: number
}

export type PersonLifeStage = 'infant' | 'child' | 'adolescent' | 'adult' | 'olderAdult'
export type PersonLifeStatus = 'alive' | 'dead'

export interface PersonState {
  id: string
  ageYears: number
  ageHoursIntoYear: number
  lifeStage?: PersonLifeStage
  lifeStatus?: PersonLifeStatus
  /** Defined only for people created during this run, preserving initial placement evidence. */
  birthTick?: number
  deathTick?: number
  partnerId?: string
  locationCellId: string
  homeCellId: string
  /** Authored starting home, retained when an adult later changes household. */
  initialHomeCellId?: string
  householdId: HouseholdId
  activityScheduleId: ActivityScheduleId
  currentActivity: CurrentActivityState
  originTraces: CuriosityInheritanceTrace[]
  development: PersonDevelopmentState
  environmentalExposure?: EnvironmentalExposureState
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

export interface RunConfiguration {
  seed: string
  worldWidth: number
  worldHeight: number
  worldGeneratorVersion: number
  worldCreation: WorldCreationRequest
  baseTickHours: number
  variableRegistryVersion: number
  influenceRegistryVersion: number
  householdModelVersion: number
  activityRegistryVersion: number
  developmentRegistryVersion: number
  communityRegistryVersion: number
  environmentModelVersion: number
  lifeCycleModelVersion: number
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
  dailyLifeCycleCounters: DailyLifeCycleCounters
  randomStreams: RandomStreamSnapshot[]
}

export interface SimulationEvent {
  id: string
  runId: string
  tick: number
  type: 'RUN_CREATED' | 'RUN_STARTED' | 'RUN_PAUSED' | 'CLOCK_ADVANCED' | 'SNAPSHOT_SAVED' | 'RUN_LOADED' | 'PERSON_STARTED_TRAVEL' | 'PERSON_MOVED' | 'PERSON_ATE' | 'PERSON_FAILED_TO_EAT' | 'PERSON_EXPLORED' | 'PERSON_RESTED' | 'PERSON_SOCIALIZED' | 'PERSON_ACTIVITY_CHANGED' | 'PERSON_AGED' | 'PERSON_LIFE_STAGE_CHANGED' | 'PERSON_DIED' | 'PARTNERSHIP_FORMED' | 'PERSON_MOVED_HOUSEHOLD' | 'PERSON_BORN' | 'PERSON_ENCOUNTERED' | 'RELATIONSHIP_FORMED' | 'PERSON_EXPERIENCED_PARENT_MODELING' | 'PERSON_EXPERIENCED_PEER_MODELING' | 'PERSON_EXPERIENCED_ACTIVITY_PRACTICE' | 'PERSON_EXPERIENCED_COMMUNITY_EXPOSURE' | 'PERSON_VARIABLE_DEVELOPED' | 'COMMUNITY_MEASURES_UPDATED' | 'ERROR'
  version: 1
  cellId?: string
  payload: Record<string, string | number | boolean | null>
}

export type WorldStatisticMetricId = 'world.cellCount' | 'world.habitableCells' | 'engine.simulatedDays' | 'population.count' | 'population.aliveCount' | 'population.averageHunger' | 'lifecycle.births' | 'lifecycle.deaths' | 'lifecycle.partnershipsFormed' | 'spatial.occupiedCells' | 'spatial.averageTravelCost' | 'resources.totalFood' | 'resources.foodConsumed' | 'resources.failedMeals' | 'social.encounters' | 'social.encountersPer1000People' | 'social.relationshipCount' | 'social.networkDensityPermille' | 'social.averageFamiliarity' | 'social.positiveEncounters' | 'social.tenseEncounters' | 'activity.homePersonHours' | 'activity.commonsPersonHours' | 'activity.travelPersonHours' | 'household.parentChildCoExposureSourceHours' | 'development.experiences' | 'development.curiosityChanges' | 'development.absoluteCuriosityChange' | 'development.broaderExperiences' | 'development.broaderChanges'

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
  populationZones: PopulationPlacementZone[]
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
