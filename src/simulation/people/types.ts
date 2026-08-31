import type { CommunityEmergentId } from '../community/types'
import type { HouseholdId, ActivityLocationId, ActivityScheduleId, CurrentActivityState, CuriosityInheritanceTrace } from '../households/types'
import type { KnowledgeTrace, OrganizationId, PersonKnowledge, PersonOccupation, SchoolAttendanceState, SchoolAttendanceTrace } from '../organizations/types'
import type { FictionalInfectionState, FictionalInfectionTrace, HealthExposureState, HealthInterventionTrace, HealthStressTrace } from '../health/types'
import type { PersonVariableId, PersonVariableValues } from '../variables/types'

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

export type ActionName = 'eat' | 'move' | 'explore' | 'rest' | 'socialize' | 'work'

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

export type CulturalBeliefId = 'belief.exploration' | 'belief.cooperation'
export type CulturalBeliefs = Record<CulturalBeliefId, number>
/** Learned beliefs, separate from dispositions and changed only through explicit social exposure. */
export interface CulturalState { beliefs: CulturalBeliefs; exposureCount: number; lastSourcePersonId?: string; lastTransmissionTick?: number }
export type LanguageId = 'language.valley' | 'language.ridge'
export interface LanguageState { fluency: Record<LanguageId, number>; acquisitionCount: number; lastSourcePersonId?: string; lastAcquisitionTick?: number }

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
  waterAvailabilityPermilleHours: number
}

export interface PracticalTechnique { id: 'technique.foraging.efficient-harvest'; personId: string; createdTick: number; knowledgePermille: number; toolCost: number; successRollPermille: number }

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
  occupation?: PersonOccupation
  culture?: CulturalState
  language?: LanguageState
  /** Required in authoritative schema-22 snapshots; optional only for narrow legacy/unit fixtures. */
  knowledge?: PersonKnowledge
  techniques?: PracticalTechnique[]
  lastKnowledgeTrace?: KnowledgeTrace
  schoolLearningHours?: number
  schoolAttendance?: SchoolAttendanceState
  lastSchoolAttendance?: SchoolAttendanceTrace
  activityScheduleId: ActivityScheduleId
  currentActivity: CurrentActivityState
  originTraces: CuriosityInheritanceTrace[]
  development: PersonDevelopmentState
  environmentalExposure?: EnvironmentalExposureState
  healthExposure?: HealthExposureState
  lastHealthStressTrace?: HealthStressTrace
  fictionalInfection?: FictionalInfectionState
  lastInfectionTrace?: FictionalInfectionTrace
  lastHealthIntervention?: HealthInterventionTrace
  variables: PersonVariableValues
  knownCellIds: string[]
  journey?: JourneyState
  lastDecision?: ActionDecision
  lastEncounter?: LastEncounter
}
