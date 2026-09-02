import type { SimulationState } from '../domain/types'
import type { OrganizationDefinition, OrganizationMembershipTrace } from './types'
import { failCanonicalValidation as fail } from '../validation/error'
import { ORGANIZATION_LIFECYCLE_STREAM, ORGANIZATION_LIFECYCLE_TRACE_LIMIT } from './lifecycle'
import { ORGANIZATION_ASSET_TRACE_LIMIT, ORGANIZATION_REPUTATION_OBSERVATION_LIMIT, ORGANIZATION_REPUTATION_OBSERVER_LIMIT } from './ledger'
import { ORGANIZATION_DECISION_HISTORY_LIMIT, ORGANIZATION_DECISION_STREAM, ORGANIZATION_LEADERSHIP_TRACE_LIMIT } from './governance'

/** Canonical validation owned by the organization subsystem. */
export function validateOrganizationState(state: SimulationState, definitions: ReadonlyMap<string, OrganizationDefinition>): void {
  const ids = new Set(state.organizations.map((organization) => organization.id))
  if (ids.size !== state.organizations.length || state.organizations.some((organization, index) => index > 0 && state.organizations[index - 1]!.id >= organization.id)) fail('organizations', 'state.organizations', 'identity-or-ordering', 'Organizations are not uniquely canonically ordered')
  const cellsById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
  const locationsById = new Map(state.activityLocations.map((location) => [location.id, location]))
  const personIds = new Set(state.people.map((person) => person.id))
  const householdIds = new Set(state.households.map((household) => household.id))
  const marketIds = new Set(state.markets.map((market) => market.id))
  for (const organization of state.organizations) {
    const definition = definitions.get(organization.kind)
    if (!definition) fail('organizations', `state.organizations.${organization.id}.kind`, 'kind', `Organization ${organization.id} has unknown kind`)
    if (organization.members.some((member, index) => !definition.memberRoleIds.includes(member.role) || (index > 0 && organization.members[index - 1]!.personId === member.personId))) fail('organizations', `state.organizations.${organization.id}.members`, 'member-role', `Organization ${organization.id} has invalid member role`)
    if (!cellsById.get(organization.locationCellId)?.movementCost || locationsById.get(organization.activityLocationId)?.cellId !== organization.locationCellId || organization.members.some((member, index) => !personIds.has(member.personId) || (index > 0 && organization.members[index - 1]!.personId >= member.personId))) fail('organizations', `state.organizations.${organization.id}`, 'member-or-location-reference', `Organization ${organization.id} has invalid members or location`)
    if (!Number.isSafeInteger(organization.serviceCapacity) || organization.serviceCapacity < 1) fail('organizations', `state.organizations.${organization.id}.serviceCapacity`, 'capacity', `Organization ${organization.id} has invalid service capacity`)
    if (organization.sharedRuleIds.length !== definition.sharedRuleIds.length || organization.sharedRuleIds.some((id, index) => id !== definition.sharedRuleIds[index])) fail('organizations', `state.organizations.${organization.id}.sharedRuleIds`, 'shared-rules', `Organization ${organization.id} does not match its defined rules`)
    const assetAndReputationEnabled = state.config.organizationAssetReputationModelVersion === 1
    if (Boolean(organization.assets) !== (assetAndReputationEnabled && Boolean(definition.assets)) || organization.assets && !validAssetAccount(organization.assets, organization.id, ids, householdIds, marketIds)) fail('organizations', `state.organizations.${organization.id}.assets`, 'asset-account', `Organization ${organization.id} has an invalid owned asset account`)
    if (Boolean(organization.reputationLedger) !== (assetAndReputationEnabled && Boolean(definition.reputation?.enabled)) || organization.reputationLedger && (!Number.isSafeInteger(organization.reputationLedger.nextObservationSequence) || organization.reputationLedger.nextObservationSequence < 1 || organization.reputationLedger.observations.length > ORGANIZATION_REPUTATION_OBSERVATION_LIMIT || !validReputationLedger(organization.reputationLedger, personIds, ids))) fail('organizations', `state.organizations.${organization.id}.reputationLedger`, 'reputation-ledger', `Organization ${organization.id} has invalid reputation evidence`)
    const governanceEnabled = state.config.organizationLeadershipDecisionModelVersion === 1
    if (Boolean(organization.leadership) !== (governanceEnabled && Boolean(definition.leadership)) || organization.leadership && !validLeadership(organization, definition, personIds, state.tick)) fail('organizations', `state.organizations.${organization.id}.leadership`, 'leadership', `Organization ${organization.id} has invalid leadership state`)
    if (Boolean(organization.decisions) !== (governanceEnabled && Boolean(definition.decisionPolicies?.length)) || organization.decisions && !validDecisions(organization, definition, personIds, state.tick)) fail('organizations', `state.organizations.${organization.id}.decisions`, 'decisions', `Organization ${organization.id} has invalid decision state`)
  }
  const lifecycle = state.organizationLifecycle
  if (!Number.isSafeInteger(lifecycle.nextOrganizationSequence) || lifecycle.nextOrganizationSequence < 1) fail('organizations', 'state.organizationLifecycle.nextOrganizationSequence', 'sequence', 'Organization lifecycle sequence is invalid')
  if (!Number.isSafeInteger(lifecycle.nextTraceSequence) || lifecycle.nextTraceSequence < 1) fail('organizations', 'state.organizationLifecycle.nextTraceSequence', 'trace-sequence', 'Organization lifecycle trace sequence is invalid')
  if (lifecycle.latestFormationTraces.length > ORGANIZATION_LIFECYCLE_TRACE_LIMIT || lifecycle.latestMembershipTraces.length > ORGANIZATION_LIFECYCLE_TRACE_LIMIT) fail('organizations', 'state.organizationLifecycle', 'trace-limit', 'Organization lifecycle trace history exceeds its bound')
  const generatedSequences = state.organizations.map((organization) => /^organization\..+\.(\d{6,})$/.exec(organization.id)?.[1]).filter((sequence): sequence is string => sequence !== undefined).map(Number)
  if (generatedSequences.some((sequence) => sequence >= lifecycle.nextOrganizationSequence)) fail('organizations', 'state.organizationLifecycle.nextOrganizationSequence', 'sequence-collision', 'Organization lifecycle sequence could collide with an existing organization')
  if (lifecycle.latestFormationTraces.some((trace, index) => !validTraceNumbers(trace) || (index > 0 && lifecycle.latestFormationTraces[index - 1]!.sequence >= trace.sequence))) fail('organizations', 'state.organizationLifecycle.latestFormationTraces', 'trace-ordering', 'Organization formation traces are invalid')
  if (lifecycle.latestMembershipTraces.some((trace, index) => !validTraceNumbers(trace) || (index > 0 && lifecycle.latestMembershipTraces[index - 1]!.sequence >= trace.sequence))) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'trace-ordering', 'Organization membership traces are invalid')
  const traceSequences = [...lifecycle.latestFormationTraces, ...lifecycle.latestMembershipTraces].map((trace) => trace.sequence)
  if (new Set(traceSequences).size !== traceSequences.length || traceSequences.some((sequence) => sequence >= lifecycle.nextTraceSequence)) fail('organizations', 'state.organizationLifecycle.nextTraceSequence', 'trace-sequence-collision', 'Organization lifecycle trace sequence could collide with retained evidence')
  for (const trace of lifecycle.latestFormationTraces) {
    const definition = definitions.get(trace.kindId)
    const candidatesOrdered = trace.candidatePersonIds.every((personId, index) => index === 0 || trace.candidatePersonIds[index - 1]! < personId)
    if (!definition?.lifecycle?.formation.enabled || !cellsById.has(trace.locationCellId) || !Array.isArray(trace.candidatePersonIds) || !candidatesOrdered || trace.candidatePersonIds.some((personId) => !personIds.has(personId)) || typeof trace.formed !== 'boolean' || !validLifecycleReason(trace.rejectionReason) || !coherentOutcome(trace.formed, trace.rejectionReason, trace.finalProbabilityPermille, trace.rngStream, trace.randomRollPermille) || (trace.formed ? !trace.organizationId || trace.candidatePersonIds.length !== 2 : trace.organizationId !== undefined)) fail('organizations', 'state.organizationLifecycle.latestFormationTraces', 'formation-schema', 'Organization formation trace is invalid')
    if (trace.formed) { const organization = state.organizations.find((candidate) => candidate.id === trace.organizationId); if (!organization || organization.kind !== trace.kindId || organization.locationCellId !== trace.locationCellId) fail('organizations', 'state.organizationLifecycle.latestFormationTraces', 'organization-reference', 'Organization formation trace does not match its organization') }
  }
  for (const trace of lifecycle.latestMembershipTraces) {
    const organization = state.organizations.find((candidate) => candidate.id === trace.organizationId)
    const definition = organization ? definitions.get(organization.kind) : undefined
    const validRole = (role: unknown): role is string => typeof role === 'string' && Boolean(definition?.memberRoleIds.includes(role))
    const validTransition = trace.change === 'joined' ? trace.previousRoleId === undefined && validRole(trace.nextRoleId) : trace.change === 'role-changed' ? validRole(trace.previousRoleId) && validRole(trace.nextRoleId) && trace.previousRoleId !== trace.nextRoleId : trace.change === 'left' ? validRole(trace.previousRoleId) && trace.nextRoleId === undefined : false
    if (!organization || !definition?.lifecycle?.membership.enabled || !personIds.has(trace.personId) || typeof trace.selected !== 'boolean' || !validLifecycleReason(trace.rejectionReason) || !coherentOutcome(trace.selected, trace.rejectionReason, trace.finalProbabilityPermille, trace.rngStream, trace.randomRollPermille) || !validTransition) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'membership-reference', 'Organization membership trace is invalid')
  }
  validateMembershipHistory(state.organizations, lifecycle.latestMembershipTraces)
}

function validLeadership(organization: SimulationState['organizations'][number], definition: OrganizationDefinition, personIds: ReadonlySet<string>, stateTick: number): boolean {
  const state = organization.leadership
  const policy = definition.leadership
  if (!state || !policy || state.roleId !== policy.leaderRoleId || !Number.isSafeInteger(state.nextTraceSequence) || state.nextTraceSequence < 1 || state.latestTraces.length > ORGANIZATION_LEADERSHIP_TRACE_LIMIT) return false
  if (state.leaderPersonId !== undefined && (!personIds.has(state.leaderPersonId) || !organization.members.some((member) => member.personId === state.leaderPersonId && policy.eligibleMemberRoleIds.includes(member.role)) || !Number.isSafeInteger(state.termStartedTick) || state.termStartedTick! < 0 || state.termStartedTick! > stateTick)) return false
  if (state.leaderPersonId === undefined && state.termStartedTick !== undefined) return false
  return state.latestTraces.every((trace, index) => Number.isSafeInteger(trace.sequence) && trace.sequence >= 1 && trace.sequence < state.nextTraceSequence && (index === 0 || state.latestTraces[index - 1]!.sequence < trace.sequence)
    && Number.isSafeInteger(trace.tick) && trace.tick >= 0 && trace.tick <= stateTick && trace.roleId === policy.leaderRoleId && ['selected', 'removed', 'succeeded', 'no-eligible-leader'].includes(trace.outcome) && typeof trace.contested === 'boolean' && trace.reason.length > 0
    && trace.candidates.length <= policy.maxCandidates && trace.candidates.every((candidate, candidateIndex) => personIds.has(candidate.personId) && policy.eligibleMemberRoleIds.includes(candidate.memberRoleId) && [candidate.relationshipSupportPermille, candidate.organizationReputationPermille, candidate.knowledgePermille, candidate.persistencePermille, candidate.finalScorePermille].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 1000) && (candidateIndex === 0 || trace.candidates[candidateIndex - 1]!.finalScorePermille > candidate.finalScorePermille || trace.candidates[candidateIndex - 1]!.finalScorePermille === candidate.finalScorePermille && trace.candidates[candidateIndex - 1]!.personId < candidate.personId))
    && (trace.selectedLeaderPersonId === undefined || trace.candidates.some((candidate) => candidate.personId === trace.selectedLeaderPersonId)))
}

function validDecisions(organization: SimulationState['organizations'][number], definition: OrganizationDefinition, personIds: ReadonlySet<string>, stateTick: number): boolean {
  const state = organization.decisions
  const policies = definition.decisionPolicies
  if (!state || !policies || !Number.isSafeInteger(state.nextProposalSequence) || state.nextProposalSequence < 1 || state.latestResolutions.length > ORGANIZATION_DECISION_HISTORY_LIMIT || state.pending.length > policies.length) return false
  const policyById = new Map(policies.map((policy) => [policy.id, policy]))
  const proposalSequences = [...state.pending.map((entry) => entry.sequence), ...state.latestResolutions.map((entry) => entry.proposalSequence)]
  if (new Set(proposalSequences).size !== proposalSequences.length || proposalSequences.some((sequence) => !Number.isSafeInteger(sequence) || sequence < 1 || sequence >= state.nextProposalSequence)) return false
  if (!state.pending.every((proposal, index) => {
    const policy = policyById.get(proposal.policyId)
    return policy && (index === 0 || state.pending[index - 1]!.resolvesAtTick < proposal.resolvesAtTick || state.pending[index - 1]!.resolvesAtTick === proposal.resolvesAtTick && state.pending[index - 1]!.sequence < proposal.sequence)
      && Number.isSafeInteger(proposal.proposedTick) && Number.isSafeInteger(proposal.resolvesAtTick) && proposal.proposedTick >= 0 && proposal.proposedTick <= stateTick && proposal.resolvesAtTick === proposal.proposedTick + policy.resolutionDelayHours
      && proposal.participantIds.length <= policy.maxParticipants && proposal.participantRoles.length === proposal.participantIds.length && proposal.participantIds.every((id, participantIndex) => personIds.has(id) && proposal.participantRoles[participantIndex]?.personId === id && policy.participantRoleIds.includes(proposal.participantRoles[participantIndex]!.memberRoleId) && (participantIndex === 0 || proposal.participantIds[participantIndex - 1]! < id))
      && proposal.alternatives.length === policy.alternatives.length && proposal.alternatives.every((id, alternativeIndex) => id === policy.alternatives[alternativeIndex]!.id)
  })) return false
  return state.latestResolutions.every((resolution, index) => {
    const policy = policyById.get(resolution.policyId)
    return policy && (index === 0 || state.latestResolutions[index - 1]!.sequence < resolution.sequence) && validDecisionResolution(resolution, policy, personIds, stateTick)
  })
}

function validDecisionResolution(resolution: NonNullable<SimulationState['organizations'][number]['decisions']>['latestResolutions'][number], policy: NonNullable<OrganizationDefinition['decisionPolicies']>[number], personIds: ReadonlySet<string>, stateTick: number): boolean {
  if (!(matchesEvidenceFactors(resolution.factors, policy.factors)
      && resolution.sequence === resolution.proposalSequence && Number.isSafeInteger(resolution.proposedTick) && Number.isSafeInteger(resolution.resolvedTick) && resolution.resolvedTick >= resolution.proposedTick + policy.resolutionDelayHours && resolution.resolvedTick <= stateTick
      && resolution.rngStream === ORGANIZATION_DECISION_STREAM && Number.isSafeInteger(resolution.randomRollPermille) && resolution.randomRollPermille >= 0 && resolution.randomRollPermille < 1000
      && resolution.participantIds.length <= policy.maxParticipants && resolution.participantRoles.length === resolution.participantIds.length && resolution.participantIds.every((id, participantIndex) => personIds.has(id) && resolution.participantRoles[participantIndex]?.personId === id && policy.participantRoleIds.includes(resolution.participantRoles[participantIndex]!.memberRoleId) && (participantIndex === 0 || resolution.participantIds[participantIndex - 1]! < id))
      && resolution.contributions.length === resolution.participantIds.length)) return false
  const totalWeight = policy.factors.relationshipSupportWeightPermille + policy.factors.organizationReputationWeightPermille + policy.factors.knowledgeWeightPermille + policy.factors.persistenceWeightPermille
  if (!resolution.contributions.every((contribution, contributionIndex) => {
    const values = [contribution.relationshipSupportPermille, contribution.organizationReputationPermille, contribution.knowledgePermille, contribution.persistencePermille, contribution.evidenceScorePermille]
    const expectedEvidence = Math.floor((contribution.relationshipSupportPermille * policy.factors.relationshipSupportWeightPermille + contribution.organizationReputationPermille * policy.factors.organizationReputationWeightPermille + contribution.knowledgePermille * policy.factors.knowledgeWeightPermille + contribution.persistencePermille * policy.factors.persistenceWeightPermille) / totalWeight)
    return contribution.participantId === resolution.participantIds[contributionIndex] && values.every(permille) && contribution.evidenceScorePermille === expectedEvidence
      && contribution.alternativeScores.length === policy.alternatives.length
      && contribution.alternativeScores.every((score, alternativeIndex) => {
        const alternative = policy.alternatives[alternativeIndex]!
        const preferred = alternative.preference === 'higher-member-evidence' ? expectedEvidence : alternative.preference === 'lower-member-evidence' ? 1000 - expectedEvidence : 500
        return score.alternativeId === alternative.id && score.scorePermille === Math.floor((alternative.baseScorePermille + preferred) / 2)
      })
  })) return false
  const expectedScores = policy.alternatives.map((alternative, alternativeIndex) => resolution.contributions.length === 0 ? alternative.baseScorePermille : Math.floor(resolution.contributions.reduce((sum, contribution) => sum + contribution.alternativeScores[alternativeIndex]!.scorePermille, 0) / resolution.contributions.length))
  const expectedProbabilities = normalizedProbabilities(expectedScores)
  if (resolution.alternatives.length !== policy.alternatives.length || !resolution.alternatives.every((alternative, index) => alternative.alternativeId === policy.alternatives[index]!.id && alternative.finalScorePermille === expectedScores[index] && alternative.probabilityPermille === expectedProbabilities[index])) return false
  let cumulative = 0
  const selectedIndex = expectedProbabilities.findIndex((probability) => { cumulative += probability; return resolution.randomRollPermille < cumulative })
  const selected = policy.alternatives[Math.max(0, selectedIndex)]!
  return resolution.selectedAlternativeId === selected.id && resolution.authorizedEffectIds.length === selected.authorizedEffectIds.length && resolution.authorizedEffectIds.every((effectId, index) => effectId === selected.authorizedEffectIds[index])
}

function matchesEvidenceFactors(actual: unknown, expected: NonNullable<OrganizationDefinition['leadership']>['factors']): boolean {
  if (!actual || typeof actual !== 'object') return false
  const value = actual as Record<string, unknown>
  return value.relationshipSupportWeightPermille === expected.relationshipSupportWeightPermille && value.organizationReputationWeightPermille === expected.organizationReputationWeightPermille && value.knowledgeWeightPermille === expected.knowledgeWeightPermille && value.persistenceWeightPermille === expected.persistenceWeightPermille && value.knowledgeId === expected.knowledgeId
}

function normalizedProbabilities(scores: readonly number[]): number[] {
  const total = scores.reduce((sum, score) => sum + score, 0)
  if (total === 0) { const base = Math.floor(1000 / scores.length); return scores.map((_, index) => index === scores.length - 1 ? 1000 - base * (scores.length - 1) : base) }
  let assigned = 0
  return scores.map((score, index) => { const probability = index === scores.length - 1 ? 1000 - assigned : Math.floor(score * 1000 / total); assigned += probability; return probability })
}

function permille(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000 }

function validAssetAccount(account: NonNullable<SimulationState['organizations'][number]['assets']>, organizationId: string, organizationIds: ReadonlySet<string>, householdIds: ReadonlySet<string>, marketIds: ReadonlySet<string>): boolean {
  const traces = account.latestTransferTraces
  if (!Number.isSafeInteger(account.currencyUnits) || account.currencyUnits < 0 || traces.length > ORGANIZATION_ASSET_TRACE_LIMIT || Object.values(account.goods).some((value) => !Number.isSafeInteger(value) || value < 0)) return false
  const partyExists = (party: { kind: string; id: string }): boolean => party.kind === 'organization' ? organizationIds.has(party.id) : party.kind === 'household' ? householdIds.has(party.id) : party.kind === 'market' && marketIds.has(party.id)
  if (!traces.every((trace, index) => Number.isSafeInteger(trace.sequence) && trace.sequence >= 1 && (index === 0 || traces[index - 1]!.sequence < trace.sequence)
    && Number.isSafeInteger(trace.tick) && trace.tick >= 0 && trace.from.id.length > 0 && trace.to.id.length > 0 && (trace.from.kind !== trace.to.kind || trace.from.id !== trace.to.id)
    && (trace.from.kind === 'organization' || trace.from.kind === 'household' || trace.from.kind === 'market') && (trace.to.kind === 'organization' || trace.to.kind === 'household' || trace.to.kind === 'market')
    && partyExists(trace.from) && partyExists(trace.to) && (trace.from.kind === 'organization' && trace.from.id === organizationId || trace.to.kind === 'organization' && trace.to.id === organizationId)
    && (trace.asset === 'currency' || trace.from.kind !== 'market' && trace.to.kind !== 'market')
    && (trace.asset === 'currency' || trace.asset === 'good') && (trace.asset === 'currency' ? trace.goodId === undefined : typeof trace.goodId === 'string' && trace.goodId.length > 0)
    && Number.isSafeInteger(trace.amount) && trace.amount > 0 && [trace.previousFromAmount, trace.previousToAmount, trace.nextFromAmount, trace.nextToAmount].every((value) => Number.isSafeInteger(value) && value >= 0)
    && trace.nextFromAmount === trace.previousFromAmount - trace.amount && trace.nextToAmount === trace.previousToAmount + trace.amount && trace.reason.length > 0)) return false
  const latestByAsset = new Map<string, (typeof traces)[number]>()
  for (const trace of traces) latestByAsset.set(trace.asset === 'currency' ? 'currency' : trace.goodId!, trace)
  return [...latestByAsset.entries()].every(([assetId, trace]) => {
    const expected = trace.from.kind === 'organization' && trace.from.id === organizationId ? trace.nextFromAmount : trace.nextToAmount
    return (assetId === 'currency' ? account.currencyUnits : account.goods[assetId] ?? 0) === expected
  })
}

function validReputationLedger(ledger: NonNullable<SimulationState['organizations'][number]['reputationLedger']>, personIds: ReadonlySet<string>, organizationIds: ReadonlySet<string>): boolean {
  const seen = new Set<string>()
  return ledger.observations.every((entry, index) => {
    const key = `${entry.observer.kind}:${entry.observer.id}:${entry.sequence}`
    const valid = Number.isSafeInteger(entry.sequence) && entry.sequence >= 1 && (index === 0 || ledger.observations[index - 1]!.sequence < entry.sequence)
      && Number.isSafeInteger(entry.tick) && entry.tick >= 0 && (entry.observer.kind === 'person' ? personIds.has(entry.observer.id) : entry.observer.kind === 'organization' && organizationIds.has(entry.observer.id))
      && ['service', 'exchange', 'member-conduct', 'relationship'].includes(entry.source) && entry.causalEventId.length > 0
      && [entry.previousValuePermille, entry.deltaPermille, entry.valuePermille].every(Number.isSafeInteger) && entry.previousValuePermille >= 0 && entry.previousValuePermille <= 1000 && entry.deltaPermille >= -1000 && entry.deltaPermille <= 1000 && entry.valuePermille === Math.max(0, Math.min(1000, entry.previousValuePermille + entry.deltaPermille))
    if (seen.has(key)) return false
    seen.add(key)
    return valid
  }) && ledger.observations.every((entry) => entry.sequence < ledger.nextObservationSequence)
    && (ledger.observations.length === 0 ? ledger.nextObservationSequence === 1 : ledger.nextObservationSequence === ledger.observations.at(-1)!.sequence + 1)
    && ledger.currentByObserver.length <= ORGANIZATION_REPUTATION_OBSERVER_LIMIT
    && ledger.currentByObserver.every((entry, index) => (entry.observer.kind === 'person' ? personIds.has(entry.observer.id) : entry.observer.kind === 'organization' && organizationIds.has(entry.observer.id))
      && Number.isSafeInteger(entry.valuePermille) && entry.valuePermille >= 0 && entry.valuePermille <= 1000 && Number.isSafeInteger(entry.lastObservationSequence) && entry.lastObservationSequence >= 1 && entry.lastObservationSequence < ledger.nextObservationSequence && Number.isSafeInteger(entry.lastObservedTick) && entry.lastObservedTick >= 0
      && (index === 0 || ledger.currentByObserver[index - 1]!.lastObservedTick < entry.lastObservedTick || ledger.currentByObserver[index - 1]!.lastObservedTick === entry.lastObservedTick && ledger.currentByObserver[index - 1]!.lastObservationSequence < entry.lastObservationSequence))
    && new Set(ledger.currentByObserver.map((entry) => `${entry.observer.kind}:${entry.observer.id}`)).size === ledger.currentByObserver.length
    && ledger.currentByObserver.every((current) => { const observation = ledger.observations.find((entry) => entry.sequence === current.lastObservationSequence); return observation?.observer.kind === current.observer.kind && observation.observer.id === current.observer.id && observation.tick === current.lastObservedTick && observation.valuePermille === current.valuePermille })
}

function validTraceNumbers(trace: { sequence: unknown; tick: unknown; baseProbabilityPermille: unknown; finalProbabilityPermille: unknown; randomRollPermille?: unknown; factors: unknown }): boolean {
  const permille = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000
  if (!(typeof trace.sequence === 'number' && Number.isSafeInteger(trace.sequence) && trace.sequence >= 1)
    || !(typeof trace.tick === 'number' && Number.isSafeInteger(trace.tick) && trace.tick >= 0)
    || ![trace.baseProbabilityPermille, trace.finalProbabilityPermille].every(permille)
    || trace.randomRollPermille !== undefined && !permille(trace.randomRollPermille)
    || !trace.factors || typeof trace.factors !== 'object') return false
  const factors = trace.factors as Record<string, unknown>
  return ['activityPermille', 'proximityPermille', 'relationshipPermille', 'interestPermille', 'exposurePermille'].every((name) => Number.isSafeInteger(factors[name]) && (factors[name] as number) >= 0 && (factors[name] as number) <= 1000)
}

function validLifecycleReason(reason: unknown): boolean { return reason === undefined || ['disabled', 'insufficient-activity', 'already-member', 'no-relationship', 'no-role', 'probability', 'invalid-transition'].includes(reason as string) }

function coherentOutcome(selected: boolean, reason: unknown, probability: number, stream: unknown, roll: unknown): boolean {
  const stochastic = stream === ORGANIZATION_LIFECYCLE_STREAM && typeof roll === 'number'
  if (selected) return reason === undefined && stochastic && roll < probability
  if (reason === 'probability') return stochastic && roll >= probability
  return reason !== undefined && probability === 0 && stream === undefined && roll === undefined
}

/** Reverse the retained suffix from current membership to prove that every
 * selected and rejected transition was possible at the point it was recorded. */
function validateMembershipHistory(organizations: SimulationState['organizations'], traces: readonly OrganizationMembershipTrace[]): void {
  const rolesByOrganization = new Map(organizations.map((organization) => [organization.id, new Map(organization.members.map((member) => [member.personId, member.role]))]))
  for (const trace of [...traces].sort((first, second) => second.sequence - first.sequence)) {
    const roles = rolesByOrganization.get(trace.organizationId)
    if (!roles) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'transition-history', 'Organization membership history references a missing organization')
    const currentRole = roles.get(trace.personId)
    if (!trace.selected) {
      const possible = trace.change === 'joined' ? currentRole === undefined : currentRole === trace.previousRoleId
      if (!possible) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'impossible-transition', 'Rejected organization membership transition was impossible')
      continue
    }
    if (trace.change === 'joined') {
      if (currentRole !== trace.nextRoleId) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'impossible-transition', 'Selected organization join was impossible')
      roles.delete(trace.personId)
    } else if (trace.change === 'role-changed') {
      if (currentRole !== trace.nextRoleId) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'impossible-transition', 'Selected organization role change was impossible')
      roles.set(trace.personId, trace.previousRoleId!)
    } else {
      if (currentRole !== undefined) fail('organizations', 'state.organizationLifecycle.latestMembershipTraces', 'impossible-transition', 'Selected organization leave was impossible')
      roles.set(trace.personId, trace.previousRoleId!)
    }
  }
}
