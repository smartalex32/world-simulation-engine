import type { WorkbenchProjection } from '../../projection'
import type { SimulationEvent, StatisticSample } from '../../simulation/domain/types'
import type { WorkbenchEntityRef, WorkbenchTimeRange } from '../controllers/useWorkbenchNavigation'
import { CategoricalBars, CompositionDonut, DataState, Sparkline, formatDelta, formatMetricValue } from '../visualization'
import { buildAnalyticsDashboard, buildScopeComparison } from './analyticsViewModel'
import type { AnalyticsFidelity, AnalyticsMetricCategory } from './metricRegistry'

const CATEGORIES: readonly AnalyticsMetricCategory[] = ['overview', 'population', 'resources', 'social', 'systems']

export function AnalyticsWorkspace({ projection, statistics, events, category, fidelity, timeRange, selectedEntity, comparisonEntity, onCategory, onFidelity, onTimeRange, onSelectScope, onCompareScope, onOpenMetric, onOpenMap, onOpenEvent }: {
  projection: WorkbenchProjection
  statistics: readonly StatisticSample[]
  events: readonly SimulationEvent[]
  category: AnalyticsMetricCategory
  fidelity: AnalyticsFidelity
  timeRange?: WorkbenchTimeRange
  selectedEntity?: WorkbenchEntityRef
  comparisonEntity?: WorkbenchEntityRef
  onCategory: (category: AnalyticsMetricCategory) => void
  onFidelity: (fidelity: AnalyticsFidelity) => void
  onTimeRange: (range?: WorkbenchTimeRange) => void
  onSelectScope: (entity?: WorkbenchEntityRef) => void
  onCompareScope: (entity?: WorkbenchEntityRef) => void
  onOpenMetric: (metricId: string) => void
  onOpenMap: (overlay: 'population' | 'food' | 'community') => void
  onOpenEvent: (eventId: string) => void
}) {
  const view = buildAnalyticsDashboard({ projection, statistics, events, category, range: timeRange })
  const comparison = buildScopeComparison(projection, selectedEntity, comparisonEntity)
  const scopes = [
    ...projection.settlements.map((entry) => ({ ref: `settlement:${entry.id}`, label: `${entry.name} settlement catchment` })),
    ...projection.communities.map((entry) => ({ ref: `region:${entry.catchment.id}`, label: `${entry.catchment.displayName} community catchment` })),
  ]
  return <section className="analytics-workspace" aria-labelledby="analytics-workspace-title">
    <header><div><span className="eyebrow">WORLD ANALYTICS</span><h2 id="analytics-workspace-title">Conditions and retained trends</h2><p>Read-only bounded projections and persisted samples. Catchments, membership, organizations, and authority stay semantically separate.</p></div><button type="button" onClick={() => onOpenMap('population')}>Open population map</button></header>
    <form className="analytics-filters" onSubmit={(event) => event.preventDefault()}>
      <label>Metric category<select value={category} onChange={(event) => onCategory(event.target.value as AnalyticsMetricCategory)}>{CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Population fidelity<select value={fidelity} onChange={(event) => onFidelity(event.target.value as AnalyticsFidelity)}><option value="all">Detailed + cohort</option><option value="detailed">Detailed only</option><option value="cohort">Cohort only</option></select></label>
      <label>From tick<input type="number" min="0" value={timeRange?.fromTick ?? Math.max(0, projection.tick - 720)} onChange={(event) => onTimeRange({ fromTick: Math.max(0, Number(event.target.value)), toTick: timeRange?.toTick ?? projection.tick })} /></label>
      <label>To tick<input type="number" min="0" value={timeRange?.toTick ?? projection.tick} onChange={(event) => onTimeRange({ fromTick: timeRange?.fromTick ?? Math.max(0, projection.tick - 720), toTick: Math.max(timeRange?.fromTick ?? 0, Number(event.target.value)) })} /></label>
      <label>Primary scope<select value={scopeValue(selectedEntity)} onChange={(event) => onSelectScope(parseScope(event.target.value))}><option value="">Choose a catchment</option>{scopes.map((scope) => <option key={scope.ref} value={scope.ref}>{scope.label}</option>)}</select></label>
      <label>Compare with<select value={scopeValue(comparisonEntity)} onChange={(event) => onCompareScope(parseScope(event.target.value))}><option value="">Choose a second catchment</option>{scopes.map((scope) => <option key={scope.ref} value={scope.ref}>{scope.label}</option>)}</select></label>
    </form>
    <div className="analytics-card-grid">
      {view.cards.map((card) => <article className="analytics-card" key={card.id} data-state={card.availability}>
        <div><span>{card.definition.category}</span><DataState state={card.availability} /></div>
        <h3>{card.label}</h3><strong>{formatMetricValue(card.value, card.unit)}</strong>
        <p className={`analytics-delta ${card.trendMeaning}`}>{card.delta === undefined ? 'Trend requires at least two compatible samples' : `${formatDelta(card.delta, card.unit)} in selected range · ${card.trendMeaning}`}</p>
        {card.trend && <Sparkline series={card.trend} />}
        <small>Sample {card.sampleTick === undefined ? 'unavailable' : `tick ${card.sampleTick}`} · {card.definition.cadenceTicks ? `every ${card.definition.cadenceTicks} ticks` : 'current projection'}</small>
        <small>{card.definition.source} · {card.definition.aggregationLevel}</small><p>{card.definition.caveat}</p>
        <div><button type="button" onClick={() => onOpenMetric(card.id)}>Open evidence</button>{metricOverlay(card.id) && <button type="button" onClick={() => onOpenMap(metricOverlay(card.id)!)}>Map</button>}</div>
      </article>)}
    </div>
    <div className="analytics-module-grid">
      <section aria-labelledby="settlement-population-title"><h3 id="settlement-population-title">Population by settlement catchment</h3><p>Nearby-home estimates, not authoritative settlement membership.</p><CategoricalBars label="Nearby residents by geographic catchment" values={view.settlementPopulation} unit="count" /></section>
      <section aria-labelledby="composition-title"><h3 id="composition-title">Population composition</h3>{fidelity !== 'cohort' && <><DataState state={view.detailedCompositionAvailability}>Detailed people transported to the workbench.</DataState><CompositionDonut label="Detailed people by age band" values={view.detailedAgeBands} /></>}{fidelity !== 'detailed' && <CompositionDonut label="Authoritative cohorts by age band" values={view.cohortAgeBands} />}</section>
      <section aria-labelledby="needs-title"><h3 id="needs-title">Top recorded needs and stress</h3><p>{projection.detailBudget.peopleTruncated ? 'Partial bounded person detail; not a world aggregate.' : 'Current detailed people in the bounded projection.'}</p><CategoricalBars label="Average recorded need values" values={view.topNeeds} unit="permille" /></section>
      <section aria-labelledby="events-title"><h3 id="events-title">Recent retained events</h3>{view.recentEvents.length === 0 ? <DataState state="empty" /> : <ol className="analytics-event-list">{view.recentEvents.map((event) => <li key={event.id}><button type="button" onClick={() => onOpenEvent(event.id)}><strong>{event.type.replaceAll('_', ' ')}</strong><span>Tick {event.tick} · sequence {event.sequence}</span></button></li>)}</ol>}</section>
      <section className="analytics-comparison" aria-labelledby="comparison-title"><h3 id="comparison-title">Two-scope comparison</h3><p>Choose two settlements or two community catchments. Denominators and semantics remain visible.</p>{comparison.length === 0 ? <DataState state="empty">Select both scopes above.</DataState> : <table><thead><tr><th>Measure</th><th>{scopeLabel(projection, selectedEntity)}</th><th>{scopeLabel(projection, comparisonEntity)}</th><th>Status</th></tr></thead><tbody>{comparison.map((row) => <tr key={row.id}><th>{row.label}</th><td>{formatMetricValue(row.left, row.unit)}</td><td>{formatMetricValue(row.right, row.unit)}</td><td>{row.comparable ? 'Comparable' : row.reason}</td></tr>)}</tbody></table>}</section>
    </div>
  </section>
}

function scopeValue(entity?: WorkbenchEntityRef): string {
  return entity && (entity.kind === 'settlement' || entity.kind === 'region') ? `${entity.kind}:${entity.id}` : ''
}

function parseScope(value: string): WorkbenchEntityRef | undefined {
  if (!value) return undefined
  const separator = value.indexOf(':')
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  return (kind === 'settlement' || kind === 'region') && id ? { kind, id } : undefined
}

function scopeLabel(projection: WorkbenchProjection, entity?: WorkbenchEntityRef): string {
  if (entity?.kind === 'settlement') return projection.settlements.find((entry) => entry.id === entity.id)?.name ?? entity.id
  if (entity?.kind === 'region') return projection.communities.find((entry) => entry.catchment.id === entity.id)?.catchment.displayName ?? entity.id
  return 'Not selected'
}

function metricOverlay(id: string): 'population' | 'food' | 'community' | undefined {
  if (id.startsWith('population.') || id.startsWith('generation.')) return 'population'
  if (id.startsWith('resources.') || id.startsWith('economy.')) return 'food'
  if (id.startsWith('community.') || id.startsWith('governance.') || id.startsWith('culture.') || id.startsWith('conflict.')) return 'community'
  return undefined
}
