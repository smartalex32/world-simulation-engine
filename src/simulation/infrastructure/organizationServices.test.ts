import { describe, expect, it } from 'vitest'
import type { GeographicCell, HouseholdState, InfrastructureAssetState, OrganizationState, SettlementState } from '../domain/types'
import type { OrganizationTransitionTrace } from '../organizations/types'
import { reconcileSettlementRegions } from '../settlements/regional'
import { infrastructureAccessAtCell } from './access'
import { allocateInfrastructureMaintenance, effectiveCapacity, maintainInfrastructure, reconcileOrganizationServiceInfrastructure, serviceOperatorOrganizationId } from './model'

const organization = (id: string, status: 'active' | 'dissolved', members: string[]): OrganizationState => ({ id, name: id, kind: 'school', status, locationCellId: '0,0', activityLocationId: 'activity.commons.0,0', members: members.map((personId) => ({ personId, role: 'learner' })), serviceCapacity: 10, sharedRuleIds: [] })
const service = (id: string, capacity = 10, maintenanceUnits = 0): InfrastructureAssetState => ({ version: 1, id, kind: 'service', cellIds: ['0,0'], capacity, conditionPermille: 900, disruptionPermille: 100, maintenanceUnits })
const trace = (kind: OrganizationTransitionTrace['kind'], sourceOrganizationIds: string[], resultOrganizationIds: string[], membershipsBefore: OrganizationTransitionTrace['membershipsBefore'], membershipsAfter: OrganizationTransitionTrace['membershipsAfter']): OrganizationTransitionTrace => ({ sequence: 7, tick: 24, kind, selected: true, sourceOrganizationIds, resultOrganizationIds, memberIds: membershipsBefore.flatMap((entry) => entry.members.map((member) => member.personId)), evidence: { livingMemberCount: 4, sharedMemberCount: 0, relationshipEvidenceCount: 0, relationshipPermille: 0, exposurePermille: 0, interestPermille: 0, conflictPermille: 0, resourcePressurePermille: 0 }, membershipsBefore, membershipsAfter, resourcesBefore: [], resourceReconciliation: [], reason: 'test transition' })

describe('organization service infrastructure reconciliation', () => {
  it('preserves physical service IDs across merger then retires them on dissolution', () => {
    const parentA = organization('organization.a', 'dissolved', ['a'])
    const parentB = organization('organization.b', 'dissolved', ['b'])
    const child = organization('organization.child', 'active', ['a', 'b'])
    const assets = [service('infrastructure.service.organization.a', 10, 3), service('infrastructure.service.organization.b', 20, 2)]
    const merger = trace('merger', [parentA.id, parentB.id], [child.id], [], [])
    expect(reconcileOrganizationServiceInfrastructure(assets, [parentA, parentB, child], [merger], 24).map((asset) => asset.id)).toEqual(['infrastructure.service.organization.a', 'infrastructure.service.organization.b'])
    expect(assets.map((asset) => asset.operatorOrganizationId)).toEqual([child.id, child.id])
    expect(assets.map((asset) => asset.capacity)).toEqual([10, 20])
    child.status = 'dissolved'
    const dissolution = trace('dissolution', [child.id], [], [], [])
    reconcileOrganizationServiceInfrastructure(assets, [parentA, parentB, child], [dissolution], 48)
    expect(assets.map((asset) => asset.decommissionedTick)).toEqual([48, 48])
    expect(assets.map(effectiveCapacity)).toEqual([0, 0])
    expect(infrastructureAccessAtCell(assets, '0,0').servicePermille).toBe(0)
  })

  it('splits service capacity and maintenance units conservatively for a schism', () => {
    const parent = organization('organization.parent', 'active', ['a', 'b'])
    const child = organization('organization.child', 'active', ['c', 'd'])
    const assets = [service('infrastructure.service.organization.parent', 11, 5)]
    const schism = trace('schism', [parent.id], [parent.id, child.id], [{ organizationId: parent.id, members: ['a', 'b', 'c', 'd'].map((personId) => ({ personId, role: 'learner' })) }], [{ organizationId: parent.id, members: parent.members }, { organizationId: child.id, members: child.members }])
    reconcileOrganizationServiceInfrastructure(assets, [parent, child], [schism], 24)
    expect(assets.map((asset) => asset.capacity)).toEqual([5, 6])
    expect(assets.map((asset) => asset.maintenanceUnits)).toEqual([2, 3])
    expect(assets[0]).toMatchObject({ operatorOrganizationId: child.id, conditionPermille: 900, disruptionPermille: 100 })
    expect(assets.reduce((total, asset) => total + asset.capacity, 0)).toBe(11)
    expect(assets.reduce((total, asset) => total + asset.maintenanceUnits, 0)).toBe(5)
    expect(infrastructureAccessAtCell(assets, '0,0').servicePermille).toBe(160)
  })

  it('does not allocate or apply maintenance to decommissioned services and resolves legacy operators', () => {
    const asset = { ...service('infrastructure.service.organization.retired', 10, 4), decommissionedTick: 12 }
    const retired = organization('organization.retired', 'dissolved', [])
    const household = { id: 'household-1', homeCellId: '0,0', inventory: { tools: 3 } } as HouseholdState
    const settlement = { id: 'settlement-1', anchorCellId: '0,0', regional: { extentCellIds: ['0,0'] } } as SettlementState
    expect(serviceOperatorOrganizationId(asset, [retired])).toBe(retired.id)
    expect(allocateInfrastructureMaintenance([asset], [household], [settlement])).toEqual([])
    maintainInfrastructure([asset], 24)
    expect(asset).toMatchObject({ conditionPermille: 900, maintenanceUnits: 4 })
    expect(household.inventory?.tools).toBe(3)
  })

  it('leaves infrastructure untouched when no structural transition was selected', () => {
    const parent = organization('organization.parent', 'active', ['a', 'b'])
    const child = organization('organization.child', 'active', ['c', 'd'])
    const assets = [service('infrastructure.service.organization.parent', 11, 5)]
    const rejected = { ...trace('schism', [parent.id], [parent.id, child.id], [{ organizationId: parent.id, members: ['a', 'b', 'c', 'd'].map((personId) => ({ personId, role: 'learner' })) }], [{ organizationId: parent.id, members: parent.members }, { organizationId: child.id, members: child.members }]), selected: false }
    expect(reconcileOrganizationServiceInfrastructure(assets, [parent, child], [rejected], 24)).toEqual([])
    expect(assets).toEqual([service('infrastructure.service.organization.parent', 11, 5)])
  })

  it('removes retired physical services from regional capacity', () => {
    const assets = [{ ...service('infrastructure.service.organization.retired', 10), ownerSettlementId: 'settlement-1' }]
    const settlement = { id: 'settlement-1', anchorCellId: '0,0', scale: 'hamlet' } as SettlementState
    const cells = [{ id: '0,0', movementCost: 1, resourceCapacity: 10, terrain: 'grassland' }] as unknown as GeographicCell[]
    reconcileSettlementRegions({ settlements: [settlement], cells, households: [], markets: [], organizations: [], roads: [], infrastructure: assets, tick: 1 })
    expect(settlement.regional?.capacity.services).toBe(8)
    assets[0]!.decommissionedTick = 2
    reconcileSettlementRegions({ settlements: [settlement], cells, households: [], markets: [], organizations: [], roads: [], infrastructure: assets, tick: 2 })
    expect(settlement.regional?.capacity.services).toBe(0)
  })

  it('conserves maximum safe integer capacity without floating-point multiplication', () => {
    const parent = organization('organization.parent', 'active', ['a', 'b'])
    const child = organization('organization.child', 'active', ['c', 'd'])
    const assets = [service('infrastructure.service.organization.parent', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)]
    const schism = trace('schism', [parent.id], [parent.id, child.id], [{ organizationId: parent.id, members: ['a', 'b', 'c', 'd'].map((personId) => ({ personId, role: 'learner' })) }], [{ organizationId: parent.id, members: parent.members }, { organizationId: child.id, members: child.members }])
    reconcileOrganizationServiceInfrastructure(assets, [parent, child], [schism], 24)
    expect(assets.reduce((total, asset) => total + asset.capacity, 0)).toBe(Number.MAX_SAFE_INTEGER)
    expect(assets.reduce((total, asset) => total + asset.maintenanceUnits, 0)).toBe(Number.MAX_SAFE_INTEGER)
  })
})
