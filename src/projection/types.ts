import type { CommunityAggregationTrace, CommunityEmergentValues, CommunityStructuralId, CommunityVariableDefinition, CommunityVariableId, CommunityFeedbackEdgeDefinition } from '../simulation/community/types'
import type { GeographicCell, HouseholdState, LocalGovernanceState, OrganizationState, ParentChildLink, PersonState, PopulationPlacementZone, RelationshipState, SettlementState, Terrain, WorldScale } from '../simulation/domain/types'
import type { PersonVariableDefinition } from '../simulation/variables/types'

export const PROJECTION_PROTOCOL_VERSION = 1
export const PROJECTION_CHUNK_SIZE = 32
export const PROJECTION_REGION_SIZES = Object.freeze([1, 4, 16, 64, 256] as const)
export const MAX_TERRAIN_PRIMITIVES = 4096
export const MAX_POPULATION_MARKERS = 1500
export const MAX_ACTIVITY_MARKERS = 750
export const MAX_HOUSEHOLD_MARKERS = 750
export const MAX_RELATIONSHIP_SEGMENTS = 250

/** Starts with the canonical 1/4/16/64/256 ladder and may grow by powers of four for exceptionally large viewports. */
export type ProjectionRegionSize = number
export type ProjectionOverlay = 'terrain' | 'elevation' | 'habitability' | 'movement' | 'food' | 'population' | 'community'
export type MapProjectionLod = 'cell' | 'region' | 'world'

export interface AxialViewportBounds {
  minQ: number
  maxQ: number
  minR: number
  maxR: number
}

export interface MapProjectionRequest {
  revision: number
  bounds: AxialViewportBounds
  projectedHexRadius: number
  overlay: ProjectionOverlay
  communityMeasureId?: CommunityVariableId
  focusCellId?: string
  hookedPersonId?: string
}

export interface AggregateMapRegion {
  key: string
  q: number
  r: number
  qMax: number
  rMax: number
  size: ProjectionRegionSize
  cellCount: number
  terrainCounts: Record<Terrain, number>
  dominantTerrain: Terrain
  elevation: number
  habitability: number
  movementCost: number
  foodAmount?: number
  resourceCapacity: number
  populationCount: number
  communityId?: string
  communityValuePermille?: number
}

export interface ProjectedMapCell extends GeographicCell {
  populationCount: number
  communityId?: string
  communityValuePermille?: number
}

export interface PopulationMapMarker {
  id: string
  q: number
  r: number
  count: number
  personId?: string
  visible?: boolean
}

export interface ActivityMapMarker {
  id: string
  q: number
  r: number
  count: number
  selected: boolean
}

export interface HouseholdMapMarker {
  id: string
  q: number
  r: number
  count: number
  selected: boolean
}

export interface RelationshipMapSegment {
  id: string
  originQ: number
  originR: number
  destinationQ: number
  destinationR: number
  familiarity: number
}

export interface MapProjection {
  revision: number
  overlay: ProjectionOverlay
  communityMeasureId?: CommunityVariableId
  lod: MapProjectionLod
  regionSize: ProjectionRegionSize
  borderAlpha: number
  bounds: AxialViewportBounds
  exactCells: ProjectedMapCell[]
  regions: AggregateMapRegion[]
  populationMarkers: PopulationMapMarker[]
  activityMarkers: ActivityMapMarker[]
  householdMarkers: HouseholdMapMarker[]
  relationshipSegments: RelationshipMapSegment[]
  focusCell?: ProjectedMapCell
  hookedPersonMarker?: PopulationMapMarker
  primitiveBudget: number
}

export interface WorldDescriptor {
  id: string
  name: string
  width: number
  height: number
  cellCount: number
  scale: WorldScale
}

export interface ProjectedSettlement { id: string; name: string; anchorCellId: string }
/** Bounded metadata; geometry is drawn only where the active cell projection is exact. */
export interface ProjectedRoad { id: string; cellIds: string[] }
export interface ProjectedPopulationZone { id: string; name: string; populationCount: number; cellCount: number; settlementId?: string }

export interface ProjectedCommunityCatchment {
  id: string
  displayName: string
  anchorCellId: string
  cellCount: number
}

export interface ProjectedCommunityState {
  catchment: ProjectedCommunityCatchment
  emergent: CommunityEmergentValues
  structural: Record<CommunityStructuralId, number>
  lastUpdatedTick: number
  latestTraces: readonly CommunityAggregationTrace[]
}

export interface ProjectionSummary {
  populationCount: number
  relationshipCount: number
  householdCount: number
  activityLocationCount: number
  averageHunger: number
}

export interface RouteHomeProjection {
  personId: string
  reachable: boolean
  steps?: number
  totalCost?: number
  truncated: boolean
}

/** Bounded worker transport. World-sized cell, commons, and catchment membership arrays are deliberately absent. */
export interface WorkbenchProjection {
  projectionProtocolVersion: typeof PROJECTION_PROTOCOL_VERSION
  projectionEpoch: number
  runId: string
  tick: number
  seed: string
  engineVersion: string
  world: WorldDescriptor
  settlements: ProjectedSettlement[]
  roads: ProjectedRoad[]
  populationZones: ProjectedPopulationZone[]
  map: MapProjection
  people: PersonState[]
  households: HouseholdState[]
  organizations: OrganizationState[]
  governance: LocalGovernanceState[]
  parentChildLinks: ParentChildLink[]
  communities: ProjectedCommunityState[]
  personCommunityIds: Record<string, string>
  relationships: RelationshipState[]
  variableDefinitions: readonly PersonVariableDefinition[]
  communityVariableDefinitions: readonly CommunityVariableDefinition[]
  communityFeedbackDefinitions: readonly CommunityFeedbackEdgeDefinition[]
  summary: ProjectionSummary
  routeHome?: RouteHomeProjection
  digest?: string
}
