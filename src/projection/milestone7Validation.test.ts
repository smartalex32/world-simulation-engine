import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../simulation/engine/engine'
import { SimulationBatchScheduler, TelemetryBuffer } from '../worker/frameScheduler'
import { WorkbenchProjectionBuilder, selectRegionSize } from './buildMapProjection'
import { regionCount } from './chunks'
import { MAX_ACTIVITY_MARKERS, MAX_HOUSEHOLD_MARKERS, MAX_POPULATION_MARKERS, MAX_RELATIONSHIP_SEGMENTS, MAX_TERRAIN_PRIMITIVES, type MapProjectionRequest } from './types'

describe('milestone 7 projection validation', () => {
  it('keeps a very large world descriptor bounded independently of world extent', () => {
    const source = SimulationEngine.create('projection-huge-bounds', 32, 24).project()
    source.world = { ...source.world, grid: { ...source.world.grid, width: 8192, height: 8192 } }
    const fullBounds = { minQ: 0, maxQ: 8191, minR: 0, maxR: 8191 }
    const worldRegionSize = selectRegionSize(fullBounds, 0.01)
    expect(regionCount(fullBounds, worldRegionSize)).toBeLessThanOrEqual(MAX_TERRAIN_PRIMITIVES)

    // A local request proves transport size is independent of descriptor extent
    // without fabricating 67 million authoritative cells in this test fixture.
    const request = projectionRequest({ minQ: 0, maxQ: 31, minR: 0, maxR: 0 }, 12)
    const projection = new WorkbenchProjectionBuilder(source).build(source, request, undefined, 7)

    expect(projection.projectionEpoch).toBe(7)
    expect(projection.world.width).toBe(8192)
    expect(projection.world.height).toBe(8192)
    expect(projection.map.exactCells).toHaveLength(32)
    expect(projection.map.regions.length).toBeLessThanOrEqual(MAX_TERRAIN_PRIMITIVES)
    expect(projection.map.populationMarkers.length).toBeLessThanOrEqual(MAX_POPULATION_MARKERS)
    expect(projection.map.activityMarkers.length).toBeLessThanOrEqual(MAX_ACTIVITY_MARKERS)
    expect(projection.map.householdMarkers.length).toBeLessThanOrEqual(MAX_HOUSEHOLD_MARKERS)
    expect(projection.map.relationshipSegments.length).toBeLessThanOrEqual(MAX_RELATIONSHIP_SEGMENTS)
  })

  it('reconciles region, population, activity, and household counts with stable ordering', () => {
    const source = SimulationEngine.create('projection-reconciliation', 96, 64).project()
    const request = projectionRequest({ minQ: 0, maxQ: 95, minR: 0, maxR: 63 }, 0.2, 'food')
    const projection = new WorkbenchProjectionBuilder(source).build(source, request)
    const regions = projection.map.regions

    expect(regions.map((region) => region.key)).toEqual([...regions].sort((a, b) => a.size - b.size || a.r - b.r || a.q - b.q || a.key.localeCompare(b.key)).map((region) => region.key))
    expect(regions.reduce((sum, region) => sum + region.cellCount, 0)).toBe(source.world.grid.cells.length)
    expect(regions.reduce((sum, region) => sum + region.populationCount, 0)).toBe(source.people.length)
    expect(projection.map.activityMarkers.reduce((sum, marker) => sum + marker.count, 0)).toBe(source.activityLocations.length)
    expect(projection.map.householdMarkers.reduce((sum, marker) => sum + marker.count, 0)).toBe(source.households.length)
    expect(regions.reduce((sum, region) => sum + (region.foodAmount ?? 0), 0)).toBe(source.world.grid.cells.reduce((total, cell) => total + cell.foodAmount, 0))
  })

  it('carries overlay, measure, revision, and epoch intent without stale transport arrays', () => {
    const source = SimulationEngine.create('projection-transport-contract').project()
    const request = projectionRequest({ minQ: 2, maxQ: 15, minR: 3, maxR: 14 }, 12, 'community', 19)
    const projection = new WorkbenchProjectionBuilder(source).build(source, request, 'digest-test', 4)
    const json = JSON.stringify(projection)

    expect(projection.map).toMatchObject({ revision: 19, overlay: 'community', communityMeasureId: 'community.emergent.socialTrust' })
    expect(projection.projectionEpoch).toBe(4)
    expect(projection.digest).toBe('digest-test')
    expect(json).not.toContain('"grid"')
    expect(json).not.toContain('"activityLocations"')
    expect(json).not.toContain('"cellIds"')
    expect(projection.communities.every((community) => !('cellIds' in community.catchment))).toBe(true)
  })

  it('updates an offscreen hooked marker with movement while the viewport request stays unchanged', () => {
    const source = SimulationEngine.create('projection-hook-movement').project()
    const hooked = source.people[0]
    const destination = source.world.grid.cells.find((cell) => (cell.q > 1 || cell.r > 1) && cell.id !== hooked?.locationCellId && cell.movementCost > 0)
    if (!hooked || !destination) throw new Error('Hook movement fixture is incomplete')
    const request = projectionRequest({ minQ: 0, maxQ: 1, minR: 0, maxR: 1 }, 12, 'terrain', 11, undefined, hooked.id)
    const builder = new WorkbenchProjectionBuilder(source)
    const before = builder.buildMap(source, request)
    hooked.locationCellId = destination.id
    const after = builder.buildMap(source, request)

    expect(after.revision).toBe(before.revision)
    expect(after.bounds).toEqual(before.bounds)
    expect(after.hookedPersonMarker).toMatchObject({ personId: hooked.id, q: destination.q, r: destination.r, visible: false })
    expect(after.hookedPersonMarker?.q).not.toBe(before.hookedPersonMarker?.q)
  })

  it('preserves advance/snapshot observation equivalence and drains complete telemetry', async () => {
    const stepped = SimulationEngine.create('projection-observation')
    const advanced = SimulationEngine.create('projection-observation')
    const stepResult = stepped.step(48)
    const advanceResult = advanced.advance(48)
    expect(advanceResult.events).toEqual(stepResult.events)
    expect(advanceResult.statistics).toEqual(stepResult.statistics)
    expect(await advanced.snapshot()).toEqual(await stepped.snapshot())

    const telemetry = new TelemetryBuffer()
    telemetry.append(advanceResult.events, advanceResult.statistics)
    const drained = telemetry.drain()
    expect(drained.events).toEqual(advanceResult.events)
    expect(drained.statistics).toEqual(advanceResult.statistics)
    expect(telemetry.counts()).toEqual({ events: 0, statistics: 0 })
  })

  it('keeps worker quanta deterministic while emitting one logical clock duration', () => {
    const scheduler = new SimulationBatchScheduler()
    expect(scheduler.next(8192)).toEqual({ ticks: 24, clockEventHours: false })
    for (let index = 0; index < 340; index += 1) scheduler.next(8192)
    expect(scheduler.state().advanced).toBeGreaterThanOrEqual(0)
    scheduler.finalizePartial()
    expect(scheduler.state()).toEqual({ remaining: 0, advanced: 0 })
  })
})

function projectionRequest(bounds: MapProjectionRequest['bounds'], projectedHexRadius: number, overlay: MapProjectionRequest['overlay'] = 'terrain', revision = 1, focusCellId?: string, hookedPersonId?: string): MapProjectionRequest {
  return { revision, bounds, projectedHexRadius, overlay, communityMeasureId: 'community.emergent.socialTrust', focusCellId, hookedPersonId }
}
