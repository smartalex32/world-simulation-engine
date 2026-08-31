import type { CohortAuthoringProfile } from '../cohorts/types'
import type { SettlementTemplateId } from './settlementTemplates'

export type Terrain = 'water' | 'plain' | 'hill'
/** The deterministic terrain baseline used before sparse draft edits are applied. */
export type WorldTerrainBase = 'seeded-valley' | 'blank-land'

/** A deliberate terrain-type edit retained in a draft and creation request. */
export interface TerrainTypeOverride {
  cellId: string
  terrain: Terrain
}

/** A deliberate absolute elevation edit, measured in the cell's 0–1000 scale. */
export interface ElevationOverride {
  cellId: string
  elevation: number
}

/** A deliberate resource-capacity edit in whole resource units. */
export interface ResourceCapacityOverride {
  cellId: string
  resourceCapacity: number
}

export interface HexCoord {
  q: number
  r: number
}

export interface GeographicCell extends HexCoord {
  id: string
  terrain: Terrain
  elevation: number
  habitability: number
  movementCost: number
  resourceCapacity: number
  foodAmount: number
  foodRegenerationPerDay: number
}

export interface HexGrid {
  width: number
  height: number
  cells: GeographicCell[]
}

/** Physical interpretation of the pointy axial grid. It is fixed for the first creator. */
export interface WorldScale {
  layout: 'axial-pointy'
  hexRadiusMeters: number
}

/** A named spatial place. It has no political or demographic behavior in Milestone 8A. */
export interface SettlementState {
  id: string
  name: string
  anchorCellId: string
  /** Optional starting geography profile; never person membership. */
  template?: Exclude<SettlementTemplateId, 'dispersed-homesteads'>
  /** Optional authored geographic area; never a person membership list. */
  catchmentCellIds?: string[]
  /** Retained geographic scale; it is updated only by the settlement system. */
  scale?: SettlementScale
  /** Settlement-owned regional state; it is distinct from authored geography. */
  regional?: SettlementRegionalState
}

export type SettlementScale = 'landmark' | 'hamlet' | 'village' | 'town' | 'city'

export interface SettlementRegionalState {
  version: 1
  status: 'active' | 'contracting' | 'abandoned'
  extentCellIds: string[]
  residentHouseholdIds: string[]
  /** Detailed residents are identified by household; distant residents remain aggregate. */
  detailedResidentPopulationCount: number
  cohortResidentPopulationCount: number
  marketIds: string[]
  organizationIds: string[]
  accessPermille: number
  capacity: { housing: number; food: number; services: number; materials: number }
  materials: { food: number; tools: number }
  /** Retained so urban/rural classification changes are explicit lifecycle transitions. */
  scale?: SettlementScale
  lastTransition?: { tick: number; kind: 'formed' | 'growth' | 'contraction' | 'abandoned' | 'resettled' | 'urbanized' | 'ruralized'; reason: string }
}

/** Exact initial resident allocation for a disjoint set of passable cells. */
export interface PopulationPlacementZone {
  id: string
  name: string
  cellIds: string[]
  populationCount: number
  /** Ordinary people represented by a deterministic distant cohort, not detailed agents. */
  cohortPopulationCount?: number
  /** Explicit aggregate starting profile; never transferred to detailed people. */
  cohortProfile?: CohortAuthoringProfile
  settlementId?: string
  /** Explicit authoring profile controlling initial home dispersion only. */
  template?: SettlementTemplateId
  /** Canonical eligible initial-home cells derived from the selected template. */
  homeCellIds?: string[]
}

export type WorldPlacementPreset = 'west' | 'center' | 'central' | 'east'

/** UI-friendly pre-generation placement. The engine resolves it to passable cell IDs. */
export interface PopulationPlacementZoneDraft {
  id: string
  name: string
  populationCount: number
  cohortPopulationCount?: number
  cohortProfile?: CohortAuthoringProfile
  settlementId?: string
  cellIds?: string[]
  preset?: WorldPlacementPreset
  radiusCells?: number
  template?: SettlementTemplateId
}

export interface SettlementDraft {
  id: string
  name: string
  anchorCellId?: string
  preset?: WorldPlacementPreset
  catchmentCellIds?: string[]
  template?: Exclude<SettlementTemplateId, 'dispersed-homesteads'>
}

/** Ordered, contiguous passable cell geometry for a draft-only road segment. */
export interface RoadDraft {
  id: string
  cellIds: string[]
}

/** A named-free transportation segment. Roads have no ownership or economic meaning. */
export interface RoadState {
  id: string
  cellIds: string[]
}

export interface WorldCreationDraft {
  seed: string
  name: string
  width: number
  height: number
  initialPopulationCount: number
  /** Physical radius of one axial hex. Omitted preserves the 1 km legacy default. */
  hexRadiusMeters?: number
  /** Omitted for legacy seeded-valley worlds; blank-land is an explicit authored canvas. */
  terrainBase?: WorldTerrainBase
  populationZones: PopulationPlacementZoneDraft[]
  settlements: SettlementDraft[]
  roads?: RoadDraft[]
  /** Canonically sorted sparse terrain edits; absent means seeded terrain only. */
  terrainOverrides?: TerrainTypeOverride[]
  elevationOverrides?: ElevationOverride[]
  resourceCapacityOverrides?: ResourceCapacityOverride[]
}

export interface WorldCreationRequest {
  seed: string
  name: string
  width: number
  height: number
  initialPopulationCount: number
  /** Present only when authored scale differs from the 1 km legacy default. */
  hexRadiusMeters?: number
  /** Present only when the authored world does not use the legacy seeded valley baseline. */
  terrainBase?: Exclude<WorldTerrainBase, 'seeded-valley'>
  populationZones: PopulationPlacementZone[]
  settlements: SettlementState[]
  /** Omitted when no authored roads exist, preserving legacy canonical worlds. */
  roads?: RoadState[]
  terrainOverrides: TerrainTypeOverride[]
  elevationOverrides: ElevationOverride[]
  resourceCapacityOverrides: ResourceCapacityOverride[]
}

/**
 * A non-authoritative, versioned world-authoring record. Drafts are editable
 * outside a live run and only become authoritative through an explicit worker
 * commit.
 */
export interface WorldDraftRecord {
  version: 3
  draftId: string
  revision: number
  /** Immutable authored input retained so reset never depends on UI state. */
  initialDraft: WorldCreationDraft
  draft: WorldCreationDraft
  /** Bounded worker-owned authoring history; never live simulation state. */
  undoStack: WorldCreationDraft[]
  redoStack: WorldCreationDraft[]
}

/** A bounded, deterministic result used by authoring UI before commit. */
export interface WorldDraftPreview {
  version: 2
  draftId: string
  revision: number
  creation: WorldCreationRequest
  worldId: string
  cellCount: number
  passableCellCount: number
  terrainCounts: Record<Terrain, number>
  /** Derived placement evidence only; it is not persisted simulation state. */
  settlementSeedPreviews: SettlementSeedPreview[]
}

/** Bounded pre-commit evidence for one starting-population placement zone. */
export interface SettlementSeedPreview {
  zoneId: string
  template?: SettlementTemplateId
  requestedPopulationCount: number
  recommendedPopulationCapacity?: number
  eligibleHomeCellCount: number
  /** Integer people per eligible home cell, rounded up for a conservative density signal. */
  peoplePerHomeCell: number
  /** Average axial home-to-anchor distance in steps; absent when no marker exists. */
  averageAnchorTravelSteps?: number
  /** Renewable food capacity available across the authored placement per initial resident. */
  resourceCapacityPerPerson: number
}

/** A bounded spatial request for read-only, generated draft terrain. */
export interface DraftViewportRequest {
  revision: number
  bounds: { minQ: number; maxQ: number; minR: number; maxR: number }
  selectedZoneId?: string
}

/** A generated terrain cell annotated only with membership in the requested zone. */
export interface DraftViewportCell extends GeographicCell {
  selected: boolean
}

/** Non-authoritative draft terrain projection; it must never be treated as a live frame. */
export interface DraftViewportProjection {
  version: 1
  draftId: string
  draftRevision: number
  revision: number
  selectedZoneId?: string
  /** Canonically ordered sparse-world chunks contributing cells to this slice. */
  chunkKeys: string[]
  cells: DraftViewportCell[]
}

export interface WorldState {
  id: string
  name: string
  scale: WorldScale
  grid: HexGrid
  settlements: SettlementState[]
  /** Omitted for legacy worlds without authored roads. */
  roads?: RoadState[]
}
