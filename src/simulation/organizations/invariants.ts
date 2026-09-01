import type { SimulationState } from '../domain/types'
import type { OrganizationDefinition, OrganizationMembershipTrace } from './types'
import { failCanonicalValidation as fail } from '../validation/error'
import { ORGANIZATION_LIFECYCLE_STREAM, ORGANIZATION_LIFECYCLE_TRACE_LIMIT } from './lifecycle'
import { ORGANIZATION_ASSET_TRACE_LIMIT, ORGANIZATION_REPUTATION_OBSERVATION_LIMIT } from './ledger'

/** Canonical validation owned by the organization subsystem. */
export function validateOrganizationState(state: SimulationState, definitions: ReadonlyMap<string, OrganizationDefinition>): void {
  const ids = new Set(state.organizations.map((organization) => organization.id))
  if (ids.size !== state.organizations.length || state.organizations.some((organization, index) => index > 0 && state.organizations[index - 1]!.id >= organization.id)) fail('organizations', 'state.organizations', 'identity-or-ordering', 'Organizations are not uniquely canonically ordered')
  const cellsById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
  const locationsById = new Map(state.activityLocations.map((location) => [location.id, location]))
  const personIds = new Set(state.people.map((person) => person.id))
  for (const organization of state.organizations) {
    const definition = definitions.get(organization.kind)
    if (!definition) fail('organizations', `state.organizations.${organization.id}.kind`, 'kind', `Organization ${organization.id} has unknown kind`)
    if (organization.members.some((member, index) => !definition.memberRoleIds.includes(member.role) || (index > 0 && organization.members[index - 1]!.personId === member.personId))) fail('organizations', `state.organizations.${organization.id}.members`, 'member-role', `Organization ${organization.id} has invalid member role`)
    if (!cellsById.get(organization.locationCellId)?.movementCost || locationsById.get(organization.activityLocationId)?.cellId !== organization.locationCellId || organization.members.some((member, index) => !personIds.has(member.personId) || (index > 0 && organization.members[index - 1]!.personId >= member.personId))) fail('organizations', `state.organizations.${organization.id}`, 'member-or-location-reference', `Organization ${organization.id} has invalid members or location`)
    if (!Number.isSafeInteger(organization.serviceCapacity) || organization.serviceCapacity < 1) fail('organizations', `state.organizations.${organization.id}.serviceCapacity`, 'capacity', `Organization ${organization.id} has invalid service capacity`)
    if (organization.sharedRuleIds.length !== definition.sharedRuleIds.length || organization.sharedRuleIds.some((id, index) => id !== definition.sharedRuleIds[index])) fail('organizations', `state.organizations.${organization.id}.sharedRuleIds`, 'shared-rules', `Organization ${organization.id} does not match its defined rules`)
    if (Boolean(organization.assets) !== Boolean(definition.assets) || organization.assets && (!Number.isSafeInteger(organization.assets.currencyUnits) || organization.assets.currencyUnits < 0 || organization.assets.latestTransferTraces.length > ORGANIZATION_ASSET_TRACE_LIMIT || Object.values(organization.assets.goods).some((value) => !Number.isSafeInteger(value) || value < 0) || !validAssetTraces(organization.assets.latestTransferTraces))) fail('organizations', `state.organizations.${organization.id}.assets`, 'asset-account', `Organization ${organization.id} has an invalid owned asset account`)
    if (Boolean(organization.reputationLedger) !== Boolean(definition.reputation?.enabled) || organization.reputationLedger && (!Number.isSafeInteger(organization.reputationLedger.nextObservationSequence) || organization.reputationLedger.nextObservationSequence < 1 || organization.reputationLedger.observations.length > ORGANIZATION_REPUTATION_OBSERVATION_LIMIT || !validReputationLedger(organization.reputationLedger))) fail('organizations', `state.organizations.${organization.id}.reputationLedger`, 'reputation-ledger', `Organization ${organization.id} has invalid reputation evidence`)
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

function validAssetTraces(traces: NonNullable<SimulationState['organizations'][number]['assets']>['latestTransferTraces']): boolean {
  return traces.every((trace, index) => Number.isSafeInteger(trace.sequence) && trace.sequence >= 1 && (index === 0 || traces[index - 1]!.sequence < trace.sequence)
    && Number.isSafeInteger(trace.tick) && trace.tick >= 0 && trace.from.id.length > 0 && trace.to.id.length > 0 && (trace.from.kind !== trace.to.kind || trace.from.id !== trace.to.id)
    && (trace.from.kind === 'organization' || trace.from.kind === 'household' || trace.from.kind === 'market') && (trace.to.kind === 'organization' || trace.to.kind === 'household' || trace.to.kind === 'market')
    && (trace.asset === 'currency' || trace.asset === 'good') && (trace.asset === 'currency' ? trace.goodId === undefined : typeof trace.goodId === 'string' && trace.goodId.length > 0)
    && Number.isSafeInteger(trace.amount) && trace.amount > 0 && [trace.previousFromAmount, trace.previousToAmount, trace.nextFromAmount, trace.nextToAmount].every((value) => Number.isSafeInteger(value) && value >= 0)
    && trace.nextFromAmount === trace.previousFromAmount - trace.amount && trace.nextToAmount === trace.previousToAmount + trace.amount && trace.reason.length > 0)
}

function validReputationLedger(ledger: NonNullable<SimulationState['organizations'][number]['reputationLedger']>): boolean {
  const seen = new Set<string>()
  return ledger.observations.every((entry, index) => {
    const key = `${entry.observer.kind}:${entry.observer.id}:${entry.sequence}`
    const valid = Number.isSafeInteger(entry.sequence) && entry.sequence >= 1 && (index === 0 || ledger.observations[index - 1]!.sequence < entry.sequence)
      && Number.isSafeInteger(entry.tick) && entry.tick >= 0 && (entry.observer.kind === 'person' || entry.observer.kind === 'organization') && entry.observer.id.length > 0
      && ['service', 'exchange', 'member-conduct', 'relationship'].includes(entry.source) && entry.causalEventId.length > 0
      && [entry.previousValuePermille, entry.deltaPermille, entry.valuePermille].every(Number.isSafeInteger) && entry.previousValuePermille >= 0 && entry.previousValuePermille <= 1000 && entry.deltaPermille >= -1000 && entry.deltaPermille <= 1000 && entry.valuePermille === Math.max(0, Math.min(1000, entry.previousValuePermille + entry.deltaPermille))
    if (seen.has(key)) return false
    seen.add(key)
    return valid
  }) && ledger.observations.every((entry) => entry.sequence < ledger.nextObservationSequence)
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
