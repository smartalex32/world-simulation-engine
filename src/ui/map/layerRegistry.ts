import type { MapProjection, ProjectionOverlay, WorkbenchProjection } from '../../projection'
import type { MetricUnit } from '../visualization'

export type MapContextLayerId = 'relationships' | 'activity-locations' | 'households' | 'settlements' | 'roads' | 'markets' | 'organizations' | 'governance'

export interface MapLayerDefinition {
  id: ProjectionOverlay | MapContextLayerId | 'culture' | 'warfare'
  label: string
  kind: 'primary' | 'context' | 'future'
  unit: MetricUnit
  palette: string
  domain: string
  blend: 'replace-primary' | 'overlay'
  source: string
  cadence: string
  description: string
  dependency?: string
}

export const MAP_LAYER_REGISTRY: readonly MapLayerDefinition[] = [
  { id: 'terrain', label: 'Terrain', kind: 'primary', unit: 'text', palette: 'categorical terrain', domain: 'explicit terrain IDs', blend: 'replace-primary', source: 'bounded map cells/regions', cadence: 'world creation', description: 'Authoritative hex terrain categories.' },
  { id: 'elevation', label: 'Elevation', kind: 'primary', unit: 'fixed-point', palette: 'low green to high sand', domain: '0–1000 cell elevation', blend: 'replace-primary', source: 'bounded map cells/regions', cadence: 'world creation', description: 'Cell or aggregate-region elevation.' },
  { id: 'habitability', label: 'Habitability', kind: 'primary', unit: 'permille', palette: 'low red to high green', domain: '0–1000 permille', blend: 'replace-primary', source: 'bounded map cells/regions', cadence: 'projection update', description: 'Current modeled habitability.' },
  { id: 'movement', label: 'Movement cost', kind: 'primary', unit: 'fixed-point', palette: 'low green to high rust', domain: 'projected traversal cost', blend: 'replace-primary', source: 'bounded map cells/regions', cadence: 'world creation', description: 'Explicit traversal cost; zero is blocked.' },
  { id: 'food', label: 'Food and resources', kind: 'primary', unit: 'count', palette: 'empty brown to available green', domain: 'food divided by cell capacity', blend: 'replace-primary', source: 'bounded map cells/regions', cadence: 'simulation frame', description: 'Current natural food stock relative to resource capacity.' },
  { id: 'population', label: 'Population', kind: 'primary', unit: 'count', palette: 'empty charcoal to occupied gold', domain: 'cell or LOD-region population', blend: 'replace-primary', source: 'bounded population fidelity projection', cadence: 'simulation frame', description: 'Detailed people or explicit aggregate regions by LOD.' },
  { id: 'community', label: 'Community measure', kind: 'primary', unit: 'permille', palette: 'measure-specific sequential/diverging', domain: '0–1000 catchment measure', blend: 'replace-primary', source: 'projected geographic exposure catchments', cadence: 'daily model update', description: 'Selected community emergent or structural measure.' },
  { id: 'relationships', label: 'Relationships', kind: 'context', unit: 'count', palette: 'green segments', domain: 'hooked-person relationships only', blend: 'overlay', source: 'bounded map relationship segments', cadence: 'projection update', description: 'Visible lines for the explicitly focused person.' },
  { id: 'activity-locations', label: 'Activity locations', kind: 'context', unit: 'count', palette: 'cyan markers', domain: 'bounded visible markers', blend: 'overlay', source: 'map activity markers', cadence: 'simulation frame', description: 'Current activity-location occupancy.' },
  { id: 'households', label: 'Households', kind: 'context', unit: 'count', palette: 'amber markers', domain: 'bounded visible markers', blend: 'overlay', source: 'map household markers', cadence: 'projection update', description: 'Explicit household home locations.' },
  { id: 'settlements', label: 'Settlements', kind: 'context', unit: 'count', palette: 'gold markers', domain: 'bounded settlement projections', blend: 'overlay', source: 'settlement projection', cadence: 'projection update', description: 'Geographic settlement anchors and catchments.' },
  { id: 'roads', label: 'Roads and infrastructure', kind: 'context', unit: 'count', palette: 'sand lines', domain: 'visible authored road cells', blend: 'overlay', source: 'road projection', cadence: 'projection update', description: 'Explicit road geometry and settlement links.' },
  { id: 'markets', label: 'Markets', kind: 'context', unit: 'count', palette: 'context marker', domain: 'settlement service evidence', blend: 'overlay', source: 'settlement service projection', cadence: 'projection update', description: 'Current market service evidence; no inferred trade territory.' },
  { id: 'organizations', label: 'Organizations', kind: 'context', unit: 'count', palette: 'context marker', domain: 'organization locations', blend: 'overlay', source: 'organization projection', cadence: 'projection update', description: 'Explicit organization locations and membership evidence.' },
  { id: 'governance', label: 'Governance catchments', kind: 'context', unit: 'count', palette: 'dashed context boundary', domain: 'geographic catchment only', blend: 'overlay', source: 'governance projection', cadence: 'scheduled update', description: 'Observed catchments, not legal territory or civic membership.' },
  { id: 'culture', label: 'Collective culture identity', kind: 'future', unit: 'text', palette: 'none', domain: 'unavailable', blend: 'overlay', source: 'not modeled', cadence: 'unavailable', description: 'No authoritative identity regions exist.', dependency: 'Capability 12 / Epic #99' },
  { id: 'warfare', label: 'War and occupation', kind: 'future', unit: 'text', palette: 'none', domain: 'unavailable', blend: 'overlay', source: 'not modeled', cadence: 'unavailable', description: 'Local contention is not warfare.', dependency: 'Capability 14 / Epic #101' },
] as const

export interface VisibleAreaStatistics {
  count: number
  missing: number
  minimum?: number
  mean?: number
  maximum?: number
  unit: MetricUnit
  scope: 'cell' | 'aggregate-region'
  lod: MapProjection['lod']
  primitiveCount: number
}

export function visibleAreaStatistics(map: MapProjection, overlay: ProjectionOverlay): VisibleAreaStatistics {
  const definition = MAP_LAYER_REGISTRY.find((layer) => layer.id === overlay)!
  const source = map.lod === 'cell' ? map.exactCells : map.regions
  const values = source.map((entry) => overlayValue(entry, overlay)).filter((value): value is number => value !== undefined && Number.isFinite(value))
  return {
    count: source.length,
    missing: source.length - values.length,
    minimum: values.length ? Math.min(...values) : undefined,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined,
    maximum: values.length ? Math.max(...values) : undefined,
    unit: definition.unit,
    scope: map.lod === 'cell' ? 'cell' : 'aggregate-region',
    lod: map.lod,
    primitiveCount: map.primitiveBudget,
  }
}

export function layerAvailability(layer: MapLayerDefinition, projection: WorkbenchProjection): 'available' | 'empty' | 'unavailable' {
  if (layer.kind === 'future') return 'unavailable'
  if (layer.kind === 'primary') return 'available'
  if (layer.id === 'relationships') return projection.map.relationshipSegments.length ? 'available' : 'empty'
  if (layer.id === 'activity-locations') return projection.map.activityMarkers.length ? 'available' : 'empty'
  if (layer.id === 'households') return projection.map.householdMarkers.length ? 'available' : 'empty'
  if (layer.id === 'settlements') return projection.settlements.length ? 'available' : 'empty'
  if (layer.id === 'roads') return projection.roads.length ? 'available' : 'empty'
  if (layer.id === 'markets') return projection.settlementServices.some((service) => service.marketCount > 0) ? 'available' : 'empty'
  if (layer.id === 'organizations') return projection.organizations.length ? 'available' : 'empty'
  return projection.governanceProfiles.length ? 'available' : 'empty'
}

function overlayValue(entry: MapProjection['exactCells'][number] | MapProjection['regions'][number], overlay: ProjectionOverlay): number | undefined {
  if (overlay === 'terrain') return undefined
  if (overlay === 'elevation') return entry.elevation
  if (overlay === 'habitability') return entry.habitability
  if (overlay === 'movement') return entry.movementCost
  if (overlay === 'food') return entry.foodAmount
  if (overlay === 'population') return entry.populationCount
  return entry.communityValuePermille
}
