import type { CommunitySimulationState, CommunityVariableId } from '../simulation/community/types'
import type { GeographicCell, HexGrid, PersonState, Terrain, WorldProjection } from '../simulation/domain/types'
import { PERSON_VARIABLE_ID } from '../simulation/variables/registry'
import { getPersonVariable } from '../simulation/variables/storage'
import { findPathDetailed } from '../simulation/spatial/pathfinding'
import { worldChunkLayout } from '../simulation/spatial/worldChunks'
import { buildProjectedSettlements } from './settlements'
import { buildProjectedSettlementLinks } from './regionalNetwork'
import { buildProjectedSettlementDiffusion } from './diffusion'
import { buildProjectedSettlementServices } from './infrastructure'
import { buildProjectedEconomicSummary } from './economy'
import { buildProjectedOrganizationProfiles } from './organizations'
import { buildProjectedGovernanceProfiles } from './governance'
import { buildProjectedCollectiveCultures } from './collectiveCulture'
import { buildProjectedContentionProfiles } from './conflict'
import { deriveDrainage, type DrainageCell } from '../simulation/environment/hydrology'
import { cohortPopulationByCell } from '../simulation/cohorts/model'
import { buildLocationChunkIndex, visibleIndexedLocations, type IndexedProjectionLocation } from './locationIndex'
import { alignRegionOrigin, clampViewportBounds, projectionChunkKey, regionCount, regionKey } from './chunks'
import {
  MAX_ACTIVITY_MARKERS,
  MAX_DISPUTE_DETAILS,
  MAX_HOUSEHOLD_MARKERS,
  MAX_HOUSEHOLD_DETAILS,
  MAX_PARENT_CHILD_LINK_DETAILS,
  MAX_POPULATION_MARKERS,
  MAX_PERSON_DETAILS,
  MAX_RELATIONSHIP_DETAILS,
  MAX_RELATIONSHIP_SEGMENTS,
  MAX_TERRAIN_PRIMITIVES,
  POPULATION_FIDELITY_VERSION,
  PROJECTION_CHUNK_SIZE,
  PROJECTION_PROTOCOL_VERSION,
  PROJECTION_REGION_SIZES,
  type ActivityMapMarker,
  type AggregateMapRegion,
  type AxialViewportBounds,
  type HouseholdMapMarker,
  type MapProjection,
  type MapProjectionRequest,
  type PopulationMapMarker,
  type ProjectedCommunityState,
  type ProjectedMapCell,
  type ProjectionRegionSize,
  type RelationshipMapSegment,
  type RouteHomeProjection,
  type WorkbenchProjection,
} from './types'

const TERRAIN_TIE_ORDER: readonly Terrain[] = ['water', 'plain', 'hill']
const MAX_STATIC_REGION_CACHE_ENTRIES = 16_384
const MAX_ROUTE_CACHE_ENTRIES = 256
const MAX_ROUTE_EXPANSIONS = 10_000

interface StaticRegionAggregate {
  key: string
  q: number
  r: number
  qMax: number
  rMax: number
  size: ProjectionRegionSize
  cellCount: number
  terrainCounts: Record<Terrain, number>
  dominantTerrain: Terrain
  elevationSum: number
  habitabilitySum: number
  movementCostSum: number
  resourceCapacity: number
  communityCounts: Map<string, number>
}

interface StaticLocationGroup {
  key: string
  q: number
  r: number
  originQ: number
  originR: number
  size: number
  count: number
}

export class WorkbenchProjectionBuilder {
  private readonly grid: HexGrid
  private readonly staticRegions = new Map<string, StaticRegionAggregate>()
  private readonly cellById: Map<string, GeographicCell>
  private readonly drainageByCellId: ReadonlyMap<string, DrainageCell>
  private readonly communityIdByCellId = new Map<string, string>()
  private readonly activityEntriesByChunk: ReadonlyMap<string, readonly IndexedProjectionLocation[]>
  private readonly householdEntriesByChunk: ReadonlyMap<string, readonly IndexedProjectionLocation[]>
  private readonly activityCellById: ReadonlyMap<string, string>
  private readonly householdCellById: ReadonlyMap<string, string>
  private readonly routeCache = new Map<string, RouteHomeProjection>()

  constructor(source: WorldProjection) {
    this.grid = source.world.grid
    this.cellById = new Map(this.grid.cells.map((cell) => [cell.id, cell]))
    this.drainageByCellId = deriveDrainage(this.grid)
    for (const community of source.communities) for (const cellId of community.catchment.cellIds) this.communityIdByCellId.set(cellId, community.catchment.id)
    const activityEntries = source.activityLocations.map(({ id, cellId }) => ({ id, cellId }))
    const householdEntries = source.households.map(({ id, homeCellId }) => ({ id, cellId: homeCellId }))
    this.activityEntriesByChunk = buildLocationChunkIndex(activityEntries, this.cellById)
    this.householdEntriesByChunk = buildLocationChunkIndex(householdEntries, this.cellById)
    this.activityCellById = new Map(activityEntries.map(({ id, cellId }) => [id, cellId]))
    this.householdCellById = new Map(householdEntries.map(({ id, cellId }) => [id, cellId]))
  }

  build(source: WorldProjection, request: MapProjectionRequest, digest?: string, projectionEpoch = 0): WorkbenchProjection {
    const map = this.buildMap(source, request)
    const projectedCommunities = projectCommunities(source.communities)
    const details = projectInspectorDetails(source, map, request)
    const personCommunityIds = Object.fromEntries(details.people
      .map((person) => [person.id, this.communityIdByCellId.get(person.locationCellId)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
      .sort(([first], [second]) => first.localeCompare(second)))
    const livingPeople = source.people.filter((person) => person.lifeStatus !== 'dead')
    const hungerTotal = livingPeople.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger), 0)
    const cohortPopulation = source.cohorts.reduce((sum, cohort) => sum + cohort.populationCount, 0)
    return {
      projectionProtocolVersion: PROJECTION_PROTOCOL_VERSION,
      projectionEpoch,
      runId: source.runId,
      tick: source.tick,
      seed: source.seed,
      engineVersion: source.engineVersion,
      world: { id: source.world.id, name: source.world.name, width: this.grid.width, height: this.grid.height, cellCount: this.grid.cells.length, chunkLayout: worldChunkLayout(this.grid.width, this.grid.height), scale: source.world.scale },
      settlements: buildProjectedSettlements(source.world.settlements, source.world.grid.cells, source.people, source.households),
      settlementLinks: buildProjectedSettlementLinks(source.world.settlements, source.world.grid.cells, source.world.roads),
      settlementServices: buildProjectedSettlementServices(source.world.settlements, source.world.grid.cells, source.markets, source.organizations, source.world.roads),
      organizationProfiles: buildProjectedOrganizationProfiles(source.organizations, source.relationships),
      governanceProfiles: buildProjectedGovernanceProfiles(source.governance, projectedCommunities, source.people, source.organizations),
      economy: buildProjectedEconomicSummary(source.households, source.people),
      settlementDiffusion: buildProjectedSettlementDiffusion(source.world.settlements, source.people),
      collectiveCultures: buildProjectedCollectiveCultures(source.communities, source.people),
      contentionProfiles: buildProjectedContentionProfiles(projectedCommunities, source.disputes),
      roads: (source.world.roads ?? []).map((road) => ({ id: road.id, cellIds: [...road.cellIds] })).sort((a, b) => a.id.localeCompare(b.id)),
      populationZones: source.populationZones.map((zone) => zone.settlementId === undefined
        ? { id: zone.id, name: zone.name, populationCount: zone.populationCount, cellCount: zone.cellIds.length }
        : { id: zone.id, name: zone.name, populationCount: zone.populationCount, cellCount: zone.cellIds.length, settlementId: zone.settlementId })
        .sort((a, b) => a.id.localeCompare(b.id)),
      cohorts: source.cohorts.map((cohort) => ({ id: cohort.id, sourceZoneId: cohort.sourceZoneId, populationCount: cohort.populationCount, householdCount: cohort.householdCount, foodUnits: cohort.foodUnits, cellAllocationCount: cohort.cellAllocations.length, ageBands: { ...cohort.ageBands }, transitionStatus: cohort.populationCount > 0 ? 'ready' as const : 'empty' as const })).sort((a, b) => a.id.localeCompare(b.id)),
      map,
      people: details.people,
      households: details.households,
      organizations: source.organizations,
      governance: source.governance,
      disputes: source.disputes.slice(0, MAX_DISPUTE_DETAILS),
      parentChildLinks: details.parentChildLinks,
      communities: projectedCommunities,
      personCommunityIds,
      relationships: details.relationships,
      variableDefinitions: source.variableDefinitions,
      communityVariableDefinitions: source.communityVariableDefinitions,
      communityFeedbackDefinitions: source.communityFeedbackDefinitions,
      summary: {
        populationCount: livingPeople.length + cohortPopulation,
        relationshipCount: source.relationships.length,
        householdCount: source.households.length,
        activityLocationCount: source.activityLocations.length,
        averageHunger: livingPeople.length === 0 ? 0 : Math.round(hungerTotal / livingPeople.length),
      },
      detailBudget: { ...details.budget, disputesTruncated: source.disputes.length > MAX_DISPUTE_DETAILS },
      routeHome: this.routeHome(source.people, request.hookedPersonId),
      digest: digest ?? source.digest,
    }
  }

  buildMap(source: WorldProjection, request: MapProjectionRequest): MapProjection {
    validateRequest(request)
    const bounds = clampViewportBounds(request.bounds, this.grid.width, this.grid.height)
    const size = selectRegionSize(bounds, request.projectedHexRadius)
    const exact = size === 1
    const livingPeople = source.people.filter((person) => person.lifeStatus !== 'dead')
    const populationByCellId = countPeopleByCell(livingPeople)
    for (const [cellId, count] of cohortPopulationByCell(source.cohorts)) populationByCellId.set(cellId, (populationByCellId.get(cellId) ?? 0) + count)
    const communitiesById = new Map(source.communities.map((community) => [community.catchment.id, community]))
    const exactCells = exact ? cellsInBounds(this.grid, bounds).map((cell) => this.projectCell(cell, populationByCellId, communitiesById, request.communityMeasureId)) : []
    const regions = exact ? [] : this.aggregateRegions(source, bounds, size, request.overlay === 'food', request.communityMeasureId)
    const populationMarkers = buildPopulationMarkers(livingPeople, this.cellById, bounds, exact ? 1 : size, cohortPopulationByCell(source.cohorts))
    const hookedPersonMarker = buildHookedMarker(livingPeople, this.cellById, bounds, request.hookedPersonId)
    const selectedPerson = request.hookedPersonId ? source.people.find((person) => person.id === request.hookedPersonId) : undefined
    const activityMarkers = this.buildLocationMarkers(this.activityEntriesByChunk, this.activityCellById, bounds, size, MAX_ACTIVITY_MARKERS, 'activity', selectedPerson?.currentActivity.locationId ?? undefined)
    const householdMarkers = this.buildLocationMarkers(this.householdEntriesByChunk, this.householdCellById, bounds, size, MAX_HOUSEHOLD_MARKERS, 'household', selectedPerson?.householdId)
    const relationshipSegments = buildRelationshipSegments(source, this.cellById, bounds, request.hookedPersonId, exact)
    const projectedRadius = Math.max(0, request.projectedHexRadius)
    return {
      revision: request.revision,
      overlay: request.overlay,
      communityMeasureId: request.communityMeasureId,
      lod: exact ? 'cell' : size >= 64 ? 'world' : 'region',
      regionSize: size,
      borderAlpha: exact ? projectedRadius >= 7 ? 0.48 : projectedRadius <= 4 ? 0 : ((projectedRadius - 4) / 3) * 0.48 : 0,
      bounds,
      exactCells,
      regions,
      populationMarkers,
      populationFidelity: buildPopulationFidelity(exactCells, regions, request.hookedPersonId, hookedPersonMarker),
      activityMarkers,
      householdMarkers,
      relationshipSegments,
      focusCell: this.focusCellException(request.focusCellId, exact, bounds, populationByCellId, communitiesById, request.communityMeasureId),
      hookedPersonMarker,
      primitiveBudget: MAX_TERRAIN_PRIMITIVES,
    }
  }

  private projectCell(cell: GeographicCell, populationByCellId: ReadonlyMap<string, number>, communitiesById: ReadonlyMap<string, CommunitySimulationState>, measureId?: CommunityVariableId): ProjectedMapCell {
    const communityId = this.communityIdByCellId.get(cell.id)
    const community = communityId ? communitiesById.get(communityId) : undefined
    const drainage = this.drainageByCellId.get(cell.id)
    return { ...cell, populationCount: populationByCellId.get(cell.id) ?? 0, ...(drainage ? { drainage: { ...(drainage.downstreamCellId === undefined ? {} : { downstreamCellId: drainage.downstreamCellId }), basinId: drainage.basinId } } : {}), communityId, communityValuePermille: community && measureId ? communityValue(community, measureId) : undefined }
  }

  private focusCellException(id: string | undefined, exact: boolean, bounds: AxialViewportBounds, populationByCellId: ReadonlyMap<string, number>, communitiesById: ReadonlyMap<string, CommunitySimulationState>, measureId?: CommunityVariableId): ProjectedMapCell | undefined {
    const cell = id ? this.cellById.get(id) : undefined
    return cell && !(exact && inBounds(cell, bounds)) ? this.projectCell(cell, populationByCellId, communitiesById, measureId) : undefined
  }

  cacheCardinality(): { staticRegions: number; activityChunks: number; householdChunks: number; routes: number } {
    return { staticRegions: this.staticRegions.size, activityChunks: this.activityEntriesByChunk.size, householdChunks: this.householdEntriesByChunk.size, routes: this.routeCache.size }
  }

  private routeHome(people: readonly PersonState[], hookedPersonId?: string): RouteHomeProjection | undefined {
    const person = hookedPersonId ? people.find((candidate) => candidate.id === hookedPersonId) : undefined
    if (!person) return undefined
    const key = `${person.id}:${person.locationCellId}:${person.homeCellId}`
    const cached = this.routeCache.get(key)
    if (cached) {
      this.routeCache.delete(key)
      this.routeCache.set(key, cached)
      return cached
    }
    const search = findPathDetailed(this.grid, person.locationCellId, person.homeCellId, { cellById: this.cellById, maxExpansions: MAX_ROUTE_EXPANSIONS })
    const summary: RouteHomeProjection = search.path
      ? { personId: person.id, reachable: true, steps: Math.max(0, search.path.cellIds.length - 1), totalCost: search.path.totalCost, truncated: false }
      : { personId: person.id, reachable: false, truncated: search.truncated }
    boundedCacheSet(this.routeCache, key, summary, MAX_ROUTE_CACHE_ENTRIES)
    return summary
  }

  private buildLocationMarkers<T extends ActivityMapMarker | HouseholdMapMarker>(entriesByChunk: ReadonlyMap<string, readonly IndexedProjectionLocation[]>, cellByEntryId: ReadonlyMap<string, string>, bounds: AxialViewportBounds, terrainSize: ProjectionRegionSize, cap: number, prefix: string, selectedId?: string): T[] {
    const entries = visibleIndexedLocations(entriesByChunk, this.cellById, bounds)
    let size = terrainSize
    let visible = locationGroups(entries, this.cellById, size)
    while (visible.length > cap) {
      size = nextRegionSize(size)
      visible = locationGroups(entries, this.cellById, size)
    }
    const selectedCell = selectedId ? this.cellById.get(cellByEntryId.get(selectedId) ?? '') : undefined
    const selectedKey = selectedCell ? regionKey(size, selectedCell.q, selectedCell.r) : undefined
    return visible.map((group) => ({ id: `${prefix}:${group.key}`, q: group.q, r: group.r, count: group.count, selected: group.key === selectedKey } as T))
  }

  private aggregateRegions(source: WorldProjection, bounds: AxialViewportBounds, size: ProjectionRegionSize, includeFood: boolean, measureId?: CommunityVariableId): AggregateMapRegion[] {
    const result: AggregateMapRegion[] = []
    const populationByRegion = countPeopleByRegion(source.people, this.cellById, size)
    for (const [cellId, count] of cohortPopulationByCell(source.cohorts)) {
      const cell = this.cellById.get(cellId)
      if (cell) populationByRegion.set(regionKey(size, cell.q, cell.r), (populationByRegion.get(regionKey(size, cell.q, cell.r)) ?? 0) + count)
    }
    const communityById = new Map(source.communities.map((community) => [community.catchment.id, community]))
    for (let r = alignRegionOrigin(bounds.minR, size); r <= bounds.maxR; r += size) {
      for (let q = alignRegionOrigin(bounds.minQ, size); q <= bounds.maxQ; q += size) {
        const staticValue = this.staticRegion(q, r, size)
        if (staticValue.cellCount === 0) continue
        let foodAmount: number | undefined
        if (includeFood) {
          foodAmount = 0
          forEachRegionCell(this.grid, staticValue, (cell) => { foodAmount! += cell.foodAmount })
        }
        const communityId = dominantString(staticValue.communityCounts)
        const community = communityId ? communityById.get(communityId) : undefined
        result.push({
          key: staticValue.key,
          q: staticValue.q,
          r: staticValue.r,
          qMax: staticValue.qMax,
          rMax: staticValue.rMax,
          size,
          cellCount: staticValue.cellCount,
          terrainCounts: { ...staticValue.terrainCounts },
          dominantTerrain: staticValue.dominantTerrain,
          elevation: Math.round(staticValue.elevationSum / staticValue.cellCount),
          habitability: Math.round(staticValue.habitabilitySum / staticValue.cellCount),
          movementCost: Math.round(staticValue.movementCostSum / staticValue.cellCount),
          foodAmount,
          resourceCapacity: staticValue.resourceCapacity,
          populationCount: populationByRegion.get(staticValue.key) ?? 0,
          communityId,
          communityValuePermille: community && measureId ? communityValue(community, measureId) : undefined,
        })
      }
    }
    return result.sort(compareRegion)
  }

  private staticRegion(q: number, r: number, size: ProjectionRegionSize): StaticRegionAggregate {
    const key = regionKey(size, q, r)
    const cached = this.staticRegions.get(key)
    if (cached) {
      this.staticRegions.delete(key)
      this.staticRegions.set(key, cached)
      return cached
    }
    const aggregate: StaticRegionAggregate = {
      key,
      q,
      r,
      qMax: Math.min(this.grid.width - 1, q + size - 1),
      rMax: Math.min(this.grid.height - 1, r + size - 1),
      size,
      cellCount: 0,
      terrainCounts: { water: 0, plain: 0, hill: 0 },
      dominantTerrain: 'water',
      elevationSum: 0,
      habitabilitySum: 0,
      movementCostSum: 0,
      resourceCapacity: 0,
      communityCounts: new Map(),
    }
    forEachRegionCell(this.grid, aggregate, (cell) => {
      aggregate.cellCount += 1
      aggregate.terrainCounts[cell.terrain] += 1
      aggregate.elevationSum += cell.elevation
      aggregate.habitabilitySum += cell.habitability
      aggregate.movementCostSum += cell.movementCost
      aggregate.resourceCapacity += cell.resourceCapacity
      const communityId = this.communityIdByCellId.get(cell.id)
      if (communityId) aggregate.communityCounts.set(communityId, (aggregate.communityCounts.get(communityId) ?? 0) + 1)
    })
    aggregate.dominantTerrain = dominantTerrain(aggregate.terrainCounts)
    boundedCacheSet(this.staticRegions, key, aggregate, MAX_STATIC_REGION_CACHE_ENTRIES)
    return aggregate
  }
}

function buildPopulationFidelity(exactCells: readonly ProjectedMapCell[], regions: readonly AggregateMapRegion[], hookedPersonId: string | undefined, hookedPersonMarker: PopulationMapMarker | undefined): MapProjection['populationFidelity'] {
  if (regions.length === 0) return {
    version: POPULATION_FIDELITY_VERSION,
    mode: 'detailed',
    visiblePopulationCount: exactCells.reduce((total, cell) => total + cell.populationCount, 0),
    aggregateRegions: [],
    authoritativeModel: 'detailed-agent',
    detailHandoff: 'zoom-or-focus',
    hookedPersonPreserved: hookedPersonId !== undefined && hookedPersonMarker?.personId === hookedPersonId,
  }
  const aggregateRegions = regions.map((region) => ({
    id: `population-fidelity:${region.key}`,
    q: region.q,
    r: region.r,
    qMax: region.qMax,
    rMax: region.rMax,
    size: region.size,
    populationCount: region.populationCount,
  }))
  return {
    version: POPULATION_FIDELITY_VERSION,
    mode: 'aggregate',
    visiblePopulationCount: aggregateRegions.reduce((total, region) => total + region.populationCount, 0),
    aggregateRegions,
    authoritativeModel: 'detailed-agent',
    detailHandoff: 'zoom-or-focus',
    hookedPersonPreserved: hookedPersonId !== undefined && hookedPersonMarker?.personId === hookedPersonId,
  }
}

function validateRequest(request: MapProjectionRequest): void {
  if (!Number.isSafeInteger(request.revision) || request.revision < 0) throw new RangeError('Projection revision must be a non-negative safe integer')
  if (!Number.isFinite(request.projectedHexRadius) || request.projectedHexRadius < 0) throw new RangeError('Projected hex radius must be finite and non-negative')
  if (!(['terrain', 'elevation', 'habitability', 'movement', 'food', 'population', 'community'] as const).includes(request.overlay)) throw new RangeError('Projection overlay is invalid')
}

export function selectRegionSize(bounds: AxialViewportBounds, projectedRadius: number): ProjectionRegionSize {
  if (projectedRadius >= 4 && regionCount(bounds, 1) <= MAX_TERRAIN_PRIMITIVES) return 1
  for (const size of PROJECTION_REGION_SIZES.slice(1)) if (regionCount(bounds, size) <= MAX_TERRAIN_PRIMITIVES) return size
  let size: ProjectionRegionSize = 256
  while (regionCount(bounds, size) > MAX_TERRAIN_PRIMITIVES) size = nextRegionSize(size)
  return size
}

function cellsInBounds(grid: HexGrid, bounds: AxialViewportBounds): GeographicCell[] {
  const result: GeographicCell[] = []
  for (let r = bounds.minR; r <= bounds.maxR; r += 1) for (let q = bounds.minQ; q <= bounds.maxQ; q += 1) {
    const cell = grid.cells[r * grid.width + q]
    if (cell) result.push(cell)
  }
  return result
}

function forEachRegionCell(grid: HexGrid, region: Pick<StaticRegionAggregate, 'q' | 'r' | 'qMax' | 'rMax'>, visit: (cell: GeographicCell) => void): void {
  for (let r = Math.max(0, region.r); r <= region.rMax; r += 1) for (let q = Math.max(0, region.q); q <= region.qMax; q += 1) {
    const cell = grid.cells[r * grid.width + q]
    if (cell) visit(cell)
  }
}

function dominantTerrain(counts: Record<Terrain, number>): Terrain {
  return [...TERRAIN_TIE_ORDER].sort((a, b) => counts[b] - counts[a] || TERRAIN_TIE_ORDER.indexOf(a) - TERRAIN_TIE_ORDER.indexOf(b))[0] ?? 'water'
}

function dominantString(counts: ReadonlyMap<string, number>): string | undefined {
  return [...counts].sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b))[0]?.[0]
}

function countPeopleByRegion(people: readonly PersonState[], cells: ReadonlyMap<string, GeographicCell>, size: ProjectionRegionSize): Map<string, number> {
  const result = new Map<string, number>()
  for (const person of people) {
    const cell = cells.get(person.locationCellId)
    if (!cell) continue
    const key = regionKey(size, cell.q, cell.r)
    result.set(key, (result.get(key) ?? 0) + 1)
  }
  return result
}

function countPeopleByCell(people: readonly PersonState[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const person of people) result.set(person.locationCellId, (result.get(person.locationCellId) ?? 0) + 1)
  return result
}

function locationGroups(entries: readonly IndexedProjectionLocation[], cells: ReadonlyMap<string, GeographicCell>, size: ProjectionRegionSize): StaticLocationGroup[] {
  const groups = new Map<string, StaticLocationGroup>()
  for (const entry of entries) {
    const cell = cells.get(entry.cellId)
    if (!cell) continue
    const key = regionKey(size, cell.q, cell.r)
    const current = groups.get(key)
    if (current) current.count += 1
    else groups.set(key, { key, q: alignRegionOrigin(cell.q, size) + (size - 1) / 2, r: alignRegionOrigin(cell.r, size) + (size - 1) / 2, originQ: alignRegionOrigin(cell.q, size), originR: alignRegionOrigin(cell.r, size), size, count: 1 })
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))
}

function buildPopulationMarkers(people: readonly PersonState[], cells: ReadonlyMap<string, GeographicCell>, bounds: AxialViewportBounds, terrainSize: ProjectionRegionSize, cohorts: ReadonlyMap<string, number>): PopulationMapMarker[] {
  let markerSize = terrainSize
  let groups = populationGroups(people, cells, bounds, markerSize, cohorts)
  while (groups.length > MAX_POPULATION_MARKERS) {
    markerSize = nextRegionSize(markerSize)
    groups = populationGroups(people, cells, bounds, markerSize, cohorts)
  }
  return groups
}

/** Bounded inspector transport: the worker retains every entity and a hook takes priority. */
function projectInspectorDetails(source: WorldProjection, map: MapProjection, request: MapProjectionRequest): {
  people: PersonState[]
  relationships: typeof source.relationships
  households: typeof source.households
  parentChildLinks: typeof source.parentChildLinks
  budget: { peopleTruncated: boolean; relationshipsTruncated: boolean; householdsTruncated: boolean; parentChildLinksTruncated: boolean }
} {
  const byId = new Map(source.people.map((person) => [person.id, person]))
  const hooked = request.hookedPersonId ? byId.get(request.hookedPersonId) : undefined
  const requiredPersonIds = new Set<string>()
  if (hooked) {
    requiredPersonIds.add(hooked.id)
    const household = source.households.find((candidate) => candidate.id === hooked.householdId)
    for (const personId of household?.memberIds ?? []) requiredPersonIds.add(personId)
  }
  const visibleCellIds = map.lod === 'cell' ? new Set(map.exactCells.map((cell) => cell.id)) : new Set<string>()
  if (request.focusCellId) visibleCellIds.add(request.focusCellId)
  const prioritized = source.people.filter((person) => requiredPersonIds.has(person.id)).sort((a, b) => a.id.localeCompare(b.id))
  const local = source.people.filter((person) => !requiredPersonIds.has(person.id) && visibleCellIds.has(person.locationCellId)).sort((a, b) => a.id.localeCompare(b.id))
  const people = [...prioritized, ...local].slice(0, MAX_PERSON_DETAILS)
  const projectedPersonIds = new Set(people.map((person) => person.id))
  const relationshipCandidates = hooked
    ? source.relationships.filter((relationship) => relationship.personAId === hooked.id || relationship.personBId === hooked.id)
    : source.relationships.filter((relationship) => projectedPersonIds.has(relationship.personAId) && projectedPersonIds.has(relationship.personBId))
  const relationships = relationshipCandidates.slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_RELATIONSHIP_DETAILS)
  const householdIds = new Set(people.map((person) => person.householdId))
  const householdCandidates = source.households.filter((household) => householdIds.has(household.id)).sort((a, b) => a.id.localeCompare(b.id))
  const households = householdCandidates.slice(0, MAX_HOUSEHOLD_DETAILS)
  const parentChildCandidates = source.parentChildLinks.filter((link) => projectedPersonIds.has(link.parentId) || projectedPersonIds.has(link.childId)).sort((a, b) => a.id.localeCompare(b.id))
  const parentChildLinks = parentChildCandidates.slice(0, MAX_PARENT_CHILD_LINK_DETAILS)
  return {
    people,
    relationships,
    households,
    parentChildLinks,
    budget: {
      peopleTruncated: source.people.length > people.length,
      relationshipsTruncated: relationshipCandidates.length > relationships.length,
      householdsTruncated: householdCandidates.length > households.length,
      parentChildLinksTruncated: parentChildCandidates.length > parentChildLinks.length,
    },
  }
}

function populationGroups(people: readonly PersonState[], cells: ReadonlyMap<string, GeographicCell>, bounds: AxialViewportBounds, size: ProjectionRegionSize, cohorts: ReadonlyMap<string, number>): PopulationMapMarker[] {
  if (size === 1) return [...people.flatMap((person) => {
    const cell = cells.get(person.locationCellId)
    return cell && inBounds(cell, bounds) ? [{ id: person.id, q: cell.q, r: cell.r, count: 1, personId: person.id }] : []
  }), ...[...cohorts.entries()].flatMap(([cellId, count]) => {
    const cell = cells.get(cellId)
    return cell && inBounds(cell, bounds) ? [{ id: `cohort:${cellId}`, q: cell.q, r: cell.r, count }] : []
  })].sort((a, b) => a.id.localeCompare(b.id))
  const groups = new Map<string, PopulationMapMarker>()
  for (const person of people) {
    const cell = cells.get(person.locationCellId)
    if (!cell || !inBounds(cell, bounds)) continue
    const key = regionKey(size, cell.q, cell.r)
    const current = groups.get(key)
    if (current) current.count += 1
    else groups.set(key, { id: `population:${key}`, q: alignRegionOrigin(cell.q, size) + (size - 1) / 2, r: alignRegionOrigin(cell.r, size) + (size - 1) / 2, count: 1 })
  }
  for (const [cellId, count] of cohorts) {
    const cell = cells.get(cellId)
    if (!cell || !inBounds(cell, bounds)) continue
    const key = regionKey(size, cell.q, cell.r)
    const current = groups.get(key)
    if (current) current.count += count
    else groups.set(key, { id: `population:${key}`, q: alignRegionOrigin(cell.q, size) + (size - 1) / 2, r: alignRegionOrigin(cell.r, size) + (size - 1) / 2, count })
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function buildHookedMarker(people: readonly PersonState[], cells: ReadonlyMap<string, GeographicCell>, bounds: AxialViewportBounds, id?: string): PopulationMapMarker | undefined {
  const person = id ? people.find((candidate) => candidate.id === id) : undefined
  const cell = person ? cells.get(person.locationCellId) : undefined
  return person && cell ? { id: `hooked:${person.id}`, q: cell.q, r: cell.r, count: 1, personId: person.id, visible: inBounds(cell, bounds) } : undefined
}

function buildRelationshipSegments(source: WorldProjection, cells: ReadonlyMap<string, GeographicCell>, bounds: AxialViewportBounds, hookedId: string | undefined, exact: boolean): RelationshipMapSegment[] {
  if (!hookedId || !exact) return []
  const peopleById = new Map(source.people.map((person) => [person.id, person]))
  const hooked = peopleById.get(hookedId)
  const origin = hooked ? cells.get(hooked.locationCellId) : undefined
  if (!origin || !inBounds(origin, bounds)) return []
  return source.relationships.flatMap((relationship): RelationshipMapSegment[] => {
    if (relationship.personAId !== hookedId && relationship.personBId !== hookedId) return []
    const otherId = relationship.personAId === hookedId ? relationship.personBId : relationship.personAId
    const other = peopleById.get(otherId)
    const destination = other ? cells.get(other.locationCellId) : undefined
    if (!destination || !inBounds(destination, bounds)) return []
    return [{ id: relationship.id, originQ: origin.q, originR: origin.r, destinationQ: destination.q, destinationR: destination.r, familiarity: relationship.familiarity }]
  }).sort((a, b) => b.familiarity - a.familiarity || a.id.localeCompare(b.id)).slice(0, MAX_RELATIONSHIP_SEGMENTS)
}

function projectCommunities(communities: readonly CommunitySimulationState[]): ProjectedCommunityState[] {
  return communities.map((community) => ({
    catchment: { id: community.catchment.id, displayName: community.catchment.displayName, anchorCellId: community.catchment.anchorCellId, cellCount: community.catchment.cellIds.length },
    emergent: community.emergent,
    structural: community.structural,
    lastUpdatedTick: community.lastUpdatedTick,
    latestTraces: community.latestTraces,
  })).sort((a, b) => a.catchment.id.localeCompare(b.catchment.id))
}

function communityValue(community: CommunitySimulationState, id: CommunityVariableId): number {
  return id === 'community.structural.foodSecurity' ? community.structural[id] : community.emergent[id]
}

function inBounds(cell: GeographicCell, bounds: AxialViewportBounds): boolean {
  return cell.q >= bounds.minQ && cell.q <= bounds.maxQ && cell.r >= bounds.minR && cell.r <= bounds.maxR
}

function nextRegionSize(size: ProjectionRegionSize): ProjectionRegionSize {
  const canonicalNext = PROJECTION_REGION_SIZES.find((candidate) => candidate > size)
  if (canonicalNext !== undefined) return canonicalNext
  const next = size * 4
  if (!Number.isSafeInteger(next)) throw new RangeError('Viewport is too large to aggregate safely')
  return next
}


function compareRegion(a: AggregateMapRegion, b: AggregateMapRegion): number {
  return a.size - b.size || a.r - b.r || a.q - b.q || a.key.localeCompare(b.key)
}

function boundedCacheSet<K, V>(cache: Map<K, V>, key: K, value: V, maximum: number): void {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > maximum) {
    const oldest = cache.keys().next().value as K | undefined
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}
