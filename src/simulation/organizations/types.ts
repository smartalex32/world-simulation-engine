import type { ActivityLocationId } from '../households/types'

export type OrganizationId = string
export type OrganizationKind = string
export type OrganizationMemberRole = string
/** Engine-owned rules may be referenced by setting packs; they are not pack code. */
export const ORGANIZATION_SHARED_RULE_IDS = ['organization.rule.attendance.v1'] as const
export type OrganizationSharedRuleId = typeof ORGANIZATION_SHARED_RULE_IDS[number]
export const ORGANIZATION_PURPOSE_IDS = ['education'] as const
/** Versioned setting data. It declares classification and initial-service
 * semantics, never automatic member effects, leadership, or reputation. */
export interface OrganizationDefinition {
  id: OrganizationKind
  name: string
  purposeIds: readonly string[]
  memberRoleIds: readonly OrganizationMemberRole[]
  sharedRuleIds: readonly string[]
  initialService: { location: 'settlement-anchor'; activityLocation: 'commons'; serviceCapacity: number }
  /** Omitted definitions never form or alter membership autonomously. */
  lifecycle?: { formation: boolean; defaultMemberRoleId: OrganizationMemberRole; cadenceHours: number; baseFormationPermille: number; baseMembershipPermille: number }
}
export interface OrganizationMember { personId: string; role: OrganizationMemberRole }
export type OrganizationMembershipChange = 'joined' | 'role-changed' | 'left'
export type OrganizationLifecycleRejection = 'disabled' | 'insufficient-activity' | 'already-member' | 'no-relationship' | 'no-role' | 'probability' | 'invalid-transition'
export interface OrganizationLifecycleFactors { activityPermille: number; proximityPermille: number; relationshipPermille: number; interestPermille: number; exposurePermille: number }
export interface OrganizationFormationTrace { tick: number; kindId: string; candidatePersonIds: string[]; locationCellId: string; baseProbabilityPermille: number; factors: OrganizationLifecycleFactors; finalProbabilityPermille: number; rngStream: string; randomRollPermille: number; formed: boolean; rejectionReason?: OrganizationLifecycleRejection; organizationId?: string }
export interface OrganizationMembershipTrace { tick: number; organizationId: string; personId: string; change: OrganizationMembershipChange; previousRoleId?: string; nextRoleId?: string; baseProbabilityPermille: number; factors: OrganizationLifecycleFactors; finalProbabilityPermille: number; rngStream: string; randomRollPermille: number; selected: boolean; rejectionReason?: OrganizationLifecycleRejection }
export interface OrganizationLifecycleState { nextOrganizationSequence: number; latestFormationTraces: OrganizationFormationTrace[]; latestMembershipTraces: OrganizationMembershipTrace[] }
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
