import type { PersonVariableDefinition, PersonVariableId, PersonVariableValues } from '../variables/types'

export const ENGINE_VERSION = '0.6.0'
export const SNAPSHOT_SCHEMA_VERSION = 6
export const BASE_TICK_HOURS = 1
export const VARIABLE_REGISTRY_VERSION = 1
export const INFLUENCE_REGISTRY_VERSION = 1
export const HOUSEHOLD_MODEL_VERSION = 1
export const ACTIVITY_REGISTRY_VERSION = 1

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

export type UtilityContribution = UnattributedUtilityContribution | InfluenceUtilityContribution

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

export interface RunConfiguration {
  seed: string
  worldWidth: number
  worldHeight: number
  baseTickHours: number
  variableRegistryVersion: number
  influenceRegistryVersion: number
  householdModelVersion: number
  activityRegistryVersion: number
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
  relationships: RelationshipState[]
  dailySpatialCounters: DailySpatialCounters
  dailySocialCounters: DailySocialCounters
  dailyActivityCounters: DailyActivityCounters
  randomStreams: RandomStreamSnapshot[]
}

export interface SimulationEvent {
  id: string
  runId: string
  tick: number
  type: 'RUN_CREATED' | 'RUN_STARTED' | 'RUN_PAUSED' | 'CLOCK_ADVANCED' | 'SNAPSHOT_SAVED' | 'RUN_LOADED' | 'PERSON_STARTED_TRAVEL' | 'PERSON_MOVED' | 'PERSON_ATE' | 'PERSON_FAILED_TO_EAT' | 'PERSON_EXPLORED' | 'PERSON_RESTED' | 'PERSON_SOCIALIZED' | 'PERSON_ACTIVITY_CHANGED' | 'PERSON_AGED' | 'PERSON_ENCOUNTERED' | 'RELATIONSHIP_FORMED' | 'ERROR'
  version: 1
  cellId?: string
  payload: Record<string, string | number | boolean | null>
}

export interface StatisticSample {
  runId: string
  tick: number
  metricId: 'world.cellCount' | 'world.habitableCells' | 'engine.simulatedDays' | 'population.count' | 'population.averageHunger' | 'spatial.occupiedCells' | 'spatial.averageTravelCost' | 'resources.totalFood' | 'resources.foodConsumed' | 'resources.failedMeals' | 'social.encounters' | 'social.encountersPer1000People' | 'social.relationshipCount' | 'social.networkDensityPermille' | 'social.averageFamiliarity' | 'social.positiveEncounters' | 'social.tenseEncounters' | 'activity.homePersonHours' | 'activity.commonsPersonHours' | 'activity.travelPersonHours'
  metricVersion: 1
  scope: 'world'
  value: number
}

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
  relationships: RelationshipState[]
  variableDefinitions: readonly PersonVariableDefinition[]
  digest?: string
}
