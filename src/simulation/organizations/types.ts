import type { ActivityLocationId } from '../households/types'

export type OrganizationId = string
export type OrganizationKind = string
export type OrganizationMemberRole = string
/** A group category is explicit state; it is never inferred from a social graph. */
export type OrganizationSpecialization = 'institution' | 'informal-group' | 'faction'
/** Engine-owned rules may be referenced by setting packs; they are not pack code. */
export const ORGANIZATION_SHARED_RULE_IDS = ['organization.rule.attendance.v1'] as const
export type OrganizationSharedRuleId = typeof ORGANIZATION_SHARED_RULE_IDS[number]
export const ORGANIZATION_PURPOSE_IDS = ['education'] as const
export const ORGANIZATION_DECISION_EFFECT_IDS = ['organization.effect.none.v1'] as const
export type OrganizationDecisionEffectId = typeof ORGANIZATION_DECISION_EFFECT_IDS[number]
export type OrganizationEvidenceFactorWeights = {
  relationshipSupportWeightPermille: number
  organizationReputationWeightPermille: number
  knowledgeWeightPermille: number
  persistenceWeightPermille: number
  knowledgeId?: KnowledgeId
}
/** Versioned setting data. It declares classification and initial-service
 * semantics, never automatic member effects, leadership, or reputation. */
export interface OrganizationDefinition {
  id: OrganizationKind
  name: string
  purposeIds: readonly string[]
  memberRoleIds: readonly OrganizationMemberRole[]
  sharedRuleIds: readonly string[]
  initialService: { location: 'settlement-anchor'; activityLocation: 'commons'; serviceCapacity: number }
  /** Defaults to institution for established packs. */
  specialization?: OrganizationSpecialization
  /** Omitted definitions never form or alter membership autonomously. */
  lifecycle?: {
    cadenceHours: number
    formation: { enabled: boolean; baseProbabilityPermille: number }
    membership: {
      enabled: boolean
      defaultRoleId: OrganizationMemberRole
      baseJoinProbabilityPermille: number
      baseRoleChangeProbabilityPermille: number
      baseLeaveProbabilityPermille: number
      roleChangeInterestThresholdPermille: number
    }
    /** Opt-in, bounded structural changes. No implicit faction clustering occurs. */
    evolution?: {
      cadenceHours: number
      maxTransitionsPerCadence: number
      /** Deterministic evidence thresholds; omitted values use conservative defaults. */
      minimumRelationshipPermille?: number
      minimumExposurePermille?: number
      minimumConflictPermille?: number
      schism?: { enabled: boolean; minimumMembers: number; splitPermille: number }
      merger?: { enabled: boolean; minimumSharedMembers: number }
      dissolution?: { enabled: boolean; maximumLivingMembers: number }
    }
  }
  /** Opt-in institutional property; omitted definitions retain no asset account. */
  assets?: { initialCurrencyUnits: number; initialGoods: Readonly<Record<string, number>> }
  /** Opt-in observer-specific evidence ledger; membership never creates entries. */
  reputation?: { enabled: boolean }
  /** Engine-owned, bounded leader selection. A leader role is separate from membership role mutation. */
  leadership?: {
    cadenceHours: number
    leaderRoleId: OrganizationMemberRole
    eligibleMemberRoleIds: readonly OrganizationMemberRole[]
    minimumAgeYears: number
    minimumScorePermille: number
    removalScorePermille: number
    maxCandidates: number
    factors: OrganizationEvidenceFactorWeights
  }
  /** Recurring bounded proposals interpreted only by the engine-owned decision operation. */
  decisionPolicies?: readonly OrganizationDecisionPolicy[]
}
export interface OrganizationAssetAccount { currencyUnits: number; goods: Record<string, number>; latestTransferTraces: OrganizationAssetTransferTrace[] }
export type OrganizationAssetParty = { kind: 'organization'; id: OrganizationId } | { kind: 'household'; id: string } | { kind: 'market'; id: string }
export interface OrganizationAssetTransferTrace { sequence: number; tick: number; from: OrganizationAssetParty; to: OrganizationAssetParty; asset: 'currency' | 'good'; goodId?: string; amount: number; previousFromAmount: number; previousToAmount: number; nextFromAmount: number; nextToAmount: number; reason: string }
export type OrganizationReputationObserver = { kind: 'person' | 'organization'; id: string }
export type OrganizationReputationSource = 'service' | 'exchange' | 'member-conduct' | 'relationship'
export interface OrganizationReputationObservation { sequence: number; tick: number; observer: OrganizationReputationObserver; source: OrganizationReputationSource; causalEventId: string; previousValuePermille: number; deltaPermille: number; valuePermille: number }
export interface OrganizationReputationCurrent { observer: OrganizationReputationObserver; valuePermille: number; lastObservationSequence: number; lastObservedTick: number }
export interface OrganizationReputationLedger { nextObservationSequence: number; observations: OrganizationReputationObservation[]; currentByObserver: OrganizationReputationCurrent[] }
export interface OrganizationLeadershipCandidateEvidence { personId: string; memberRoleId: string; relationshipSupportPermille: number; organizationReputationPermille: number; knowledgePermille: number; persistencePermille: number; finalScorePermille: number }
export type OrganizationLeadershipOutcome = 'selected' | 'removed' | 'succeeded' | 'no-eligible-leader'
export interface OrganizationLeadershipTrace { sequence: number; tick: number; roleId: string; outcome: OrganizationLeadershipOutcome; previousLeaderPersonId?: string; selectedLeaderPersonId?: string; contested: boolean; candidates: OrganizationLeadershipCandidateEvidence[]; reason: string }
export interface OrganizationLeadershipState { nextTraceSequence: number; leaderPersonId?: string; roleId: string; termStartedTick?: number; latestTraces: OrganizationLeadershipTrace[] }
export type OrganizationDecisionPreference = 'higher-member-evidence' | 'lower-member-evidence' | 'neutral'
export interface OrganizationDecisionAlternativeDefinition { id: string; baseScorePermille: number; preference: OrganizationDecisionPreference; authorizedEffectIds: readonly OrganizationDecisionEffectId[] }
export interface OrganizationDecisionPolicy { id: string; cadenceHours: number; resolutionDelayHours: number; participantRoleIds: readonly OrganizationMemberRole[]; maxParticipants: number; factors: OrganizationEvidenceFactorWeights; alternatives: readonly OrganizationDecisionAlternativeDefinition[] }
export interface OrganizationDecisionParticipant { personId: string; memberRoleId: OrganizationMemberRole }
export interface OrganizationDecisionProposal { sequence: number; policyId: string; proposedTick: number; resolvesAtTick: number; participantIds: string[]; participantRoles: OrganizationDecisionParticipant[]; alternatives: string[] }
export interface OrganizationDecisionContribution { participantId: string; relationshipSupportPermille: number; organizationReputationPermille: number; knowledgePermille: number; persistencePermille: number; evidenceScorePermille: number; alternativeScores: { alternativeId: string; scorePermille: number }[] }
export interface OrganizationDecisionAlternativeResult { alternativeId: string; finalScorePermille: number; probabilityPermille: number }
export interface OrganizationDecisionResolution { sequence: number; proposalSequence: number; policyId: string; proposedTick: number; resolvedTick: number; participantIds: string[]; participantRoles: OrganizationDecisionParticipant[]; factors: OrganizationEvidenceFactorWeights; contributions: OrganizationDecisionContribution[]; alternatives: OrganizationDecisionAlternativeResult[]; rngStream: 'organization.decisions'; randomRollPermille: number; selectedAlternativeId: string; authorizedEffectIds: OrganizationDecisionEffectId[] }
export interface OrganizationDecisionState { nextProposalSequence: number; pending: OrganizationDecisionProposal[]; latestResolutions: OrganizationDecisionResolution[] }
export interface OrganizationMember { personId: string; role: OrganizationMemberRole }
export type OrganizationMembershipChange = 'joined' | 'role-changed' | 'left'
export type OrganizationLifecycleRejection = 'disabled' | 'insufficient-activity' | 'already-member' | 'no-relationship' | 'no-role' | 'probability' | 'invalid-transition'
export interface OrganizationLifecycleFactors { activityPermille: number; proximityPermille: number; relationshipPermille: number; interestPermille: number; exposurePermille: number }
export interface OrganizationFormationTrace { sequence: number; tick: number; kindId: string; candidatePersonIds: string[]; locationCellId: string; baseProbabilityPermille: number; factors: OrganizationLifecycleFactors; finalProbabilityPermille: number; rngStream?: string; randomRollPermille?: number; formed: boolean; rejectionReason?: OrganizationLifecycleRejection; organizationId?: string }
export interface OrganizationMembershipTrace { sequence: number; tick: number; organizationId: string; personId: string; change: OrganizationMembershipChange; previousRoleId?: string; nextRoleId?: string; baseProbabilityPermille: number; factors: OrganizationLifecycleFactors; finalProbabilityPermille: number; rngStream?: string; randomRollPermille?: number; selected: boolean; rejectionReason?: OrganizationLifecycleRejection }
export type OrganizationTransitionKind = 'schism' | 'merger' | 'dissolution'
export interface OrganizationResourceReconciliation { organizationId: string; currencyUnits: number; goods: Record<string, number> }
export interface OrganizationMembershipReconciliation { organizationId: string; members: OrganizationMember[] }
/** Exact bounded evidence; absence of a modeled identity is never a membership-derived identity. */
export interface OrganizationTransitionTrace {
  sequence: number; tick: number; kind: OrganizationTransitionKind; selected: boolean
  sourceOrganizationIds: string[]; resultOrganizationIds: string[]; memberIds: string[]
  evidence: { livingMemberCount: number; sharedMemberCount: number; relationshipEvidenceCount: number; relationshipPermille: number; exposurePermille: number; interestPermille: number; reputationPermille?: number; conflictPermille: number; resourcePressurePermille: number; decisionSequence?: number }
  membershipsBefore: OrganizationMembershipReconciliation[]; membershipsAfter: OrganizationMembershipReconciliation[]
  resourcesBefore: OrganizationResourceReconciliation[]; resourceReconciliation: OrganizationResourceReconciliation[]
  reason: string
}
export interface OrganizationLifecycleState { nextOrganizationSequence: number; nextTraceSequence: number; latestFormationTraces: OrganizationFormationTrace[]; latestMembershipTraces: OrganizationMembershipTrace[]; /** Absent only in pre-#143 fixtures; restored snapshots are upgraded. */ latestTransitionTraces?: OrganizationTransitionTrace[] }
/** Persistent coordinated group; membership is not a trait, belief, or attitude assignment. */
export interface OrganizationState {
  id: OrganizationId
  name: string
  kind: OrganizationKind
  specialization?: OrganizationSpecialization
  status?: 'active' | 'dissolved'
  closedMembership?: { tick: number; members: OrganizationMember[] }
  lineage?: { origin: 'initial' | 'formation' | 'schism' | 'merger'; parentOrganizationIds: string[]; formedTick: number }
  locationCellId: string
  activityLocationId: ActivityLocationId
  members: OrganizationMember[]
  /** Maximum learners receiving this location-bound service in one scheduled window. */
  serviceCapacity: number
  sharedRuleIds: string[]
  /** Institution-owned holdings, never inferred from members or leaders. */
  assets?: OrganizationAssetAccount
  /** Explicit observer evidence, never a global score. */
  reputationLedger?: OrganizationReputationLedger
  /** Explicit pack-authorized office, never inferred from membership alone. */
  leadership?: OrganizationLeadershipState
  /** Bounded proposals and resolutions; effects remain authorizations for owning subsystems. */
  decisions?: OrganizationDecisionState
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
