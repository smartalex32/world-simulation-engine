import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { formatMetricValue, formatTick } from './format'
import { buildLineSegments, numericDomain, scaleLinear } from './scales'
import type { HeatScaleViewModel, MetricUnit, TimeSeriesViewModel } from './types'

export interface LegendItem {
  id: string
  label: string
  color: string
  pattern?: 'solid' | 'dashed' | 'dotted'
  description?: string
}

export function VisualizationLegend({ label, items }: { label: string; items: readonly LegendItem[] }) {
  return <ul className="viz-legend" aria-label={label}>{items.map((item) => <li key={item.id}>
    <i style={{ '--legend-color': item.color } as CSSProperties} data-pattern={item.pattern ?? 'solid'} aria-hidden="true" />
    <span>{item.label}{item.description && <small>{item.description}</small>}</span>
  </li>)}</ul>
}

export function DataState({ state, children }: { state: TimeSeriesViewModel['availability']; children?: ReactNode }) {
  const labels = {
    available: 'Complete retained data',
    empty: 'No retained samples in this range',
    partial: 'Partial or sampled retained data',
    gapped: 'Retained data contains gaps',
    stale: 'Projection is updating',
    unavailable: 'This evidence is unavailable',
  }
  return <div className={`viz-state ${state}`} data-state={state}><strong>{labels[state]}</strong>{children && <span>{children}</span>}</div>
}

export function AccessibleTooltip({ id, children }: { id: string; children: ReactNode }) {
  return <span id={id} role="tooltip" className="viz-tooltip">{children}</span>
}

export function Sparkline({ series, width = 160, height = 44 }: { series: TimeSeriesViewModel; width?: number; height?: number }) {
  const titleId = useId()
  const descriptionId = useId()
  const segments = buildLineSegments(series.values, width, height)
  if (series.availability === 'empty' || series.availability === 'unavailable') return <DataState state={series.availability} />
  return <figure className="sparkline" data-sampled={series.sampled || undefined}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>{series.label}</title>
      <desc id={descriptionId}>{`${series.originalPointCount} samples from tick ${series.fromTick} to ${series.toTick}. ${series.availability}.`}</desc>
      {segments.map((segment) => <polyline key={segment.key} points={segment.points} vectorEffect="non-scaling-stroke" />)}
      {segments.length === 0 && <circle cx={width / 2} cy={height / 2} r="2" />}
    </svg>
    <figcaption><span>{formatTick(series.fromTick)}</span><span>{formatTick(series.toTick)}</span></figcaption>
    {(series.sampled || series.availability !== 'available') && <DataState state={series.availability}>{series.sampled ? `${series.values.length} of ${series.originalPointCount} points shown.` : undefined}</DataState>}
    <table className="sr-only"><caption>{series.label} retained samples</caption><thead><tr><th>Tick</th><th>Value</th></tr></thead><tbody>{series.values.map((datum, index) => <tr key={`${datum.tick}:${datum.evidenceId ?? index}`}><td>{datum.tick}</td><td>{formatMetricValue(datum.value, series.unit)}</td></tr>)}</tbody></table>
  </figure>
}

export interface BarDatum { id: string; label: string; value?: number }

export function CategoricalBars({ label, values, unit, diverging = false }: { label: string; values: readonly BarDatum[]; unit: MetricUnit; diverging?: boolean }) {
  const domain = numericDomain(values.map((value) => value.value), true)
  const left = domain && diverging ? scaleLinear(0, domain, 0, 100) : 0
  return <figure className="categorical-bars">
    <figcaption>{label}</figcaption>
    {values.length === 0 && <DataState state="empty" />}
    <div role="list" aria-label={label}>{values.map((datum) => {
      const end = datum.value === undefined || !domain ? left : scaleLinear(datum.value, domain, 0, 100)
      const start = Math.min(left, end)
      const size = Math.abs(end - left)
      return <div role="listitem" className="categorical-bar" key={datum.id} data-sign={datum.value !== undefined && datum.value < 0 ? 'negative' : 'positive'}>
        <span>{datum.label}</span><div aria-hidden="true"><i style={{ left: `${start}%`, width: `${Math.max(size, datum.value === 0 ? 1 : 0)}%` }} /></div><strong>{formatMetricValue(datum.value, unit)}</strong>
      </div>
    })}</div>
  </figure>
}

export function CompositionDonut({ label, values }: { label: string; values: readonly { id: string; label: string; value: number; color: string }[] }) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value.value), 0)
  let offset = 0
  const stops = values.map((value) => {
    const start = total === 0 ? 0 : offset / total * 100
    offset += Math.max(0, value.value)
    const end = total === 0 ? 0 : offset / total * 100
    return `${value.color} ${start}% ${end}%`
  })
  return <figure className="composition-donut">
    <div role="img" aria-label={`${label}. ${values.map((value) => `${value.label}: ${value.value}`).join(', ') || 'No values.'}`} style={{ background: total === 0 ? undefined : `conic-gradient(${stops.join(',')})` }}><span>{total}</span></div>
    <figcaption><strong>{label}</strong><VisualizationLegend label={`${label} categories`} items={values.map((value) => ({ id: value.id, label: `${value.label}: ${value.value}`, color: value.color }))} /></figcaption>
  </figure>
}

export function HeatScaleLegend({ scale }: { scale: HeatScaleViewModel }) {
  return <figure className={`heat-scale ${scale.diverging ? 'diverging' : ''}`}>
    <figcaption>{scale.label}<small>{scale.provenance.source}</small></figcaption>
    <div aria-hidden="true" />
    <p><span>{formatMetricValue(scale.minimum, scale.unit)}</span>{scale.midpoint !== undefined && <span>{formatMetricValue(scale.midpoint, scale.unit)}</span>}<span>{formatMetricValue(scale.maximum, scale.unit)}</span></p>
  </figure>
}

export function SelectionMarker({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return <button type="button" className="selection-marker" aria-pressed={selected} onClick={onSelect}><i aria-hidden="true" />{label}</button>
}

export function ThresholdBadge({ value, thresholds, unit }: { value?: number; thresholds: readonly { minimum: number; label: string }[]; unit: MetricUnit }) {
  const ordered = thresholds.slice().sort((a, b) => a.minimum - b.minimum)
  const threshold = value === undefined ? undefined : ordered.filter((candidate) => value >= candidate.minimum).at(-1)
  return <span className="threshold-badge" data-level={threshold?.label.toLowerCase().replaceAll(' ', '-') ?? 'unavailable'}>{threshold?.label ?? 'Unavailable'}<small>{formatMetricValue(value, unit)}</small></span>
}

export function FocusValue({ label, value, unit }: { label: string; value?: number; unit: MetricUnit }) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  return <span className="focus-value"><button type="button" aria-describedby={open ? tooltipId : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}>{label}</button>{open && <AccessibleTooltip id={tooltipId}>{formatMetricValue(value, unit)}</AccessibleTooltip>}</span>
}

export function provenanceLabel(series: TimeSeriesViewModel): string {
  const cadence = series.provenance.cadenceTicks === undefined ? 'cadence unavailable' : `every ${series.provenance.cadenceTicks} ticks`
  return `${series.provenance.source}; ${cadence}`
}
