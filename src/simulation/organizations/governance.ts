import { compareStableText } from '../../shared/stableOrder'
import type { PersonState, RelationshipState } from '../domain/types'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { getPersonVariable } from '../variables/storage'
import type {
  OrganizationDecisionAlternativeDefinition,
  OrganizationDecisionContribution,
  OrganizationDecisionPolicy,
  OrganizationDecisionProposal,
  OrganizationDecisionResolution,
  OrganizationDecisionState,
  OrganizationDefinition,
  OrganizationEvidenceFactorWeights,
  OrganizationLeadershipCandidateEvidence,
  OrganizationLeadershipState,
  OrganizationLeadershipTrace,
  OrganizationState,
} from './types'

export const ORGANIZATION_LEADERSHIP_TRACE_LIMIT = 64
export const ORGANIZATION_DECISION_HISTORY_LIMIT = 64
export const ORGANIZATION_DECISION_STREAM = 'organization.decisions' as const

export function createOrganizationLeadershipState(definition: OrganizationDefinition): OrganizationLeadershipState | undefined {
  return definition.leadership ? { nextTraceSequence: 1, roleId: definition.leadership.leaderRoleId, latestTraces: [] } : undefined
}

export function createOrganizationDecisionState(definition: OrganizationDefinition): OrganizationDecisionState | undefined {
  return definition.decisionPolicies?.length ? { nextProposalSequence: 1, pending: [], latestResolutions: [] } : undefined
}

export interface OrganizationGovernanceOutcome {
  leadershipTraces: { organizationId: string; trace: OrganizationLeadershipTrace }[]
  proposals: { organizationId: string; proposal: OrganizationDecisionProposal }[]
  resolutions: { organizationId: string; resolution: OrganizationDecisionResolution }[]
}

/** Runs only engine-owned, pack-configured operations over bounded candidate sets. */
export function advanceOrganizationGovernance(input: {
  tick: number
  organizations: OrganizationState[]
  definitions: readonly OrganizationDefinition[]
  people: readonly PersonState[]
  relationships: readonly RelationshipState[]
  nextDecisionPermille: () => number
}): OrganizationGovernanceOutcome {
  const peopleById = new Map(input.people.map((person) => [person.id, person]))
  const relationshipsById = new Map(input.relationships.map((relationship) => [relationship.id, relationship]))
  const definitionsById = new Map(input.definitions.map((definition) => [definition.id, definition]))
  const result: OrganizationGovernanceOutcome = { leadershipTraces: [], proposals: [], resolutions: [] }
  for (const organization of [...input.organizations].sort((a, b) => compareStableText(a.id, b.id))) {
    const definition = definitionsById.get(organization.kind)
    if (!definition) continue
    if (definition.leadership && organization.leadership && input.tick % definition.leadership.cadenceHours === 0) {
      const traces = evaluateLeadership({ tick: input.tick, organization, definition, peopleById, relationshipsById })
      result.leadershipTraces.push(...traces.map((trace) => ({ organizationId: organization.id, trace })))
    }
    if (definition.decisionPolicies?.length && organization.decisions) {
      const decisionResult = advanceDecisions({ tick: input.tick, organization, policies: definition.decisionPolicies, peopleById, relationshipsById, nextPermille: input.nextDecisionPermille })
      result.proposals.push(...decisionResult.proposals.map((proposal) => ({ organizationId: organization.id, proposal })))
      result.resolutions.push(...decisionResult.resolutions.map((resolution) => ({ organizationId: organization.id, resolution })))
    }
  }
  return result
}

export function evaluateLeadership(input: {
  tick: number
  organization: OrganizationState
  definition: OrganizationDefinition
  peopleById: ReadonlyMap<string, PersonState>
  relationshipsById: ReadonlyMap<string, RelationshipState>
}): OrganizationLeadershipTrace[] {
  const policy = input.definition.leadership
  const state = input.organization.leadership
  if (!policy || !state) return []
  const eligibleMembers = input.organization.members
    .filter((member) => {
      const person = input.peopleById.get(member.personId)
      return policy.eligibleMemberRoleIds.includes(member.role) && person !== undefined && person.lifeStatus !== 'dead' && person.ageYears >= policy.minimumAgeYears
    })
    .sort((a, b) => compareStableText(a.personId, b.personId))
    .slice(0, policy.maxCandidates)
  const candidates = eligibleMembers.flatMap((member) => {
    const person = input.peopleById.get(member.personId)
    if (!person) return []
    return [candidateEvidence(input.organization, member.role, person, eligibleMembers.map((entry) => entry.personId), input.relationshipsById, policy.factors)]
  }).sort((a, b) => b.finalScorePermille - a.finalScorePermille || compareStableText(a.personId, b.personId))
  const traces: OrganizationLeadershipTrace[] = []
  const previousLeaderPersonId = state.leaderPersonId
  let removed = false
  if (previousLeaderPersonId) {
    const incumbent = candidates.find((candidate) => candidate.personId === previousLeaderPersonId)
    if (!incumbent || incumbent.finalScorePermille < policy.removalScorePermille) {
      state.leaderPersonId = undefined
      state.termStartedTick = undefined
      removed = true
      traces.push(recordLeadershipTrace(state, { tick: input.tick, roleId: policy.leaderRoleId, outcome: 'removed', previousLeaderPersonId, contested: false, candidates, reason: incumbent ? 'incumbent-below-removal-threshold' : 'incumbent-ineligible' }))
    } else return []
  }
  const selectable = candidates.filter((candidate) => candidate.finalScorePermille >= policy.minimumScorePermille && (!removed || candidate.personId !== previousLeaderPersonId))
  const selected = selectable[0]
  if (!selected) {
    traces.push(recordLeadershipTrace(state, { tick: input.tick, roleId: policy.leaderRoleId, outcome: 'no-eligible-leader', ...(previousLeaderPersonId ? { previousLeaderPersonId } : {}), contested: false, candidates, reason: candidates.length === 0 ? 'no-eligible-members' : 'no-candidate-met-threshold' }))
    return traces
  }
  state.leaderPersonId = selected.personId
  state.termStartedTick = input.tick
  traces.push(recordLeadershipTrace(state, { tick: input.tick, roleId: policy.leaderRoleId, outcome: removed ? 'succeeded' : 'selected', ...(previousLeaderPersonId ? { previousLeaderPersonId } : {}), selectedLeaderPersonId: selected.personId, contested: selectable.length > 1, candidates, reason: selectable.length > 1 ? 'highest-score-stable-tie-break' : 'only-qualified-candidate' }))
  return traces
}

function advanceDecisions(input: {
  tick: number
  organization: OrganizationState
  policies: readonly OrganizationDecisionPolicy[]
  peopleById: ReadonlyMap<string, PersonState>
  relationshipsById: ReadonlyMap<string, RelationshipState>
  nextPermille: () => number
}): { proposals: OrganizationDecisionProposal[]; resolutions: OrganizationDecisionResolution[] } {
  const state = input.organization.decisions!
  const policyById = new Map(input.policies.map((policy) => [policy.id, policy]))
  const proposals: OrganizationDecisionProposal[] = []
  const resolutions: OrganizationDecisionResolution[] = []
  for (const proposal of [...state.pending].sort((a, b) => a.resolvesAtTick - b.resolvesAtTick || a.sequence - b.sequence)) {
    if (proposal.resolvesAtTick > input.tick) continue
    const policy = policyById.get(proposal.policyId)
    if (!policy) continue
    const resolution = resolveDecision(input.organization, proposal, policy, input.peopleById, input.relationshipsById, input.tick, input.nextPermille())
    resolutions.push(resolution)
    state.latestResolutions = [...state.latestResolutions, resolution].slice(-ORGANIZATION_DECISION_HISTORY_LIMIT)
  }
  const resolvedSequences = new Set(resolutions.map((resolution) => resolution.proposalSequence))
  state.pending = state.pending.filter((proposal) => !resolvedSequences.has(proposal.sequence))
  for (const policy of [...input.policies].sort((a, b) => compareStableText(a.id, b.id))) {
    if (input.tick % policy.cadenceHours !== 0 || state.pending.some((proposal) => proposal.policyId === policy.id)) continue
    const participants = input.organization.members
      .filter((member) => policy.participantRoleIds.includes(member.role) && input.peopleById.get(member.personId)?.lifeStatus !== 'dead')
      .sort((a, b) => compareStableText(a.personId, b.personId))
      .slice(0, policy.maxParticipants)
    const proposal: OrganizationDecisionProposal = { sequence: state.nextProposalSequence++, policyId: policy.id, proposedTick: input.tick, resolvesAtTick: input.tick + policy.resolutionDelayHours, participantIds: participants.map((member) => member.personId), participantRoles: participants.map((member) => ({ personId: member.personId, memberRoleId: member.role })), alternatives: policy.alternatives.map((alternative) => alternative.id) }
    state.pending.push(proposal)
    state.pending.sort((a, b) => a.resolvesAtTick - b.resolvesAtTick || a.sequence - b.sequence)
    proposals.push(proposal)
  }
  return { proposals, resolutions }
}

function resolveDecision(organization: OrganizationState, proposal: OrganizationDecisionProposal, policy: OrganizationDecisionPolicy, peopleById: ReadonlyMap<string, PersonState>, relationshipsById: ReadonlyMap<string, RelationshipState>, tick: number, roll: number): OrganizationDecisionResolution {
  const currentRoleByPerson = new Map(organization.members.map((member) => [member.personId, member.role]))
  const participantRoles = proposal.participantIds.flatMap((personId) => {
    const memberRoleId = currentRoleByPerson.get(personId)
    return memberRoleId && policy.participantRoleIds.includes(memberRoleId) && peopleById.get(personId)?.lifeStatus !== 'dead' ? [{ personId, memberRoleId }] : []
  })
  const participantIds = participantRoles.map((participant) => participant.personId)
  const contributions = participantIds.map((participantId) => {
    const person = peopleById.get(participantId)!
    const evidence = memberEvidence(organization, person, participantIds, relationshipsById, policy.factors)
    return {
      participantId,
      ...evidence.factors,
      evidenceScorePermille: evidence.score,
      alternativeScores: policy.alternatives.map((alternative) => ({ alternativeId: alternative.id, scorePermille: alternativeScore(alternative, evidence.score) })),
    } satisfies OrganizationDecisionContribution
  })
  const scores = policy.alternatives.map((alternative) => ({ alternative, score: contributions.length === 0 ? alternative.baseScorePermille : Math.floor(contributions.reduce((sum, contribution) => sum + contribution.alternativeScores.find((entry) => entry.alternativeId === alternative.id)!.scorePermille, 0) / contributions.length) }))
  const probabilities = normalizedProbabilities(scores.map((entry) => entry.score))
  let cumulative = 0
  const selectedIndex = Math.max(0, probabilities.findIndex((probability) => { cumulative += probability; return roll < cumulative }))
  const selected = scores[selectedIndex] ?? scores[0]!
  return {
    sequence: proposal.sequence,
    proposalSequence: proposal.sequence,
    policyId: policy.id,
    proposedTick: proposal.proposedTick,
    resolvedTick: tick,
    participantIds,
    participantRoles,
    factors: { ...policy.factors },
    contributions,
    alternatives: scores.map((entry, index) => ({ alternativeId: entry.alternative.id, finalScorePermille: entry.score, probabilityPermille: probabilities[index]! })),
    rngStream: ORGANIZATION_DECISION_STREAM,
    randomRollPermille: roll,
    selectedAlternativeId: selected.alternative.id,
    authorizedEffectIds: [...selected.alternative.authorizedEffectIds],
  }
}

function candidateEvidence(organization: OrganizationState, memberRoleId: string, person: PersonState, peerIds: readonly string[], relationshipsById: ReadonlyMap<string, RelationshipState>, weights: OrganizationEvidenceFactorWeights): OrganizationLeadershipCandidateEvidence {
  const evidence = memberEvidence(organization, person, peerIds, relationshipsById, weights)
  return { personId: person.id, memberRoleId, ...evidence.factors, finalScorePermille: evidence.score }
}

function memberEvidence(organization: OrganizationState, person: PersonState, peerIds: readonly string[], relationshipsById: ReadonlyMap<string, RelationshipState>, weights: OrganizationEvidenceFactorWeights): { factors: Omit<OrganizationLeadershipCandidateEvidence, 'personId' | 'memberRoleId' | 'finalScorePermille'>; score: number } {
  const factors = {
    relationshipSupportPermille: relationshipSupport(person.id, peerIds, relationshipsById),
    organizationReputationPermille: organization.reputationLedger?.currentByObserver.find((entry) => entry.observer.kind === 'person' && entry.observer.id === person.id)?.valuePermille ?? 0,
    knowledgePermille: weights.knowledgeId ? person.knowledge?.[weights.knowledgeId] ?? 0 : 0,
    persistencePermille: getPersonVariable(person.variables, PERSON_VARIABLE_ID.persistence),
  }
  const totalWeight = weights.relationshipSupportWeightPermille + weights.organizationReputationWeightPermille + weights.knowledgeWeightPermille + weights.persistenceWeightPermille
  const weighted = factors.relationshipSupportPermille * weights.relationshipSupportWeightPermille
    + factors.organizationReputationPermille * weights.organizationReputationWeightPermille
    + factors.knowledgePermille * weights.knowledgeWeightPermille
    + factors.persistencePermille * weights.persistenceWeightPermille
  return { factors, score: totalWeight === 0 ? 0 : Math.floor(weighted / totalWeight) }
}

function relationshipSupport(candidateId: string, peerIds: readonly string[], relationshipsById: ReadonlyMap<string, RelationshipState>): number {
  const values = peerIds.filter((peerId) => peerId !== candidateId).flatMap((peerId) => {
    const relationship = relationshipsById.get(candidateId < peerId ? `${candidateId}|${peerId}` : `${peerId}|${candidateId}`)
    if (!relationship) return []
    const perspective = relationship.personAId === candidateId ? relationship.bToA : relationship.aToB
    return [Math.floor((perspective.trust + perspective.respect) / 2)]
  })
  return values.length === 0 ? 0 : Math.floor(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function alternativeScore(alternative: OrganizationDecisionAlternativeDefinition, evidenceScore: number): number {
  const preferred = alternative.preference === 'higher-member-evidence' ? evidenceScore : alternative.preference === 'lower-member-evidence' ? 1000 - evidenceScore : 500
  return Math.floor((alternative.baseScorePermille + preferred) / 2)
}

function normalizedProbabilities(scores: readonly number[]): number[] {
  const total = scores.reduce((sum, score) => sum + score, 0)
  if (total === 0) {
    const base = Math.floor(1000 / scores.length)
    return scores.map((_, index) => index === scores.length - 1 ? 1000 - base * (scores.length - 1) : base)
  }
  let assigned = 0
  return scores.map((score, index) => {
    const probability = index === scores.length - 1 ? 1000 - assigned : Math.floor(score * 1000 / total)
    assigned += probability
    return probability
  })
}

function recordLeadershipTrace(state: OrganizationLeadershipState, trace: Omit<OrganizationLeadershipTrace, 'sequence'>): OrganizationLeadershipTrace {
  const recorded = { ...trace, sequence: state.nextTraceSequence++ }
  state.latestTraces = [...state.latestTraces, recorded].slice(-ORGANIZATION_LEADERSHIP_TRACE_LIMIT)
  return recorded
}
