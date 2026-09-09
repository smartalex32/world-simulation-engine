import { compareStableText } from '../../shared/stableOrder'
import { VISUALIZATION_BUDGETS, type BoundedCollection, type ComparisonRowViewModel, type GraphEdgeViewModel, type GraphNodeViewModel, type GraphViewModel, type MetricCardViewModel, type MetricUnit, type TimeSeriesDatum, type TimeSeriesViewModel, type VisualizationAvailability, type VisualizationProvenance } from './types'

export interface TimeSeriesInput {
  id: string
  label: string
  unit: MetricUnit
  values: readonly TimeSeriesDatum[]
  fromTick: number
  toTick: number
  provenance: VisualizationProvenance
  stale?: boolean
  unavailable?: boolean
  truncated?: boolean
  pointLimit?: number
}

export function buildTimeSeriesViewModel(input: TimeSeriesInput): TimeSeriesViewModel {
  const ordered = input.values
    .filter((datum) => Number.isInteger(datum.tick) && datum.tick >= input.fromTick && datum.tick <= input.toTick)
    .slice()
    .sort((a, b) => a.tick - b.tick || compareStableText(a.evidenceId ?? '', b.evidenceId ?? ''))
  const limit = Math.max(1, Math.floor(input.pointLimit ?? VISUALIZATION_BUDGETS.lineSeriesPoints))
  const sampled = sampleEvenly(ordered, limit)
  const hasGap = sampled.items.some((datum) => datum.value === undefined)
  let availability: VisualizationAvailability = 'available'
  if (input.unavailable) availability = 'unavailable'
  else if (input.stale) availability = 'stale'
  else if (ordered.length === 0) availability = 'empty'
  else if (hasGap) availability = 'gapped'
  else if (input.truncated || sampled.truncated) availability = 'partial'
  return {
    id: input.id,
    label: input.label,
    unit: input.unit,
    values: sampled.items,
    fromTick: input.fromTick,
    toTick: input.toTick,
    availability,
    provenance: input.provenance,
    sampled: sampled.truncated,
    truncated: Boolean(input.truncated || sampled.truncated),
    originalPointCount: ordered.length,
  }
}

export function buildMetricCard(input: Omit<MetricCardViewModel, 'availability'> & { unavailable?: boolean; stale?: boolean; partial?: boolean }): MetricCardViewModel {
  const availability: VisualizationAvailability = input.unavailable ? 'unavailable' : input.stale ? 'stale' : input.partial ? 'partial' : input.value === undefined ? 'empty' : 'available'
  return { ...input, availability }
}

export function buildComparisonRow(input: Omit<ComparisonRowViewModel, 'comparable'>): ComparisonRowViewModel {
  const comparable = input.left !== undefined && input.right !== undefined
  return { ...input, comparable, reason: comparable ? undefined : input.reason ?? 'One or both values are unavailable.' }
}

export function buildGraphViewModel(input: {
  nodes: readonly GraphNodeViewModel[]
  edges: readonly GraphEdgeViewModel[]
  provenance: VisualizationProvenance
  nodeLimit?: number
  edgeLimit?: number
}): GraphViewModel {
  const nodeLimit = Math.max(1, Math.floor(input.nodeLimit ?? VISUALIZATION_BUDGETS.graphNodes))
  const edgeLimit = Math.max(0, Math.floor(input.edgeLimit ?? VISUALIZATION_BUDGETS.graphEdges))
  const nodes = input.nodes.slice().sort((a, b) => compareStableText(a.id, b.id)).slice(0, nodeLimit)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const candidates = input.edges.slice().sort((a, b) => compareStableText(a.id, b.id))
  const validEdges = candidates.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
  const missingEndpointCount = candidates.length - validEdges.length
  const edges = validEdges.slice(0, edgeLimit)
  return {
    nodes,
    edges,
    provenance: input.provenance,
    nodeLimit,
    edgeLimit,
    nodesTruncated: input.nodes.length > nodes.length,
    edgesTruncated: validEdges.length > edges.length,
    missingEndpointCount,
  }
}

export function sampleEvenly<T>(items: readonly T[], limit: number): BoundedCollection<T> {
  if (items.length <= limit) return { items: items.slice(), originalCount: items.length, truncated: false }
  if (limit === 1) return { items: [items[items.length - 1]!], originalCount: items.length, truncated: true }
  const sampled = Array.from({ length: limit }, (_, index) => items[Math.round(index * (items.length - 1) / (limit - 1))]!)
  return { items: sampled, originalCount: items.length, truncated: true }
}
