import type { SimulationState } from '../domain/types'
import type { OrganizationDefinition, OrganizationMembershipReconciliation, OrganizationResourceReconciliation, OrganizationTransitionTrace } from './types'
import { failCanonicalValidation as fail } from '../validation/error'

/** Validate retained structural conservation independently from its executor. */
export function validateEvolutionTraces(state: SimulationState, definitions: ReadonlyMap<string, OrganizationDefinition>): void {
  const orgs = new Map(state.organizations.map((org) => [org.id, org]))
  const people = new Set(state.people.map((person) => person.id))
  const traces = state.organizationLifecycle.latestTransitionTraces ?? []
  const invalid = () => fail('organizations', 'state.organizationLifecycle.latestTransitionTraces', 'transition-reconciliation', 'Organization structural reconciliation is invalid')
  const sortedIds = (ids: readonly string[]) => Array.isArray(ids) && ids.every((id, index) => typeof id === 'string' && (index === 0 || ids[index - 1]! < id))
  const validRosters = (entries: OrganizationMembershipReconciliation[]) => Array.isArray(entries) && sortedIds(entries.map((entry) => entry.organizationId)) && entries.every((entry) => orgs.has(entry.organizationId) && Array.isArray(entry.members) && entry.members.length <= 128 && sortedIds(entry.members.map((member) => member.personId)) && entry.members.every((member) => people.has(member.personId) && definitions.get(orgs.get(entry.organizationId)!.kind)!.memberRoleIds.includes(member.role)))
  const validAccounts = (entries: OrganizationResourceReconciliation[]) => Array.isArray(entries) && sortedIds(entries.map((entry) => entry.organizationId)) && entries.every((entry) => orgs.has(entry.organizationId) && Number.isSafeInteger(entry.currencyUnits) && entry.currencyUnits >= 0 && entry.goods && Object.keys(entry.goods).length <= 256 && Object.values(entry.goods).every((amount) => Number.isSafeInteger(amount) && amount >= 0))
  for (const [index, trace] of traces.entries()) {
    if (!Number.isSafeInteger(trace.sequence) || trace.sequence < 1 || !Number.isSafeInteger(trace.tick) || trace.tick < 0 || trace.tick > state.tick || (index > 0 && traces[index - 1]!.sequence >= trace.sequence)
      || !['schism', 'merger', 'dissolution'].includes(trace.kind) || typeof trace.selected !== 'boolean' || typeof trace.reason !== 'string' || !trace.reason
      || !sortedIds(trace.sourceOrganizationIds) || !sortedIds(trace.resultOrganizationIds) || !sortedIds(trace.memberIds)
      || trace.sourceOrganizationIds.length < 1 || trace.sourceOrganizationIds.length > 2 || [...trace.sourceOrganizationIds, ...trace.resultOrganizationIds].some((id) => !orgs.has(id))
      || !validRosters(trace.membershipsBefore) || !validRosters(trace.membershipsAfter) || !validAccounts(trace.resourcesBefore) || !validAccounts(trace.resourceReconciliation)) invalid()
    const scope = new Set([...trace.sourceOrganizationIds, ...trace.resultOrganizationIds])
    const assetIds = (ids: Iterable<string>) => [...ids].filter((id) => orgs.get(id)?.assets).sort()
    if (JSON.stringify(trace.resourcesBefore.map((entry) => entry.organizationId)) !== JSON.stringify(assetIds(trace.sourceOrganizationIds)) || JSON.stringify(trace.resourceReconciliation.map((entry) => entry.organizationId)) !== JSON.stringify(assetIds(scope))) invalid()
    if ([...trace.membershipsBefore, ...trace.resourcesBefore].some((entry) => !trace.sourceOrganizationIds.includes(entry.organizationId)) || [...trace.membershipsAfter, ...trace.resourceReconciliation].some((entry) => !scope.has(entry.organizationId))) invalid()
    if (trace.membershipsBefore.length !== trace.sourceOrganizationIds.length || trace.membershipsAfter.length !== scope.size) invalid()
    const before = memberUnion(trace.membershipsBefore); const after = memberUnion(trace.membershipsAfter)
    if (JSON.stringify([...before.keys()].sort()) !== JSON.stringify(trace.memberIds)) invalid()
    if (totals(trace.resourcesBefore) !== totals(trace.resourceReconciliation)) invalid()
    const evidence = trace.evidence
    if (!evidence || ['livingMemberCount', 'sharedMemberCount', 'relationshipEvidenceCount'].some((key) => !Number.isSafeInteger(evidence[key as keyof typeof evidence]) || (evidence[key as keyof typeof evidence] ?? -1) < 0)
      || ['relationshipPermille', 'exposurePermille', 'interestPermille', 'conflictPermille', 'resourcePressurePermille'].some((key) => !permille(evidence[key as keyof typeof evidence])) || (evidence.reputationPermille !== undefined && !permille(evidence.reputationPermille))) invalid()
    if (!trace.selected) {
      if (trace.resultOrganizationIds.length || JSON.stringify(trace.membershipsBefore) !== JSON.stringify(trace.membershipsAfter) || JSON.stringify(trace.resourcesBefore) !== JSON.stringify(trace.resourceReconciliation)) invalid()
      continue
    }
    const beforeCount = trace.membershipsBefore.reduce((sum, entry) => sum + entry.members.length, 0)
    const afterCount = trace.membershipsAfter.reduce((sum, entry) => sum + entry.members.length, 0)
    if (evidence.sharedMemberCount !== (trace.kind === 'merger' ? beforeCount - before.size : 0)) invalid()
    if (trace.kind === 'dissolution') {
      if (trace.sourceOrganizationIds.length !== 1 || trace.resultOrganizationIds.length || afterCount || orgs.get(trace.sourceOrganizationIds[0]!)!.status !== 'dissolved') invalid()
    } else {
      if (before.size !== after.size || [...before].some(([id, role]) => after.get(id) !== role)) invalid()
      if (trace.kind === 'schism') {
        if (trace.sourceOrganizationIds.length !== 1 || trace.resultOrganizationIds.length !== 2 || beforeCount !== afterCount || !trace.resultOrganizationIds.includes(trace.sourceOrganizationIds[0]!)) invalid()
      } else if (trace.sourceOrganizationIds.length !== 2 || trace.resultOrganizationIds.length !== 1 || trace.sourceOrganizationIds.some((id) => orgs.get(id)!.status !== 'dissolved')) invalid()
      const childId = trace.resultOrganizationIds.find((id) => !trace.sourceOrganizationIds.includes(id))
      const lineage = childId ? orgs.get(childId)?.lineage : undefined
      if (!lineage || lineage.origin !== trace.kind || lineage.formedTick !== trace.tick || JSON.stringify(lineage.parentOrganizationIds) !== JSON.stringify(trace.sourceOrganizationIds)) invalid()
    }
  }
  for (const org of state.organizations) {
    const closed = org.closedMembership
    if (org.status === 'dissolved') {
      if (org.members.length || org.leadership?.leaderPersonId || !closed || !Number.isSafeInteger(closed.tick) || closed.tick < 0 || closed.tick > state.tick || !validRosters([{ organizationId: org.id, members: closed.members }])) { invalid(); continue }
      const closingTrace = [...traces].reverse().find((trace) => trace.selected && trace.kind !== 'schism' && trace.sourceOrganizationIds.includes(org.id))
      const before = closingTrace?.membershipsBefore.find((entry) => entry.organizationId === org.id)?.members
      if (before && (closingTrace!.tick !== closed.tick || JSON.stringify(before) !== JSON.stringify(closed.members))) invalid()
    } else if (closed !== undefined) invalid()
  }
}
function permille(value: unknown): boolean { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000 }
function memberUnion(entries: OrganizationMembershipReconciliation[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const entry of entries) for (const member of entry.members) {
    if (result.has(member.personId) && result.get(member.personId) !== member.role) fail('organizations', 'state.organizationLifecycle.latestTransitionTraces', 'role-conflict', 'Structural history contains conflicting roles')
    result.set(member.personId, member.role)
  }
  return result
}
function totals(accounts: OrganizationResourceReconciliation[]): string {
  const values = new Map<string, bigint>()
  for (const account of accounts) {
    values.set('currency', (values.get('currency') ?? 0n) + BigInt(account.currencyUnits))
    for (const [good, amount] of Object.entries(account.goods)) values.set(`good:${good}`, (values.get(`good:${good}`) ?? 0n) + BigInt(amount))
  }
  return JSON.stringify([...values].filter(([, amount]) => amount !== 0n).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, amount]) => [key, amount.toString()]))
}
