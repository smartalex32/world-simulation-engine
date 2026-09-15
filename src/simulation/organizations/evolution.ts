import { compareStableText } from '../../shared/stableOrder'
import type { PersonState, RelationshipState } from '../domain/types'
import { createOrganizationDecisionState, createOrganizationLeadershipState } from './governance'
import { createOrganizationReputationLedger, ORGANIZATION_ASSET_TRACE_LIMIT } from './ledger'
import type { OrganizationDefinition, OrganizationLifecycleState, OrganizationMember, OrganizationState, OrganizationTransitionTrace } from './types'

export const ORGANIZATION_EVOLUTION_MEMBER_LIMIT = 128
export const ORGANIZATION_EVOLUTION_CANDIDATE_LIMIT = 16
type Input = { tick: number; organizations: OrganizationState[]; definitions: readonly OrganizationDefinition[]; people: readonly PersonState[]; relationships: readonly RelationshipState[]; lifecycle: OrganizationLifecycleState; assetAndReputationEnabled?: boolean; leadershipAndDecisionsEnabled?: boolean }
type Evidence = OrganizationTransitionTrace['evidence']
const orderedMembers = (members: readonly OrganizationMember[]) => members.map((member) => ({ ...member })).sort((a, b) => compareStableText(a.personId, b.personId))
const active = (org: OrganizationState) => org.status !== 'dissolved'
const roster = (orgs: readonly OrganizationState[]) => orgs.map((org) => ({ organizationId: org.id, members: orderedMembers(org.members) })).sort((a, b) => compareStableText(a.organizationId, b.organizationId))
const accounts = (orgs: readonly OrganizationState[]) => orgs.filter((org) => org.assets).map((org) => ({ organizationId: org.id, currencyUnits: org.assets!.currencyUnits, goods: { ...org.assets!.goods } })).sort((a, b) => compareStableText(a.organizationId, b.organizationId))

/** Deterministic local opportunities. Neither graph clustering nor new RNG draws. */
export function advanceOrganizationEvolution(input: Input): OrganizationTransitionTrace[] {
  const result: OrganizationTransitionTrace[] = []
  const people = new Map(input.people.map((person) => [person.id, person]))
  const relationships = new Map<string, RelationshipState>()
  for (const relationship of input.relationships) relationships.set(pairKey(relationship.personAId, relationship.personBId), relationship)
  const ids = new Set(input.organizations.map((org) => org.id))
  let nextAssetSequence = 1
  for (const org of input.organizations) for (const trace of org.assets?.latestTransferTraces ?? []) nextAssetSequence = Math.max(nextAssetSequence, trace.sequence + 1)
  const transfer = (source: OrganizationState, child: OrganizationState, asset: 'currency' | 'good', amount: number, reason: string, goodId?: string) => {
    if (!amount) return
    const from = source.assets!; const to = child.assets!
    const previousFromAmount = asset === 'currency' ? from.currencyUnits : from.goods[goodId!] ?? 0
    const previousToAmount = asset === 'currency' ? to.currencyUnits : to.goods[goodId!] ?? 0
    const trace = { sequence: nextAssetSequence++, tick: input.tick, from: { kind: 'organization' as const, id: source.id }, to: { kind: 'organization' as const, id: child.id }, asset, ...(goodId ? { goodId } : {}), amount, previousFromAmount, previousToAmount, nextFromAmount: previousFromAmount - amount, nextToAmount: previousToAmount + amount, reason }
    if (asset === 'currency') { from.currencyUnits = trace.nextFromAmount; to.currencyUnits = trace.nextToAmount }
    else { from.goods[goodId!] = trace.nextFromAmount; to.goods[goodId!] = trace.nextToAmount }
    for (const account of [from, to]) account.latestTransferTraces = [...account.latestTransferTraces, trace].slice(-ORGANIZATION_ASSET_TRACE_LIMIT)
  }
  const groups = new Map<string, OrganizationState[]>()
  for (const org of input.organizations) {
    if (!active(org) || org.lineage?.formedTick === input.tick) continue
    const key = `${org.kind}:${org.activityLocationId}`
    const group = groups.get(key) ?? []; group.push(org); groups.set(key, group)
  }
  for (const group of groups.values()) group.sort((a, b) => compareStableText(a.id, b.id))
  const archive = (org: OrganizationState) => {
    org.closedMembership = { tick: input.tick, members: orderedMembers(org.members) }
    org.members = []; org.status = 'dissolved'
    if (org.leadership) { delete org.leadership.leaderPersonId; delete org.leadership.termStartedTick }
    // Pending proposals stay inspectable in the historical record; inactive
    // organizations never resolve them or create new proposals.
  }
  for (const definition of [...input.definitions].sort((a, b) => compareStableText(a.id, b.id))) {
    const policy = definition.lifecycle?.evolution
    if (!policy || input.tick % policy.cadenceHours !== 0) continue
    const all = input.organizations.filter((org) => active(org) && org.kind === definition.id && org.lineage?.formedTick !== input.tick).sort((a, b) => compareStableText(a.id, b.id))
    // A rotating window bounds rejected opportunities too, avoiding starvation.
    const start = all.length ? Math.floor(input.tick / policy.cadenceHours) * policy.maxTransitionsPerCadence % all.length : 0
    const candidates = Array.from({ length: Math.min(all.length, policy.maxTransitionsPerCadence) }, (_, offset) => all[(start + offset) % all.length]!)
    const changed = new Set<string>()
    for (const source of candidates) {
      if (!active(source) || changed.has(source.id)) continue
      if (source.members.length > ORGANIZATION_EVOLUTION_MEMBER_LIMIT || Object.keys(source.assets?.goods ?? {}).length > 128) continue
      const living = source.members.filter((member) => people.get(member.personId)?.lifeStatus !== 'dead')
      const evidence = evaluateEvidence(source, living, people, relationships, input.tick)
      const methods = (['dissolution', 'schism', 'merger'] as const).filter((method) => policy[method]?.enabled)
      for (const kind of methods) {
        let targets = [source]
        let moving: OrganizationMember[] = []
        let reason = 'insufficient-evidence'
        let selected = false
        if (kind === 'dissolution') {
          selected = living.length <= policy.dissolution!.maximumLivingMembers
          // Remaining funds stay in an inspectable estate account, with no
          // service/decision executor. Nothing is created or silently deleted.
          reason = selected ? 'insufficient-living-members; assets-retained-in-estate' : 'stable-living-membership'
        } else if (kind === 'schism') {
          const dissent = dissentingMembers(source, living, input.tick)
          const seed = dissent[0]
          moving = seed ? dissent.filter((member) => member.personId === seed.personId || supportedContact(seed.personId, member.personId, source, people, relationships, input.tick)) : []
          const maximumMoving = Math.floor(living.length * policy.schism!.splitPermille / 1000)
          moving = moving.slice(0, maximumMoving)
          selected = living.length >= policy.schism!.minimumMembers && moving.length >= 2 && moving.length < living.length
            && evidence.conflictPermille >= (policy.minimumConflictPermille ?? 250)
            && evidence.exposurePermille >= (policy.minimumExposurePermille ?? 500)
            && evidence.relationshipPermille >= (policy.minimumRelationshipPermille ?? 250)
          reason = selected ? 'retained-decision-dissent-with-local-support' : 'no-supported-dissenting-subgroup'
        } else {
          const local = groups.get(`${source.kind}:${source.activityLocationId}`) ?? []
          const candidateStart = local.length ? Math.floor(input.tick / policy.cadenceHours) % local.length : 0
          for (let offset = 0; offset < Math.min(local.length, ORGANIZATION_EVOLUTION_CANDIDATE_LIMIT); offset++) {
            const candidate = local[(candidateStart + offset) % local.length]!
            if (candidate.id === source.id || changed.has(candidate.id) || !active(candidate) || candidate.locationCellId !== source.locationCellId || candidate.members.length > ORGANIZATION_EVOLUTION_MEMBER_LIMIT) continue
            const candidateLiving = candidate.members.filter((member) => people.get(member.personId)?.lifeStatus !== 'dead')
            const otherIds = new Set(candidateLiving.map((member) => member.personId))
            const shared = living.filter((member) => otherIds.has(member.personId)).length
            if (shared < policy.merger!.minimumSharedMembers) continue
            const union = new Map([...source.members, ...candidate.members].map((member) => [member.personId, member]))
            if (union.size > ORGANIZATION_EVOLUTION_MEMBER_LIMIT || Object.keys(candidate.assets?.goods ?? {}).length > 128) continue
            // Conflicting roles cannot be silently discarded in a merger.
            if (source.members.some((member) => candidate.members.some((other) => other.personId === member.personId && other.role !== member.role))) continue
            const otherEvidence = evaluateEvidence(candidate, candidateLiving, people, relationships, input.tick)
            if (evidence.exposurePermille < (policy.minimumExposurePermille ?? 500) || otherEvidence.exposurePermille < (policy.minimumExposurePermille ?? 500)
              || evidence.relationshipPermille < (policy.minimumRelationshipPermille ?? 250) || otherEvidence.relationshipPermille < (policy.minimumRelationshipPermille ?? 250)
              || evidence.conflictPermille > 0 || otherEvidence.conflictPermille > 0
              || (evidence.reputationPermille !== undefined && evidence.reputationPermille < 500) || (otherEvidence.reputationPermille !== undefined && otherEvidence.reputationPermille < 500)) continue
            targets = [source, candidate].sort((a, b) => compareStableText(a.id, b.id)); moving = orderedMembers([...union.values()])
            evidence.sharedMemberCount = source.members.length + candidate.members.length - union.size; selected = true; reason = 'compatible-purpose-local-contact-and-overlapping-membership'; break
          }
        }
        const before = roster(targets); const resourcesBefore = accounts(targets)
        let outputs: OrganizationState[] = []
        if (selected && kind !== 'dissolution' && !safeAccountMerge(resourcesBefore)) { selected = false; reason = 'asset-capacity-exceeded' }
        if (selected) {
          if (kind === 'dissolution') { archive(source); outputs = [] }
          else {
            let id: string
            do { id = `organization.${definition.id}.${String(input.lifecycle.nextOrganizationSequence++).padStart(6, '0')}` } while (ids.has(id))
            ids.add(id)
            const child = newOrganization(id, definition, source, moving, kind, targets, input)
            if (kind === 'schism') {
              const movingIds = new Set(moving.map((member) => member.personId))
              source.members = source.members.filter((member) => !movingIds.has(member.personId))
              if (source.leadership?.leaderPersonId && movingIds.has(source.leadership.leaderPersonId)) { delete source.leadership.leaderPersonId; delete source.leadership.termStartedTick }
              if (source.assets && child.assets) {
                const divide = (amount: number) => Number(BigInt(amount) * BigInt(moving.length) / BigInt(before[0]!.members.length))
                transfer(source, child, 'currency', divide(source.assets.currencyUnits), 'organization-schism')
                for (const [good, amount] of Object.entries(source.assets.goods).sort(([a], [b]) => compareStableText(a, b))) { child.assets.goods[good] = 0; transfer(source, child, 'good', divide(amount), 'organization-schism', good) }
              }
              outputs = [source, child]
            } else {
              for (const parent of targets) {
                if (parent.assets && child.assets) {
                  transfer(parent, child, 'currency', parent.assets.currencyUnits, 'organization-merger')
                  for (const [good, amount] of Object.entries(parent.assets.goods).sort(([a], [b]) => compareStableText(a, b))) { child.assets.goods[good] ??= 0; transfer(parent, child, 'good', amount, 'organization-merger', good) }
                }
                archive(parent)
              }
              outputs = [child]
            }
            input.organizations.push(child)
          }
          targets.forEach((org) => changed.add(org.id)); outputs.forEach((org) => changed.add(org.id))
        }
        const afterOrgs = [...new Map([...targets, ...outputs].map((org) => [org.id, org])).values()]
        const trace: OrganizationTransitionTrace = {
          sequence: input.lifecycle.nextTraceSequence++, tick: input.tick, kind, selected,
          sourceOrganizationIds: targets.map((org) => org.id).sort(compareStableText), resultOrganizationIds: outputs.map((org) => org.id).sort(compareStableText),
          memberIds: [...new Set(before.flatMap((entry) => entry.members.map((member) => member.personId)))].sort(compareStableText), evidence: { ...evidence },
          membershipsBefore: before, membershipsAfter: roster(afterOrgs), resourcesBefore, resourceReconciliation: accounts(afterOrgs), reason,
        }
        result.push(trace)
        if (selected) break
      }
    }
  }
  input.lifecycle.latestTransitionTraces = [...(input.lifecycle.latestTransitionTraces ?? []), ...result].slice(-64)
  return result
}

function pairKey(a: string, b: string) { return [a, b].sort(compareStableText).join('|') }
function supportedContact(a: string, b: string, org: OrganizationState, people: ReadonlyMap<string, PersonState>, relationships: ReadonlyMap<string, RelationshipState>, tick: number): boolean {
  const first = people.get(a); const second = people.get(b); const relationship = relationships.get(pairKey(a, b))
  return !!first && !!second && !!relationship && relationship.familiarity > 0 && first.locationCellId === org.locationCellId && second.locationCellId === org.locationCellId
    && first.currentActivity.locationId === org.activityLocationId && second.currentActivity.locationId === org.activityLocationId
    && [first, second].some((person) => person.lastEncounter && person.lastEncounter.tick <= tick && tick - person.lastEncounter.tick <= 24 && person.lastEncounter.otherPersonId === (person.id === a ? b : a))
}
function dissentingMembers(org: OrganizationState, members: readonly OrganizationMember[], tick: number): OrganizationMember[] {
  const decision = org.decisions?.latestResolutions.at(-1)
  if (!decision || decision.resolvedTick > tick || tick - decision.resolvedTick > 168) return []
  return orderedMembers(members).filter((member) => {
    const contribution = decision.contributions.find((entry) => entry.participantId === member.personId)
    const selected = contribution?.alternativeScores.find((entry) => entry.alternativeId === decision.selectedAlternativeId)?.scorePermille
    return selected !== undefined && contribution!.alternativeScores.some((entry) => entry.scorePermille > selected)
  })
}
function evaluateEvidence(org: OrganizationState, members: readonly OrganizationMember[], people: ReadonlyMap<string, PersonState>, relationships: ReadonlyMap<string, RelationshipState>, tick: number): Evidence {
  const sampled = orderedMembers(members).slice(0, ORGANIZATION_EVOLUTION_CANDIDATE_LIMIT)
  let relationshipsCount = 0; let contacts = 0; let familiarity = 0
  for (let i = 0; i < sampled.length; i++) for (let j = i + 1; j < sampled.length; j++) {
    const a = sampled[i]!.personId; const b = sampled[j]!.personId; const relationship = relationships.get(pairKey(a, b))
    if (relationship) { relationshipsCount++; familiarity += relationship.familiarity }
    if (supportedContact(a, b, org, people, relationships, tick)) contacts++
  }
  const observers = org.reputationLedger?.currentByObserver.filter((entry) => entry.observer.kind === 'person' && sampled.some((member) => member.personId === entry.observer.id)) ?? []
  const dissent = dissentingMembers(org, members, tick)
  return { livingMemberCount: members.filter((member) => people.get(member.personId)?.lifeStatus !== 'dead').length, sharedMemberCount: 0, relationshipEvidenceCount: relationshipsCount,
    relationshipPermille: relationshipsCount ? Math.floor(familiarity / relationshipsCount) : 0,
    exposurePermille: sampled.length > 1 ? Math.min(1000, Math.floor(contacts * 2000 / sampled.length)) : 0,
    interestPermille: sampled.length ? Math.floor(sampled.reduce((sum, member) => sum + (people.get(member.personId)?.variables['person.trait.curiosity'] ?? 0), 0) / sampled.length) : 0,
    ...(observers.length ? { reputationPermille: Math.floor(observers.reduce((sum, entry) => sum + entry.valuePermille, 0) / observers.length) } : {}),
    conflictPermille: members.length ? Math.floor(dissent.length * 1000 / members.length) : 0,
    resourcePressurePermille: org.assets && members.length ? Math.max(0, 1000 - Math.min(1000, Math.floor((org.assets.goods['good.food'] ?? 0) * 1000 / members.length))) : 0,
    ...(org.decisions?.latestResolutions.at(-1) ? { decisionSequence: org.decisions.latestResolutions.at(-1)!.sequence } : {}),
  }
}
function safeAccountMerge(accounts: OrganizationTransitionTrace['resourcesBefore']): boolean {
  const totals = new Map<string, bigint>()
  for (const account of accounts) for (const [good, amount] of [['currency', account.currencyUnits] as const, ...Object.entries(account.goods).map(([id, amount]) => [`good:${id}`, amount] as const)]) {
    const next = (totals.get(good) ?? 0n) + BigInt(amount); if (next > BigInt(Number.MAX_SAFE_INTEGER)) return false; totals.set(good, next)
  }
  return true
}
function newOrganization(id: string, definition: OrganizationDefinition, source: OrganizationState, members: OrganizationMember[], kind: 'schism' | 'merger', parents: OrganizationState[], input: Input): OrganizationState {
  return { id, name: `${definition.name} ${id.split('.').at(-1)}`, kind: definition.id, specialization: definition.specialization ?? 'institution', status: 'active',
    lineage: { origin: kind, parentOrganizationIds: parents.map((parent) => parent.id).sort(compareStableText), formedTick: input.tick },
    locationCellId: source.locationCellId, activityLocationId: source.activityLocationId, members: orderedMembers(members), serviceCapacity: definition.initialService.serviceCapacity, sharedRuleIds: [...definition.sharedRuleIds],
    ...(source.assets ? { assets: { currencyUnits: 0, goods: {}, latestTransferTraces: [] } } : {}),
    ...(input.assetAndReputationEnabled && definition.reputation?.enabled ? { reputationLedger: createOrganizationReputationLedger(definition) } : {}),
    ...(input.leadershipAndDecisionsEnabled && definition.leadership ? { leadership: createOrganizationLeadershipState(definition) } : {}),
    ...(input.leadershipAndDecisionsEnabled && definition.decisionPolicies?.length ? { decisions: createOrganizationDecisionState(definition) } : {}),
  }
}
