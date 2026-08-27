import type { GeographicCell, HouseholdState, MarketState, OrganizationState, SettlementRegionalState, SettlementState } from '../domain/types'
import { hexDistance } from '../spatial/hex'

export interface SettlementRegionalTransition { settlementId: string; previousStatus: SettlementRegionalState['status']; nextStatus: SettlementRegionalState['status']; kind: NonNullable<SettlementRegionalState['lastTransition']>['kind']; reason: string }

/** Reconciles explicit settlement membership and capacity from authoritative
 * homes, services, inventories, roads, and terrain—not UI selection. */
export function reconcileSettlementRegions(input: { settlements: SettlementState[]; cells: readonly GeographicCell[]; households: readonly HouseholdState[]; markets: readonly MarketState[]; organizations: readonly OrganizationState[]; roads: readonly { cellIds: readonly string[] }[]; tick: number }): SettlementRegionalTransition[] {
  const cells = new Map(input.cells.map((cell) => [cell.id, cell]))
  const roadCells = new Set(input.roads.flatMap((road) => road.cellIds))
  const transitions: SettlementRegionalTransition[] = []
  for (const settlement of [...input.settlements].sort((a, b) => a.id.localeCompare(b.id))) {
    const anchor = cells.get(settlement.anchorCellId)
    if (!anchor) throw new Error(`Settlement ${settlement.id} has no anchor`)
    const extentCellIds = (settlement.catchmentCellIds ?? input.cells.filter((cell) => hexDistance(anchor, cell) <= 4).map((cell) => cell.id)).filter((id) => cells.get(id)?.movementCost).sort()
    const extent = new Set(extentCellIds)
    const residents = input.households.filter((household) => extent.has(household.homeCellId)).sort((a, b) => a.id.localeCompare(b.id))
    const marketIds = input.markets.filter((market) => extent.has(market.cellId)).map((market) => market.id).sort()
    const organizationIds = input.organizations.filter((organization) => extent.has(organization.locationCellId)).map((organization) => organization.id).sort()
    const food = residents.reduce((total, household) => total + (household.inventory?.food ?? 0), 0)
    const tools = residents.reduce((total, household) => total + (household.inventory?.tools ?? 0), 0)
    const foodCapacity = extentCellIds.reduce((total, id) => total + (cells.get(id)?.resourceCapacity ?? 0), 0)
    const serviceCapacity = input.organizations.filter((organization) => organizationIds.includes(organization.id)).reduce((total, organization) => total + organization.serviceCapacity, 0)
    const accessPermille = extentCellIds.length === 0 ? 0 : Math.round(extentCellIds.filter((id) => id === anchor.id || roadCells.has(id) || hexDistance(cells.get(id)!, anchor) <= 1).length * 1000 / extentCellIds.length)
    const previous = settlement.regional
    const status: SettlementRegionalState['status'] = residents.length === 0 ? 'abandoned' : residents.length * 3 < Math.max(1, extentCellIds.length) ? 'contracting' : 'active'
    const kind = !previous ? 'formed' : previous.status === 'abandoned' && status === 'active' ? 'resettled' : status === 'abandoned' ? 'abandoned' : status === 'contracting' ? 'contraction' : residents.length > previous.residentHouseholdIds.length ? 'growth' : settlement.scale === 'city' || settlement.scale === 'town' ? 'urbanized' : 'ruralized'
    const reason = status === 'abandoned' ? 'no resident households' : status === 'contracting' ? 'low household density across settlement extent' : foodCapacity < residents.length ? 'resource capacity below resident households' : 'homes, services, and access support the settlement'
    settlement.regional = { version: 1, status, extentCellIds, residentHouseholdIds: residents.map((household) => household.id), marketIds, organizationIds, accessPermille, capacity: { housing: extentCellIds.length * 3, food: foodCapacity, services: serviceCapacity, materials: foodCapacity }, materials: { food, tools }, ...(previous?.status === status && previous.residentHouseholdIds.length === residents.length ? {} : { lastTransition: { tick: input.tick, kind, reason } }) }
    if (!previous || previous.status !== status || previous.residentHouseholdIds.length !== residents.length) transitions.push({ settlementId: settlement.id, previousStatus: previous?.status ?? 'abandoned', nextStatus: status, kind, reason })
  }
  return transitions
}
