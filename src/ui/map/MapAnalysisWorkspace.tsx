import { useState, type ReactNode } from 'react'
import type { ProjectionOverlay, WorkbenchProjection } from '../../projection'
import { formatMetricValue, HeatScaleLegend } from '../visualization'
import { layerAvailability, MAP_LAYER_REGISTRY, visibleAreaStatistics } from './layerRegistry'

export function MapAnalysisWorkspace({ projection, overlay, onOverlay, activityLocations, households, onActivityLocations, onHouseholds, renderMap }: {
  projection: WorkbenchProjection
  overlay: ProjectionOverlay
  onOverlay: (overlay: ProjectionOverlay) => void
  activityLocations: boolean
  households: boolean
  onActivityLocations: (enabled: boolean) => void
  onHouseholds: (enabled: boolean) => void
  renderMap: (opacity: number) => ReactNode
}) {
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [opacity, setOpacity] = useState(100)
  const definition = MAP_LAYER_REGISTRY.find((layer) => layer.id === overlay)!
  const statistics = visibleAreaStatistics(projection.map, overlay)
  const contextEnabled = (id: string) => id === 'activity-locations' ? activityLocations : id === 'households' ? households : true
  const setContext = (id: string, enabled: boolean) => { if (id === 'activity-locations') onActivityLocations(enabled); if (id === 'households') onHouseholds(enabled) }
  const heroLayers: readonly { id: ProjectionOverlay; label: string }[] = [{ id: 'terrain', label: 'Terrain' }, { id: 'population', label: 'Population' }, { id: 'food', label: 'Resources' }]
  return <section className="map-analysis-workspace map-workbench" aria-labelledby="map-analysis-title">
    <header className="map-workbench__header"><div><span className="eyebrow">WORLD</span><h2 id="map-analysis-title">{projection.world.name}</h2><p>Authoritative hex geography · {projection.map.lod} LOD · {projection.map.populationFidelity.mode} population fidelity</p></div><dl className="map-workbench__summary" aria-label="World summary"><div><dt>Population</dt><dd>{projection.summary.populationCount.toLocaleString()}</dd></div><div><dt>Settlements</dt><dd>{projection.settlements.length.toLocaleString()}</dd></div><div><dt>Households</dt><dd>{projection.summary.householdCount.toLocaleString()}</dd></div></dl><button type="button" onClick={() => setCatalogOpen((value) => !value)} aria-expanded={catalogOpen} aria-controls="map-layer-catalog">{catalogOpen ? 'Hide' : 'Show'} layer catalog</button></header>
    <div className={`map-analysis-body${catalogOpen ? '' : ' catalog-closed'}`}>
      {catalogOpen && <aside id="map-layer-catalog" aria-label="Map layer catalog"><fieldset><legend>Primary quantitative or categorical layer</legend>{MAP_LAYER_REGISTRY.filter((layer) => layer.kind === 'primary').map((layer) => <label key={layer.id}><input type="radio" name="primary-map-layer" checked={overlay === layer.id} onChange={() => onOverlay(layer.id as ProjectionOverlay)} /><span><strong>{layer.label}</strong><small>{layer.description}</small></span></label>)}</fieldset><fieldset><legend>Bounded context stack</legend>{MAP_LAYER_REGISTRY.filter((layer) => layer.kind === 'context').map((layer) => { const availability = layerAvailability(layer, projection); const toggleable = layer.id === 'activity-locations' || layer.id === 'households'; return <label key={layer.id}><input type="checkbox" checked={contextEnabled(layer.id)} disabled={!toggleable || availability === 'empty'} onChange={(event) => setContext(layer.id, event.target.checked)} /><span><strong>{layer.label}</strong><small>{availability} · {layer.source}</small></span></label> })}</fieldset><fieldset><legend>Future capability layers</legend>{MAP_LAYER_REGISTRY.filter((layer) => layer.kind === 'future').map((layer) => <label key={layer.id}><input type="checkbox" disabled /><span><strong>{layer.label}</strong><small>Unavailable · {layer.dependency}</small></span></label>)}</fieldset></aside>}
      <div className="map-analysis-canvas map-workbench__canvas"><div className="map-analysis-toolbar map-workbench__toolbar"><div className="map-workbench__chips" aria-label="Primary map layers">{heroLayers.map((layer) => <button key={layer.id} type="button" aria-pressed={overlay === layer.id} onClick={() => onOverlay(layer.id)}>{layer.label}</button>)}</div><label className="map-workbench__opacity">Layer opacity <output>{opacity}%</output><input aria-label="Primary opacity" type="range" min="25" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label><span>Selection does not edit terrain</span></div>{renderMap(opacity / 100)}</div>
      <aside className="map-analysis-evidence" aria-label="Visible area evidence"><h3>{definition.label}</h3><p>{definition.domain} · {definition.source} · {definition.cadence}</p>{overlay === 'terrain' ? <p>Categorical terrain has no meaningful numeric mean.</p> : <><dl><div><dt>Minimum</dt><dd>{formatMetricValue(statistics.minimum, statistics.unit)}</dd></div><div><dt>Mean</dt><dd>{formatMetricValue(statistics.mean, statistics.unit)}</dd></div><div><dt>Maximum</dt><dd>{formatMetricValue(statistics.maximum, statistics.unit)}</dd></div></dl><HeatScaleLegend scale={{ id: overlay, label: definition.palette, unit: statistics.unit, minimum: statistics.minimum ?? 0, maximum: statistics.maximum ?? 0, diverging: overlay === 'community', provenance: { source: definition.source } }} /></>}<p>{statistics.count} visible {statistics.scope}s · {statistics.missing} missing values · {statistics.primitiveBudget} base-map primitive limit.</p><p>Normalization is explicit to each layer and never changes authoritative state.</p></aside>
    </div>
  </section>
}
