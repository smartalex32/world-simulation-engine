import { describe, expect, it } from 'vitest'
import type { GeographicCell, PersonState } from '../simulation/domain/types'
import { SimulationEngine } from '../simulation/engine/engine'
import { projectionChunkKey, regionCount, regionKey } from './chunks'
import { selectRegionSize, WorkbenchProjectionBuilder } from './buildMapProjection'
import { MAX_PERSON_DETAILS, MAX_POPULATION_MARKERS, MAX_TERRAIN_PRIMITIVES, POPULATION_FIDELITY_VERSION, PROJECTION_PROTOCOL_VERSION, type MapProjectionRequest } from './types'

describe('bounded workbench projection', () => {
  it('selects globally aligned dynamic regions without exceeding the terrain budget', () => {
    const huge = { minQ: 0, maxQ: 1_000_000, minR: 0, maxR: 1_000_000 }
    const size = selectRegionSize(huge, 0.001)
    expect(size).toBeGreaterThan(256)
    expect(regionCount(huge, size)).toBeLessThanOrEqual(MAX_TERRAIN_PRIMITIVES)
    expect(regionKey(size, size + 3, size * 2 + 1)).toBe(`lod:${size}:1:2`)
    expect(projectionChunkKey(63, 64)).toBe('chunk:1:2')
  })

  it('clamps exact detail to the world and returns stable row-major cells', () => {
    const source = SimulationEngine.create('projection-exact').project()
    const builder = new WorkbenchProjectionBuilder(source)
    const projection = builder.build(source, request({ minQ: -50, maxQ: 4, minR: -20, maxR: 3 }, 12))
    expect(projection.projectionProtocolVersion).toBe(PROJECTION_PROTOCOL_VERSION)
    expect(projection.map.lod).toBe('cell')
    expect(projection.map.exactCells).toHaveLength(20)
    expect(projection.map.exactCells.map(({ id }) => id)).toEqual([
      '0,0', '1,0', '2,0', '3,0', '4,0',
      '0,1', '1,1', '2,1', '3,1', '4,1',
      '0,2', '1,2', '2,2', '3,2', '4,2',
      '0,3', '1,3', '2,3', '3,3', '4,3',
    ])
    const visibleIds = new Set(projection.map.exactCells.map(({ id }) => id))
    expect(projection.map.exactCells.reduce((sum, cell) => sum + cell.populationCount, 0)).toBe(source.people.filter((person) => visibleIds.has(person.locationCellId)).length)
    expect(projection.map.exactCells.every((cell) => typeof cell.communityId === 'string' && typeof cell.communityValuePermille === 'number')).toBe(true)
    expect(projection.map).toMatchObject({ revision: 1, overlay: 'terrain', communityMeasureId: 'community.emergent.socialTrust' })
    expect(projection.map.borderAlpha).toBeGreaterThan(0)
  })

  it('aggregates cells and dynamic counts exactly while removing world-sized transport arrays', () => {
    const source = SimulationEngine.create('projection-aggregate', 64, 48).project()
    const builder = new WorkbenchProjectionBuilder(source)
    const projection = builder.build(source, request({ minQ: 0, maxQ: 63, minR: 0, maxR: 47 }, 0.2, 'food'))
    expect(projection.map.exactCells).toEqual([])
    expect(projection.map.regions.length).toBeLessThanOrEqual(MAX_TERRAIN_PRIMITIVES)
    expect(projection.map.regions.reduce((sum, region) => sum + region.cellCount, 0)).toBe(source.world.grid.cells.length)
    expect(projection.map.regions.reduce((sum, region) => sum + (region.foodAmount ?? 0), 0)).toBe(source.world.grid.cells.reduce((sum, cell) => sum + cell.foodAmount, 0))
    expect(projection.map.regions.reduce((sum, region) => sum + region.resourceCapacity, 0)).toBe(source.world.grid.cells.reduce((sum, cell) => sum + cell.resourceCapacity, 0))
    expect(projection.map.regions.reduce((sum, region) => sum + region.populationCount, 0)).toBe(source.people.length)
    expect(projection.map.populationFidelity).toMatchObject({ version: POPULATION_FIDELITY_VERSION, mode: 'aggregate', authoritativeModel: 'detailed-agent', detailHandoff: 'zoom-or-focus', visiblePopulationCount: source.people.length })
    expect(projection.map.populationFidelity.aggregateRegions.reduce((sum, region) => sum + region.populationCount, 0)).toBe(source.people.length)
    expect(projection.communities.every((community) => !('cellIds' in community.catchment))).toBe(true)
    expect(projection).not.toHaveProperty('activityLocations')
    expect(projection.world).not.toHaveProperty('grid')
    expect(projection.summary).not.toHaveProperty('totalFood')
  })

  it('does not drop population when a detail viewport exceeds the marker cap', () => {
    const source = SimulationEngine.create('projection-population', 64, 48).project()
    const template = source.people[0]
    if (!template) throw new Error('Population fixture needs a template person')
    const passable = source.world.grid.cells.filter((cell) => cell.movementCost > 0)
    source.people = Array.from({ length: 5_000 }, (_, index) => personAt(template, passable[index % passable.length] ?? source.world.grid.cells[0]!, index))
    const map = new WorkbenchProjectionBuilder(source).buildMap(source, request({ minQ: 0, maxQ: 63, minR: 0, maxR: 47 }, 12)).populationMarkers
    expect(map.length).toBeLessThanOrEqual(MAX_POPULATION_MARKERS)
    expect(map.reduce((sum, marker) => sum + marker.count, 0)).toBe(5_000)
  })

  it('keeps inspector transport bounded while preserving the authoritative population summary', () => {
    const source = SimulationEngine.create('projection-detail-budget', 64, 48).project()
    const template = source.people[0]
    const cell = source.world.grid.cells.find((candidate) => candidate.movementCost > 0)
    if (!template || !cell) throw new Error('Population fixture needs a passable template')
    source.people = Array.from({ length: MAX_PERSON_DETAILS + 400 }, (_, index) => personAt(template, cell, index))
    const projection = new WorkbenchProjectionBuilder(source).build(source, request({ minQ: cell.q, maxQ: cell.q, minR: cell.r, maxR: cell.r }, 12))
    expect(projection.summary.populationCount).toBe(MAX_PERSON_DETAILS + 400)
    expect(projection.map.populationMarkers.reduce((sum, marker) => sum + marker.count, 0)).toBe(MAX_PERSON_DETAILS + 400)
    expect(projection.people).toHaveLength(MAX_PERSON_DETAILS)
    expect(projection.detailBudget.peopleTruncated).toBe(true)
    expect(projection.relationships).toEqual([])
  })

  it('uses an explicit reversible aggregate region while preserving a hooked person as detailed data', () => {
    const source = SimulationEngine.create('projection-fidelity', 64, 48).project()
    const template = source.people[0]
    const cell = source.world.grid.cells.find((candidate) => candidate.movementCost > 0)
    if (!template || !cell) throw new Error('Population fixture needs a passable template')
    source.people = Array.from({ length: MAX_PERSON_DETAILS + 10 }, (_, index) => personAt(template, cell, index))
    const hooked = source.people.at(-1)
    if (!hooked) throw new Error('Population fixture needs a hooked person')
    const projection = new WorkbenchProjectionBuilder(source).build(source, { ...request({ minQ: 0, maxQ: 63, minR: 0, maxR: 47 }, 0.2), hookedPersonId: hooked.id })
    expect(projection.map.populationFidelity).toMatchObject({ mode: 'aggregate', visiblePopulationCount: source.people.length, authoritativeModel: 'detailed-agent', detailHandoff: 'zoom-or-focus', hookedPersonPreserved: true })
    expect(projection.people.map((person) => person.id)).toContain(hooked.id)
    expect(projection.map.hookedPersonMarker).toMatchObject({ personId: hooked.id, visible: true })
  })

  it('enumerates activity markers only from intersecting 32-cell chunks and preserves visible counts', () => {
    const source = SimulationEngine.create('projection-activity-chunks', 96, 64).project()
    const bounds = { minQ: 33, maxQ: 38, minR: 34, maxR: 39 }
    const map = new WorkbenchProjectionBuilder(source).buildMap(source, request(bounds, 12))
    const visibleCellIds = new Set(source.world.grid.cells.filter((cell) => cell.q >= bounds.minQ && cell.q <= bounds.maxQ && cell.r >= bounds.minR && cell.r <= bounds.maxR).map(({ id }) => id))
    expect(map.activityMarkers.reduce((sum, marker) => sum + marker.count, 0)).toBe(source.activityLocations.filter((location) => visibleCellIds.has(location.cellId)).length)
    expect(map.activityMarkers.every((marker) => marker.q >= bounds.minQ && marker.q <= bounds.maxQ && marker.r >= bounds.minR && marker.r <= bounds.maxR)).toBe(true)
  })

  it('returns an exact focus exception once and reports a hooked person as offscreen without drawing relationship lines', () => {
    const source = SimulationEngine.create('projection-focus').project()
    const focus = source.world.grid.cells.at(-1)
    const hooked = source.people.find((person) => person.locationCellId !== focus?.id)
    if (!focus || !hooked) throw new Error('Focus fixture is incomplete')
    const builder = new WorkbenchProjectionBuilder(source)
    const offscreen = builder.buildMap(source, { ...request({ minQ: 0, maxQ: 1, minR: 0, maxR: 1 }, 12), focusCellId: focus.id, hookedPersonId: hooked.id })
    expect(offscreen.focusCell?.id).toBe(focus.id)
    expect(offscreen.exactCells.some(({ id }) => id === focus.id)).toBe(false)
    expect(offscreen.hookedPersonMarker).toMatchObject({ personId: hooked.id, visible: false })
    expect(offscreen.relationshipSegments).toEqual([])
    expect(builder.build(source, { ...request({ minQ: 0, maxQ: 1, minR: 0, maxR: 1 }, 12), hookedPersonId: hooked.id }).routeHome).toMatchObject({ personId: hooked.id, reachable: true, truncated: false })

    const hookedCell = source.world.grid.cells.find(({ id }) => id === hooked.locationCellId)
    if (!hookedCell) throw new Error('Missing hooked cell')
    const onscreen = builder.buildMap(source, { ...request({ minQ: hookedCell.q, maxQ: hookedCell.q, minR: hookedCell.r, maxR: hookedCell.r }, 12), focusCellId: hookedCell.id, hookedPersonId: hooked.id })
    expect(onscreen.focusCell).toBeUndefined()
    expect(onscreen.exactCells.filter(({ id }) => id === hookedCell.id)).toHaveLength(1)
    expect(onscreen.hookedPersonMarker?.visible).toBe(true)
  })

  it('does not mutate the source projection while caching aggregate data', () => {
    const source = SimulationEngine.create('projection-purity').project()
    const before = JSON.stringify(source)
    const builder = new WorkbenchProjectionBuilder(source)
    builder.build(source, request({ minQ: 0, maxQ: 31, minR: 0, maxR: 23 }, 0.1, 'community'))
    builder.build(source, request({ minQ: 2, maxQ: 8, minR: 3, maxR: 9 }, 10))
    expect(JSON.stringify(source)).toBe(before)
    expect(builder.cacheCardinality()).toEqual({ staticRegions: expect.any(Number), activityChunks: expect.any(Number), householdChunks: expect.any(Number), routes: 0 })
  })

  it('refreshes retained dynamic indexes while retaining immutable terrain caches', () => {
    const source = SimulationEngine.create('projection-dynamic-indexes').project()
    const builder = new WorkbenchProjectionBuilder(source)
    const household = source.households[0]
    if (!household) throw new Error('Projection fixture needs a household')
    const home = source.activityLocations.find((location) => location.id === household.homeActivityLocationId)
    const destination = source.world.grid.cells.find((cell) => cell.movementCost > 0 && cell.id !== household.homeCellId)
    if (!home || !destination) throw new Error('Projection fixture needs a distinct passable destination')
    const before = builder.buildMap(source, request({ minQ: 0, maxQ: source.world.grid.width - 1, minR: 0, maxR: source.world.grid.height - 1 }, 0.1))
    const staticCacheCount = builder.cacheCardinality().staticRegions
    household.homeCellId = destination.id
    home.cellId = destination.id
    const after = builder.buildMap(source, request({ minQ: destination.q, maxQ: destination.q, minR: destination.r, maxR: destination.r }, 12))
    expect(before.householdMarkers.some((marker) => marker.q === destination.q && marker.r === destination.r)).toBe(false)
    expect(after.householdMarkers.reduce((sum, marker) => sum + marker.count, 0)).toBeGreaterThan(0)
    expect(after.activityMarkers.reduce((sum, marker) => sum + marker.count, 0)).toBeGreaterThan(0)
    expect(builder.cacheCardinality().staticRegions).toBe(staticCacheCount)
  })

  it('rebuilds terrain-derived caches when topology is invalidated', () => {
    const source = SimulationEngine.create('projection-topology').project()
    const builder = new WorkbenchProjectionBuilder(source)
    const changed = structuredClone(source)
    changed.world.grid = { width: 1, height: 1, cells: [changed.world.grid.cells[0]!] }
    const map = builder.buildMap(changed, request({ minQ: 0, maxQ: 0, minR: 0, maxR: 0 }, 12), { categories: ['topology'], cellIds: [] })
    expect(map.exactCells).toHaveLength(1)
    expect(map.exactCells[0]?.id).toBe(changed.world.grid.cells[0]?.id)
  })
})

function request(bounds: MapProjectionRequest['bounds'], projectedHexRadius: number, overlay: MapProjectionRequest['overlay'] = 'terrain'): MapProjectionRequest {
  return { revision: 1, bounds, projectedHexRadius, overlay, communityMeasureId: 'community.emergent.socialTrust' }
}

function personAt(template: PersonState, cell: GeographicCell, index: number): PersonState {
  return { ...structuredClone(template), id: `synthetic-person-${index.toString().padStart(5, '0')}`, locationCellId: cell.id }
}
