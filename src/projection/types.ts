import type { CommunityAggregationTrace, CommunityEmergentValues, CommunityStructuralId, CommunityVariableDefinition, CommunityVariableId, CommunityFeedbackEdgeDefinition } from '../simulation/community/types'
import type { DisputeState, GeographicCell, HouseholdState, LocalGovernanceState, MarketState, OrganizationState, ParentChildLink, PersonState, PopulationPlacementZone, RelationshipState, SettlementScale, SettlementState, Terrain, WorldScale } from '../simulation/domain/types'
import type { PersonVariableDefinition } from '../simulation/variables/types'
import type { WorldChunkLayout } from '../simulation/spatial/worldChunks'

/** Incremented when the bounded worker-to-workbench projection shape changes. */
export const PROJECTION_PROTOCOL_VERSION = 10
/** Versioned independently so later cohort simulation cannot masquerade as this read-only map aggregation. */
export const POPULATION_FIDELITY_VERSION = 1
export const PROJECTION_CHUNK_SIZE = 32
export const PROJECTION_REGION_SIZES = Object.freeze([1, 4, 16, 64, 256] as const)
export const MAX_TERRAIN_PRIMITIVES = 4096
export const MAX_POPULATION_MARKERS = 1500
export const MAX_ACTIVITY_MARKERS = 750
export const MAX_HOUSEHOLD_MARKERS = 750
export const MAX_RELATIONSHIP_SEGMENTS = 250
/** Bounded inspector transport; the authoritative worker retains every entity. */
export const MAX_PERSON_DETAILS = 512
export const MAX_RELATIONSHIP_DETAILS = 512
export const MAX_DISPUTE_DETAILS = 256
export const MAX_HOUSEHOLD_DETAILS = 256
export const MAX_PARENT_CHILD_LINK_DETAILS = 512

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
  drainage?: { downstreamCellId?: string; basinId: string }
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

/**
 * A read-only population summary for one rendered map region. The authoritative
 * engine continues to retain detailed people; this is never an off-screen
 * simulation substitute.
 */
export interface PopulationFidelityRegion {
  id: string
  q: number
  r: number
  qMax: number
  rMax: number
  size: ProjectionRegionSize
  populationCount: number
}

/**
 * Makes the current presentation fidelity explicit. Zooming or focusing a
 * person reversibly returns a region to cell detail; a hook always retains its
 * person-level marker and inspector data.
 */
export interface PopulationFidelityProjection {
  version: typeof POPULATION_FIDELITY_VERSION
  mode: 'detailed' | 'aggregate'
  visiblePopulationCount: number
  aggregateRegions: PopulationFidelityRegion[]
  authoritativeModel: 'detailed-agent'
  detailHandoff: 'zoom-or-focus'
  hookedPersonPreserved: boolean
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
  populationFidelity: PopulationFidelityProjection
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
  chunkLayout: WorldChunkLayout
  scale: WorldScale
}

/** A retained geographic scale; it never assigns people settlement membership. */
export type { SettlementScale } from '../simulation/domain/types'
export interface ProjectedSettlement {
  id: string
  name: string
  anchorCellId: string
  scale: SettlementScale
  /** Living people with homes within the profile radius of this marker. */
  nearbyResidentCount: number
  nearbyHomeCellCount: number
  /** Current households with homes in this geographic catchment. */
  nearbyHouseholdCount: number
  /** Household-owned food currently stored in this geographic catchment. */
  householdFoodStoreUnits: number
  /** Successful home changes whose retained destination is in this catchment. */
  recordedRelocationArrivalCount: number
  /** Bounded authored cells when present, otherwise the anchor-radius profile. */
  catchmentCellCount: number
  catchmentSource: 'authored' | 'anchor-radius'
  currentVisitorCount: number
  catchmentResourceCapacity: number
  waterAccessCellCount: number
  scaleEvidence: { suggestedScale: SettlementScale; direction: 'stable' | 'growth-ready' | 'decline-ready'; densityPerHomeCell: number; resourceUnitsPerResident: number; accessPermille: number }
}
export interface ProjectedSettlementLink { id: string; fromSettlementId: string; toSettlementId: string; fromCellId: string; toCellId: string; steps: number; travelCost: number; roadCellCount: number }
/** Read-only service evidence from physical markets, schools, and roads. */
export interface ProjectedSettlementService { settlementId: string; marketCount: number; schoolCount: number; schoolCapacity: number; roadCellCount: number }
/** Existing explicit group evidence; unavailable social/economic attributes are not inferred. */
export interface ProjectedOrganizationProfile { id: string; name: string; kind: OrganizationState['kind']; locationCellId: string; goal: 'education' | 'unspecified'; memberCount: number; roleCounts: Record<string, number>; serviceCapacity: number; sharedRuleIds: string[]; internalRelationshipCount: number; internalAverageFamiliarity: number; reputationStatus: 'not-measured'; ownedResourcesStatus: 'not-modeled' }
/** Read-only local-governance evidence; a catchment is not legal territory or civic membership. */
export interface ProjectedGovernanceProfile { id: string; communityId: string; catchmentName: string; catchmentCellCount: number; representativeIds: string[]; activeRepresentativeCount: number; councilOrganizationId: string; councilOrganizationStatus: 'recorded' | 'referenced-not-modeled'; legitimacyPermille: number; legitimacyFactors: { id: string; label: string; valuePermille: number }[]; evaluatedLegitimacyPermille: number; serviceAccessPermille: number; contributionFairnessPermille: number; publicGood: LocalGovernanceState['publicGood']; lastUpdatedTick: number; jurisdictionBasis: 'geographic-catchment'; territoryStatus: 'not-modeled'; civicMembershipStatus: 'not-modeled'; cultureAndIdentityStatus: 'separate-not-inferred'; taxationStatus: 'not-modeled'; budgetStatus: 'not-modeled'; lawAndEnforcementStatus: 'not-modeled'; corruptionStatus: 'not-modeled' }
/** Read-only household materials and living work roles; not a synthesized wealth model. */
export interface ProjectedEconomicSummary { householdCount: number; householdsWithoutFoodCount: number; foodUnits: number; toolUnits: number; foodGiniPermille: number; toolGiniPermille: number; occupationCounts: { dependent: number; household: number; forager: number; unassigned: number } }
export interface ProjectedSettlementDiffusion { settlementId: string; observedResidentCount: number; averageValleyFluency: number; averageExplorationBelief: number }
/** Bounded metadata; geometry is drawn only where the active cell projection is exact. */
export interface ProjectedRoad { id: string; cellIds: string[] }
export interface ProjectedPopulationZone { id: string; name: string; populationCount: number; cellCount: number; settlementId?: string }
/** Read-only authoritative cohort evidence; it never exposes synthetic people. */
export interface ProjectedCohort { id: string; sourceZoneId: string; populationCount: number; householdCount: number; foodUnits: number; cellAllocationCount: number; ageBands: { children: number; adults: number; elders: number }; transitionStatus: 'ready' | 'empty' }

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

/** Reports intentional transport paging without affecting authoritative state. */
export interface ProjectionDetailBudget {
  peopleTruncated: boolean
  relationshipsTruncated: boolean
  disputesTruncated: boolean
  householdsTruncated: boolean
  parentChildLinksTruncated: boolean
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
  settlementLinks: ProjectedSettlementLink[]
  settlementServices: ProjectedSettlementService[]
  organizationProfiles: ProjectedOrganizationProfile[]
  governanceProfiles: ProjectedGovernanceProfile[]
  economy: ProjectedEconomicSummary
  settlementDiffusion: ProjectedSettlementDiffusion[]
  roads: ProjectedRoad[]
  populationZones: ProjectedPopulationZone[]
  cohorts: ProjectedCohort[]
  map: MapProjection
  people: PersonState[]
  households: HouseholdState[]
  organizations: OrganizationState[]
  governance: LocalGovernanceState[]
  disputes: DisputeState[]
  parentChildLinks: ParentChildLink[]
  communities: ProjectedCommunityState[]
  personCommunityIds: Record<string, string>
  relationships: RelationshipState[]
  variableDefinitions: readonly PersonVariableDefinition[]
  communityVariableDefinitions: readonly CommunityVariableDefinition[]
  communityFeedbackDefinitions: readonly CommunityFeedbackEdgeDefinition[]
  summary: ProjectionSummary
  detailBudget: ProjectionDetailBudget
  routeHome?: RouteHomeProjection
  digest?: string
}
