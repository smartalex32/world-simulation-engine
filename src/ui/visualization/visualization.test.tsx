import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildGraphViewModel, buildMetricCard, buildTimeSeriesViewModel, sampleEvenly } from './adapters'
import { BoundedGraph } from './BoundedGraph'
import { formatDelta, formatDurationTicks, formatFixedPoint, formatMetricValue, formatNumber, formatPermille, formatTick } from './format'
import { buildLineSegments, deterministicNodePositions, numericDomain, scaleLinear } from './scales'
import { CategoricalBars, CompositionDonut, HeatScaleLegend, Sparkline } from './VisualizationPrimitives'

const provenance = { source: 'retained statistic samples', projectionTick: 48, cadenceTicks: 24 }

describe('visualization formatting', () => {
  it('keeps absence distinct from zero and formats explicit units', () => {
    expect(formatNumber(undefined)).toBe('Not available')
    expect(formatNumber(0)).toBe('0')
    expect(formatPermille(875)).toBe('87.5%')
    expect(formatFixedPoint(-1250)).toBe('-1.25')
    expect(formatDelta(-25, 'permille')).toBe('-2.5 pp')
    expect(formatDurationTicks(49)).toBe('2 d 1 h')
    expect(formatTick(1200)).toBe('Tick 1,200')
    expect(formatMetricValue(12, 'kilometers')).toBe('12 km')
  })
})

describe('visualization scales and adapters', () => {
  it('handles negative, identical, single-point, and gapped series exactly', () => {
    expect(numericDomain([-4, 8], true)).toEqual({ minimum: -4, maximum: 8, identical: false })
    expect(numericDomain([3, 3])).toEqual({ minimum: 2.5, maximum: 3.5, identical: true })
    expect(scaleLinear(2, { minimum: 0, maximum: 4, identical: false }, 0, 100)).toBe(50)
    expect(buildLineSegments([{ tick: 5, value: 3 }], 100, 40)).toEqual([{ key: '5:0', points: '50.00,20.00' }])
    expect(buildLineSegments([{ tick: 0, value: -1 }, { tick: 1 }, { tick: 2, value: 1 }], 100, 40)).toEqual([
      { key: '0:0', points: '2.00,38.00' },
      { key: '2:1', points: '98.00,2.00' },
    ])
  })

  it('orders, samples, and labels bounded time series without interpolating gaps', () => {
    const series = buildTimeSeriesViewModel({
      id: 'population', label: 'Population', unit: 'count', fromTick: 0, toTick: 4, provenance, pointLimit: 3,
      values: [{ tick: 4, value: 14 }, { tick: 1 }, { tick: 0, value: 10 }, { tick: 2, value: 12 }, { tick: 3, value: 13 }],
    })
    expect(series.values).toEqual([{ tick: 0, value: 10 }, { tick: 2, value: 12 }, { tick: 4, value: 14 }])
    expect(series.sampled).toBe(true)
    expect(series.originalPointCount).toBe(5)
    expect(series.availability).toBe('partial')
    expect(buildTimeSeriesViewModel({ id: 'gap', label: 'Gap', unit: 'count', fromTick: 0, toTick: 2, provenance, values: [{ tick: 0, value: 1 }, { tick: 1 }, { tick: 2, value: 2 }] }).availability).toBe('gapped')
  })

  it('bounds graphs with stable ordering and explicit missing endpoints', () => {
    const graph = buildGraphViewModel({
      nodes: [{ id: 'c', label: 'C' }, { id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      edges: [
        { id: 'z', sourceId: 'a', targetId: 'missing', label: 'Missing', style: 'neutral' },
        { id: 'a', sourceId: 'a', targetId: 'b', label: 'Known', style: 'positive' },
      ],
      provenance,
      nodeLimit: 2,
      edgeLimit: 1,
    })
    expect(graph.nodes.map((node) => node.id)).toEqual(['a', 'b'])
    expect(graph.edges.map((edge) => edge.id)).toEqual(['a'])
    expect(graph.nodesTruncated).toBe(true)
    expect(graph.missingEndpointCount).toBe(1)
    expect([...deterministicNodePositions(['a', 'b'], 100, 100)]).toEqual([...deterministicNodePositions(['a', 'b'], 100, 100)])
  })

  it('uses pure bounded helpers and explicit metric availability', () => {
    expect(sampleEvenly([0, 1, 2, 3, 4], 3)).toEqual({ items: [0, 2, 4], originalCount: 5, truncated: true })
    expect(buildMetricCard({ id: 'missing', label: 'Missing', unit: 'count', value: undefined, provenance }).availability).toBe('empty')
    expect(buildMetricCard({ id: 'zero', label: 'Zero', unit: 'count', value: 0, provenance }).availability).toBe('available')
  })
})

describe('accessible visualization markup', () => {
  it('renders charts with readable equivalents and bounded evidence', () => {
    const series = buildTimeSeriesViewModel({ id: 'population', label: 'Population', unit: 'count', fromTick: 0, toTick: 2, provenance, values: [{ tick: 0, value: 10 }, { tick: 1 }, { tick: 2, value: 12 }] })
    const markup = renderToStaticMarkup(<><Sparkline series={series} /><CategoricalBars label="Change" unit="count" diverging values={[{ id: 'loss', label: 'Loss', value: -2 }, { id: 'gain', label: 'Gain', value: 3 }]} /><CompositionDonut label="Age bands" values={[{ id: 'young', label: 'Young', value: 4, color: '#6aa982' }]} /><HeatScaleLegend scale={{ id: 'heat', label: 'Heat', unit: 'permille', minimum: -1000, midpoint: 0, maximum: 1000, diverging: true, provenance }} /></>)
    expect(markup).toContain('role="img"')
    expect(markup).toContain('<table class="sr-only">')
    expect(markup).toContain('Not available')
    expect(markup).toContain('data-sign="negative"')
    expect(markup).toContain('retained statistic samples')
  })

  it('renders a graph with keyboard nodes, budgets, and a table control', () => {
    const graph = buildGraphViewModel({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'edge', sourceId: 'a', targetId: 'b', label: 'A to B', style: 'positive', directed: true }], provenance })
    const markup = renderToStaticMarkup(<BoundedGraph graph={graph} selectedNodeId="a" />)
    expect(markup).toContain('aria-label="Bounded relationship graph"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('Details table')
    expect(markup).toContain('data-node-count="2"')
  })
})
