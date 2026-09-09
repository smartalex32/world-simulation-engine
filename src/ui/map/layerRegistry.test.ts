import { describe, expect, it } from 'vitest'
import type { MapProjection, WorkbenchProjection } from '../../projection'
import { layerAvailability, MAP_LAYER_REGISTRY, visibleAreaStatistics } from './layerRegistry'

const map = {
  lod: 'cell', primitiveBudget: 2,
  exactCells: [
    { id: '0,0', q: 0, r: 0, terrain: 'plain', elevation: -100, habitability: 0, movementCost: 0, foodAmount: 0, foodRegenerationPerDay: 0, resourceCapacity: 0, populationCount: 0 },
    { id: '1,0', q: 1, r: 0, terrain: 'hill', elevation: 900, habitability: 1000, movementCost: 2000, foodAmount: 8, foodRegenerationPerDay: 1, resourceCapacity: 10, populationCount: 3 },
  ],
  regions: [], activityMarkers: [], householdMarkers: [], relationshipSegments: [],
} as unknown as MapProjection

describe('map analysis registry', () => {
  it('defines every primary layer with explicit units, source, domain, cadence, and blend behavior', () => {
    const primary = MAP_LAYER_REGISTRY.filter((layer) => layer.kind === 'primary')
    expect(primary.map((layer) => layer.id)).toEqual(['terrain', 'elevation', 'habitability', 'movement', 'food', 'population', 'community'])
    expect(primary.every((layer) => layer.unit && layer.source && layer.domain && layer.cadence && layer.blend === 'replace-primary')).toBe(true)
  })

  it('computes visible cell statistics without turning zero into missing', () => {
    expect(visibleAreaStatistics(map, 'population')).toMatchObject({ count: 2, missing: 0, minimum: 0, mean: 1.5, maximum: 3, scope: 'cell', lod: 'cell' })
    expect(visibleAreaStatistics(map, 'elevation')).toMatchObject({ minimum: -100, mean: 400, maximum: 900 })
    expect(visibleAreaStatistics(map, 'terrain')).toMatchObject({ count: 2, missing: 2, minimum: undefined })
  })

  it('reports empty current layers and unavailable future layers honestly', () => {
    const projection = { map, settlements: [], roads: [], settlementServices: [], organizations: [], governanceProfiles: [] } as unknown as WorkbenchProjection
    expect(layerAvailability(MAP_LAYER_REGISTRY.find((layer) => layer.id === 'relationships')!, projection)).toBe('empty')
    expect(layerAvailability(MAP_LAYER_REGISTRY.find((layer) => layer.id === 'culture')!, projection)).toBe('unavailable')
  })
})
