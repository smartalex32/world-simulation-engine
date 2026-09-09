export type VisualizationAvailability = 'available' | 'empty' | 'partial' | 'gapped' | 'stale' | 'unavailable'

export type MetricUnit = 'count' | 'permille' | 'fixed-point' | 'ticks' | 'hours' | 'meters' | 'kilometers' | 'milliseconds' | 'ratio' | 'text'

export interface VisualizationProvenance {
  source: string
  projectionTick?: number
  cadenceTicks?: number
  detail?: string
}

export interface TimeSeriesDatum {
  tick: number
  value?: number
  evidenceId?: string
}

export interface TimeSeriesViewModel {
  id: string
  label: string
  unit: MetricUnit
  values: readonly TimeSeriesDatum[]
  fromTick: number
  toTick: number
  availability: VisualizationAvailability
  provenance: VisualizationProvenance
  sampled: boolean
  truncated: boolean
  originalPointCount: number
}

export interface MetricCardViewModel {
  id: string
  label: string
  unit: MetricUnit
  value?: number
  previousValue?: number
  availability: VisualizationAvailability
  provenance: VisualizationProvenance
}

export interface ComparisonRowViewModel {
  id: string
  label: string
  unit: MetricUnit
  left?: number
  right?: number
  comparable: boolean
  reason?: string
}

export interface GraphNodeViewModel {
  id: string
  label: string
  category?: string
  description?: string
}

export type GraphEdgeStyle = 'positive' | 'neutral' | 'negative' | 'family' | 'context'

export interface GraphEdgeViewModel {
  id: string
  sourceId: string
  targetId: string
  label: string
  style: GraphEdgeStyle
  directed?: boolean
  description?: string
}

export interface GraphViewModel {
  nodes: readonly GraphNodeViewModel[]
  edges: readonly GraphEdgeViewModel[]
  provenance: VisualizationProvenance
  nodeLimit: number
  edgeLimit: number
  nodesTruncated: boolean
  edgesTruncated: boolean
  missingEndpointCount: number
}

export interface HeatScaleViewModel {
  id: string
  label: string
  unit: MetricUnit
  minimum: number
  midpoint?: number
  maximum: number
  diverging: boolean
  provenance: VisualizationProvenance
}

export interface BoundedCollection<T> {
  items: readonly T[]
  originalCount: number
  truncated: boolean
}

export const VISUALIZATION_BUDGETS = {
  sparklinePoints: 64,
  lineSeriesPoints: 256,
  graphNodes: 80,
  graphEdges: 240,
  categoricalBars: 24,
} as const
