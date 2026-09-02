import type { EconomyState, HouseholdState, MarketState } from '../domain/types'
import { compareStableText } from '../../shared/stableOrder'
import { synchronizeLegacyGoods } from '../economy/stockFlow'
import type { OrganizationAssetAccount, OrganizationAssetParty, OrganizationAssetTransferTrace, OrganizationReputationLedger, OrganizationReputationObservation, OrganizationReputationObserver, OrganizationReputationSource, OrganizationState } from './types'

export const ORGANIZATION_ASSET_TRACE_LIMIT = 128
export const ORGANIZATION_REPUTATION_OBSERVATION_LIMIT = 256
export const ORGANIZATION_REPUTATION_OBSERVER_LIMIT = 128
/** A completed, directly observed service window contributes small positive evidence. */
export const ORGANIZATION_SERVICE_REPUTATION_DELTA_PERMILLE = 10

export function createOrganizationAssetAccount(definition: { assets?: { initialCurrencyUnits: number; initialGoods: Readonly<Record<string, number>> } }): OrganizationAssetAccount | undefined {
  if (!definition.assets) return undefined
  return { currencyUnits: definition.assets.initialCurrencyUnits, goods: Object.fromEntries(Object.entries(definition.assets.initialGoods).sort(([a], [b]) => compareStableText(a, b))), latestTransferTraces: [] }
}

export function createOrganizationReputationLedger(definition: { reputation?: { enabled: boolean } }): OrganizationReputationLedger | undefined {
  return definition.reputation?.enabled ? { nextObservationSequence: 1, observations: [], currentByObserver: [] } : undefined
}

/** Moves one existing fixed-point unit balance with no implicit member ownership. */
export function transferOrganizationAsset(input: { tick: number; from: OrganizationAssetParty; to: OrganizationAssetParty; asset: 'currency' | 'good'; goodId?: string; amount: number; reason: string; organizations: OrganizationState[]; households: HouseholdState[]; markets: readonly MarketState[]; economy: EconomyState }): OrganizationAssetTransferTrace {
  if (!Number.isSafeInteger(input.tick) || input.tick < 0 || !Number.isSafeInteger(input.amount) || input.amount < 1 || !input.reason) throw new Error('Organization asset transfer is invalid')
  if (input.asset === 'good' && !input.goodId) throw new Error('Organization good transfer requires a good ID')
  if (input.asset === 'currency' && input.goodId !== undefined) throw new Error('Organization currency transfer cannot name a good')
  if (input.from.kind === input.to.kind && input.from.id === input.to.id) throw new Error('Organization asset transfer requires distinct parties')
  if (input.from.kind !== 'organization' && input.to.kind !== 'organization') throw new Error('Organization asset transfer requires an organization party')
  const from = balance(input.from, input, input.asset, input.goodId)
  const to = balance(input.to, input, input.asset, input.goodId)
  if (from.get() < input.amount) throw new Error('Organization asset transfer exceeds source balance')
  if (to.get() > Number.MAX_SAFE_INTEGER - input.amount) throw new Error('Organization asset transfer exceeds destination balance')
  const trace: OrganizationAssetTransferTrace = {
    sequence: nextTraceSequence(input.organizations), tick: input.tick, from: input.from, to: input.to, asset: input.asset,
    ...(input.goodId ? { goodId: input.goodId } : {}), amount: input.amount, previousFromAmount: from.get(), previousToAmount: to.get(), nextFromAmount: from.get() - input.amount, nextToAmount: to.get() + input.amount, reason: input.reason,
  }
  from.set(trace.nextFromAmount); to.set(trace.nextToAmount)
  for (const party of [input.from, input.to]) if (party.kind === 'household') {
    const inventory = input.households.find((household) => household.id === party.id)?.inventory
    if (inventory) synchronizeLegacyGoods(inventory)
  }
  for (const organizationId of [input.from, input.to].filter((party): party is Extract<OrganizationAssetParty, { kind: 'organization' }> => party.kind === 'organization').map((party) => party.id).sort(compareStableText)) {
    const account = input.organizations.find((organization) => organization.id === organizationId)?.assets
    if (!account) throw new Error('Organization asset account is missing')
    account.latestTransferTraces = [...account.latestTransferTraces, trace].sort((a, b) => a.sequence - b.sequence).slice(-ORGANIZATION_ASSET_TRACE_LIMIT)
  }
  return trace
}

/** Records bounded, causal observer evidence. It deliberately does not average observers. */
export function observeOrganizationReputation(input: { organization: OrganizationState; observer: OrganizationReputationObserver; source: OrganizationReputationSource; causalEventId: string; tick: number; deltaPermille: number }): OrganizationReputationObservation {
  const ledger = input.organization.reputationLedger
  if (!ledger || !input.observer.id || !['person', 'organization'].includes(input.observer.kind) || !['service', 'exchange', 'member-conduct', 'relationship'].includes(input.source) || !input.causalEventId || !Number.isSafeInteger(input.tick) || input.tick < 0 || !Number.isSafeInteger(input.deltaPermille) || input.deltaPermille < -1000 || input.deltaPermille > 1000) throw new Error('Organization reputation observation is invalid')
  const current = ledger.currentByObserver.find((entry) => entry.observer.kind === input.observer.kind && entry.observer.id === input.observer.id)
  const prior = current?.valuePermille ?? 500
  const observation: OrganizationReputationObservation = { sequence: ledger.nextObservationSequence++, tick: input.tick, observer: input.observer, source: input.source, causalEventId: input.causalEventId, previousValuePermille: prior, deltaPermille: input.deltaPermille, valuePermille: Math.max(0, Math.min(1000, prior + input.deltaPermille)) }
  ledger.observations = [...ledger.observations, observation].sort((a, b) => a.sequence - b.sequence).slice(-ORGANIZATION_REPUTATION_OBSERVATION_LIMIT)
  ledger.currentByObserver = [...ledger.currentByObserver.filter((entry) => entry.observer.kind !== input.observer.kind || entry.observer.id !== input.observer.id), { observer: input.observer, valuePermille: observation.valuePermille, lastObservationSequence: observation.sequence, lastObservedTick: observation.tick }]
    .sort((a, b) => a.lastObservedTick - b.lastObservedTick || a.lastObservationSequence - b.lastObservationSequence || compareStableText(`${a.observer.kind}:${a.observer.id}`, `${b.observer.kind}:${b.observer.id}`)).slice(-ORGANIZATION_REPUTATION_OBSERVER_LIMIT)
  return observation
}

function nextTraceSequence(organizations: readonly OrganizationState[]): number {
  return Math.max(0, ...organizations.flatMap((organization) => organization.assets?.latestTransferTraces.map((trace) => trace.sequence) ?? [])) + 1
}
function balance(party: OrganizationAssetParty, input: Parameters<typeof transferOrganizationAsset>[0], asset: 'currency' | 'good', goodId: string | undefined): { get(): number; set(value: number): void } {
  if (party.kind === 'organization') {
    const account = input.organizations.find((organization) => organization.id === party.id)?.assets
    if (!account) throw new Error('Organization asset account is missing')
    return asset === 'currency' ? { get: () => account.currencyUnits, set: (value) => { account.currencyUnits = value } } : { get: () => account.goods[goodId! ] ?? 0, set: (value) => { account.goods[goodId!] = value } }
  }
  if (party.kind === 'household') {
    const inventory = input.households.find((household) => household.id === party.id)?.inventory
    if (!inventory) throw new Error('Household inventory is missing')
    inventory.currencyUnits ??= 0; inventory.goods ??= { 'good.food': inventory.food, 'good.tool': inventory.tools, 'good.wood': 0 }
    return asset === 'currency' ? { get: () => inventory.currencyUnits!, set: (value) => { inventory.currencyUnits = value } } : { get: () => inventory.goods![goodId!] ?? 0, set: (value) => { inventory.goods![goodId!] = value } }
  }
  if (asset !== 'currency' || !input.markets.some((market) => market.id === party.id)) throw new Error('Markets only hold currency accounts')
  const ledger = input.economy.markets.find((market) => market.marketId === party.id)
  if (!ledger) throw new Error('Market account is missing')
  return { get: () => ledger.treasuryUnits, set: (value) => { ledger.treasuryUnits = value } }
}
