import type { ActivityLocationId } from '../households/types'

export type OrganizationId = string
export type OrganizationKind = 'school'
export type OrganizationMemberRole = 'learner' | 'educator'
export interface OrganizationMember { personId: string; role: OrganizationMemberRole }
/** Persistent coordinated group; membership is not a trait, belief, or attitude assignment. */
export interface OrganizationState {
  id: OrganizationId
  name: string
  kind: OrganizationKind
  locationCellId: string
  activityLocationId: ActivityLocationId
  members: OrganizationMember[]
  /** Maximum learners receiving this location-bound service in one scheduled window. */
  serviceCapacity: number
  sharedRuleIds: string[]
}
export type SchoolAttendanceReason = 'available' | 'no-route' | 'no-household-capacity' | 'too-distant' | 'capacity' | 'declined' | 'traveling'
/** Latest explicit school access evaluation; it is evidence, not a settlement membership. */
export interface SchoolAttendanceTrace { tick: number; schoolId: OrganizationId; schoolCellId: string; travelCost: number | null; householdCapacityPermille: number; curiosityPermille: number; persistencePermille: number; probabilityPermille: number; randomRollPermille: number; attended: boolean; reason: SchoolAttendanceReason }
export interface SchoolAttendanceState { schoolId: OrganizationId; returnTick: number }
/** Local authority is separate from settlement labels and exposure catchments. */
export interface LocalGovernanceState { id: string; communityId: string; councilOrganizationId: string; representativeIds: string[]; legitimacy: number; publicGood: 'food-relief'; serviceAccessPermille: number; contributionFairnessPermille: number; lastUpdatedTick: number }
/** Interpersonal grievance state; not combat, a military unit, or warfare. */
export interface DisputeState { id: string; personAId: string; personBId: string; grievance: number; incidents: number; lastIncidentTick: number; communityId: string }
/** Knowledge is learned and applied separately from dispositions, values, and skills. */
export type KnowledgeId = 'knowledge.foraging' | 'knowledge.localTerrain'
export type PersonKnowledge = Record<KnowledgeId, number>
export interface KnowledgeTrace {
  knowledgeId: KnowledgeId
  source: 'exploration' | 'peer-transmission'
  tick: number
  previousValue: number
  sourceValue?: number
  relationshipTrust?: number
  gain: number
  currentValue: number
}
export type PersonOccupation = 'forager' | 'household' | 'dependent'
