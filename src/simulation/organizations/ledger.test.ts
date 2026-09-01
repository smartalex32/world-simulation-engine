import { describe, expect, it } from 'vitest'
import { initializeGoods } from '../economy/stockFlow'
import type { EconomyState, HouseholdState, MarketState } from '../domain/types'
import { observeOrganizationReputation, transferOrganizationAsset } from './ledger'
import type { OrganizationState } from './types'
import { SimulationEngine } from '../engine/engine'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'

function organization(id: string): OrganizationState {
  return { id, name: id, kind: 'club', locationCellId: '0,0', activityLocationId: 'activity.commons.0,0', members: [], serviceCapacity: 1, sharedRuleIds: [], assets: { currencyUnits: 3, goods: { 'good.food': 5 }, latestTransferTraces: [] }, reputationLedger: { nextObservationSequence: 1, observations: [], currentByObserver: [] } }
}

describe('organization-owned assets and observer reputation', () => {
  it('conserves fixed-point goods and currency through household, market, and organization transfers', () => {
    const org = organization('organization.club.001')
    const household: HouseholdState = { id: 'household.001', homeCellId: '0,0', homeActivityLocationId: 'activity.home.household.001', memberIds: [], inventory: initializeGoods({ food: 2, tools: 0, currencyUnits: 7, goods: { 'good.food': 2, 'good.tool': 0, 'good.wood': 0 } }) }
    const markets: MarketState[] = [{ id: 'market.001', cellId: '0,0', activityLocationId: 'activity.commons.0,0' }]
    const economy: EconomyState = { version: 1, markets: [{ version: 1, marketId: 'market.001', prices: {}, treasuryUnits: 11, lastClearedTick: 0 }], tradeTraces: [], productionTraces: [], wageTraces: [], totalTaxCollectedUnits: 0 }
    const goodsBefore = (org.assets!.goods['good.food'] ?? 0) + (household.inventory!.goods!['good.food'] ?? 0)
    const currencyBefore = org.assets!.currencyUnits + household.inventory!.currencyUnits! + economy.markets[0]!.treasuryUnits
    const goods = transferOrganizationAsset({ tick: 2, from: { kind: 'organization', id: org.id }, to: { kind: 'household', id: household.id }, asset: 'good', goodId: 'good.food', amount: 2, reason: 'service', organizations: [org], households: [household], markets, economy })
    const currency = transferOrganizationAsset({ tick: 2, from: { kind: 'market', id: 'market.001' }, to: { kind: 'organization', id: org.id }, asset: 'currency', amount: 4, reason: 'exchange', organizations: [org], households: [household], markets, economy })
    expect(goods).toMatchObject({ previousFromAmount: 5, nextFromAmount: 3, previousToAmount: 2, nextToAmount: 4 })
    expect(currency).toMatchObject({ previousFromAmount: 11, nextFromAmount: 7, previousToAmount: 3, nextToAmount: 7 })
    expect((org.assets!.goods['good.food'] ?? 0) + (household.inventory!.goods!['good.food'] ?? 0)).toBe(goodsBefore)
    expect(org.assets!.currencyUnits + household.inventory!.currencyUnits! + economy.markets[0]!.treasuryUnits).toBe(currencyBefore)
    expect(org.assets!.latestTransferTraces.map((trace) => trace.sequence)).toEqual([1, 2])
    const transfer = { tick: 2, from: { kind: 'organization' as const, id: org.id }, to: { kind: 'household' as const, id: household.id }, asset: 'currency' as const, amount: 1, reason: 'guard', organizations: [org], households: [household], markets, economy }
    expect(() => transferOrganizationAsset({ ...transfer, to: { kind: 'organization', id: org.id } })).toThrow('distinct parties')
    expect(() => transferOrganizationAsset({ ...transfer, goodId: 'good.food' })).toThrow('cannot name a good')
    expect(() => transferOrganizationAsset({ ...transfer, from: { kind: 'household', id: household.id }, to: { kind: 'market', id: 'market.001' } })).toThrow('requires an organization party')
  })

  it('retains distinct bounded causal evidence for different observers without membership inference', () => {
    const org = organization('organization.club.001')
    const first = observeOrganizationReputation({ organization: org, observer: { kind: 'person', id: 'person.a' }, source: 'service', causalEventId: 'event.service.1', tick: 5, deltaPermille: 120 })
    const second = observeOrganizationReputation({ organization: org, observer: { kind: 'person', id: 'person.b' }, source: 'member-conduct', causalEventId: 'event.conduct.1', tick: 6, deltaPermille: -80 })
    const followUp = observeOrganizationReputation({ organization: org, observer: { kind: 'person', id: 'person.a' }, source: 'relationship', causalEventId: 'event.relationship.1', tick: 7, deltaPermille: 20 })
    expect(first).toMatchObject({ previousValuePermille: 500, valuePermille: 620, causalEventId: 'event.service.1', tick: 5 })
    expect(second).toMatchObject({ previousValuePermille: 500, valuePermille: 420, causalEventId: 'event.conduct.1', tick: 6 })
    expect(followUp).toMatchObject({ previousValuePermille: 620, valuePermille: 640 })
    expect(org.members).toEqual([])
    expect(org.reputationLedger!.observations).toHaveLength(3)
    expect(org.reputationLedger!.currentByObserver).toEqual(expect.arrayContaining([expect.objectContaining({ observer: { kind: 'person', id: 'person.a' }, valuePermille: 640 }), expect.objectContaining({ observer: { kind: 'person', id: 'person.b' }, valuePermille: 420 })]))
  })

  it('round-trips opted-in accounts and evidence with deterministic continuation while default schools remain opt-out', async () => {
    const pack = structuredClone(DEFAULT_PREINDUSTRIAL_PACK)
    pack.manifest = { ...pack.manifest, id: 'setting.organization-ledger.fixture', version: '1.0.0', name: 'Organization ledger fixture' }
    pack.organizationDefinitions = pack.organizationDefinitions.map((definition) => definition.id === 'school' ? { ...definition, assets: { initialCurrencyUnits: 4, initialGoods: { 'good.food': 6 } }, reputation: { enabled: true } } : definition)
    const engine = SimulationEngine.create('organization-ledger-round-trip', 32, 24, pack)
    const before = await engine.snapshot()
    expect(before.state.organizations.every((organization) => organization.assets?.currencyUnits === 4 && organization.reputationLedger?.observations.length === 0)).toBe(true)
    const restored = await SimulationEngine.restore(before, pack)
    engine.advance(24, { clockEventHours: false }); restored.advance(24, { clockEventHours: false })
    expect(await restored.snapshot()).toEqual(await engine.snapshot())
    const defaultSnapshot = await SimulationEngine.create('organization-ledger-default').snapshot()
    expect(defaultSnapshot.state.organizations.every((organization) => organization.assets === undefined && organization.reputationLedger === undefined)).toBe(true)
  })
})
