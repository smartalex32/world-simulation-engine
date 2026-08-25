import { useEffect, useRef, useState } from 'react'
import type { ElevationOverride, ResourceCapacityOverride, Terrain, TerrainTypeOverride, WorldDraftPreview, WorldPlacementPreset, WorldTerrainBase } from '../simulation/domain/types'
import { SETTLEMENT_TEMPLATES, type SettlementTemplateId } from '../simulation/spatial/settlementTemplates'
import { DraftZoneMap, type DraftZoneViewport, type DraftZoneViewportRequest } from './DraftZoneMap'

export type PlacementRegion = 'west' | 'center' | 'east'

export interface WorldSetupPlacement {
  /** Stable authoring ID; never derived from row order. */
  id: string
  name: string
  region: PlacementRegion
  /** Retained separately so an imported `central` preset is not silently rewritten. */
  preset: WorldPlacementPreset
  radiusCells: number
  allocation: number
  cohortAllocation?: number
  settlementId?: string
  settlementName?: string
  /** Exact imported/previously-resolved cells. They are never converted to a preset implicitly. */
  cellIds?: string[]
  template?: SettlementTemplateId
}

/** A named geographic point. It deliberately carries no demographic or social state. */
export interface WorldSetupSettlement {
  id: string
  name: string
  anchorCellId?: string
  preset?: WorldPlacementPreset
  catchmentCellIds?: string[]
  template?: Exclude<SettlementTemplateId, 'dispersed-homesteads'>
}

export interface WorldSetupRoad { id: string; cellIds: string[] }

export interface WorldSetupValues {
  name: string
  seed: string
  width: number
  height: number
  hexRadiusMeters: number
  population: number
  terrainBase: WorldTerrainBase
  placements: WorldSetupPlacement[]
  /** Monotonic UI-only allocation sequence; removed rows never make an ID reusable. */
  nextPlacementId: number
  settlements: WorldSetupSettlement[]
  /** Monotonic UI-only sequence for independently authored settlements. */
  nextSettlementId: number
  roads: WorldSetupRoad[]
  nextRoadId: number
  terrainOverrides: TerrainTypeOverride[]
  elevationOverrides: ElevationOverride[]
  resourceCapacityOverrides: ResourceCapacityOverride[]
}

interface WorldSetupProps {
  value: WorldSetupValues
  onChange: (value: WorldSetupValues | ((current: WorldSetupValues) => WorldSetupValues)) => void
  onCancel: () => void
  onReset: () => void
  onCommit: () => void
  draftRevision?: number
  preview?: WorldDraftPreview
  previewCurrent?: boolean
  busy?: boolean
  draftViewport?: DraftZoneViewport
  onDraftViewportRequest?: (request: DraftZoneViewportRequest) => void
  onZoneCellsCommit?: (zoneId: string, cellIds: readonly string[]) => void
  onTerrainPaintCommit?: (terrain: Terrain, cellIds: readonly string[]) => void
  onElevationPaintCommit?: (elevation: number, cellIds: readonly string[]) => void
  onResourcePaintCommit?: (resourceCapacity: number, cellIds: readonly string[]) => void
  onExportDraft?: () => void
  onImportDraft?: (file: File | undefined) => void
  error?: string
}

const DIMENSIONS = [
  { label: 'Small · 32 × 24', width: 32, height: 24 },
  { label: 'Medium · 64 × 48', width: 64, height: 48 },
  { label: 'Large · 128 × 128', width: 128, height: 128 },
]

const PRESETS: readonly { value: PlacementRegion; label: string }[] = [
  { value: 'west', label: 'West' }, { value: 'center', label: 'Central' }, { value: 'east', label: 'East' },
]

export function regionForPreset(preset: WorldPlacementPreset): PlacementRegion {
  return preset === 'central' ? 'center' : preset
}

/** Preset zones are axial circles sharing the map's middle row. This is a
 * conservative authoring check; worker preview remains the authority for
 * terrain passability after the seeded world is generated. */
export function presetZonesDoNotOverlap(placements: readonly WorldSetupPlacement[], width: number): boolean {
  const targetQ = (region: PlacementRegion) => region === 'west' ? Math.floor(width / 4) : region === 'east' ? Math.floor(width * 3 / 4) : Math.floor(width / 2)
  for (let first = 0; first < placements.length; first += 1) {
    for (let second = first + 1; second < placements.length; second += 1) {
      const left = placements[first]
      const right = placements[second]
      if (!left || !right || left.cellIds !== undefined || right.cellIds !== undefined) continue
      if (Math.abs(targetQ(left.region) - targetQ(right.region)) <= left.radiusCells + right.radiusCells) return false
    }
  }
  return true
}

export function isWorldSetupGeometryValid(value: Pick<WorldSetupValues, 'placements' | 'width'>): boolean {
  return value.placements.every((placement) => placement.cellIds !== undefined || (placement.radiusCells >= 0 && placement.radiusCells <= 32 && Number.isInteger(placement.radiusCells)))
    && presetZonesDoNotOverlap(value.placements, value.width)
}

export function WorldSetup({ value, onChange, onCancel, onReset, onCommit, draftRevision, preview, previewCurrent = false, busy = false, draftViewport, onDraftViewportRequest, onZoneCellsCommit, onTerrainPaintCommit, onElevationPaintCommit, onResourcePaintCommit, onExportDraft, onImportDraft, error }: WorldSetupProps) {
  const importRef = useRef<HTMLInputElement>(null)
  const editablePlacements = value.placements.filter((placement) => placement.settlementId === undefined)
  const [selectedZoneId, setSelectedZoneId] = useState<string>()
  const [terrainPaint, setTerrainPaint] = useState<Terrain>('plain')
  const [elevationPaint, setElevationPaint] = useState(300)
  const [resourcePaint, setResourcePaint] = useState(100)
  const [selectedSettlementId, setSelectedSettlementId] = useState<string>()
  const [authoringLayer, setAuthoringLayer] = useState<'zones' | 'terrain' | 'elevation' | 'resources' | 'settlements' | 'catchments' | 'roads'>('zones')
  const [selectedRoadId, setSelectedRoadId] = useState<string>()
  useEffect(() => {
    if (!editablePlacements.some((placement) => placement.id === selectedZoneId)) setSelectedZoneId(editablePlacements[0]?.id)
  }, [editablePlacements, selectedZoneId])
  const update = <K extends keyof WorldSetupValues>(key: K, next: WorldSetupValues[K]) => onChange((current) => ({ ...current, [key]: next }))
  const updatePlacement = (id: string, patch: Partial<WorldSetupPlacement>) => onChange((current) => ({ ...current, placements: current.placements.map((placement) => placement.id === id ? { ...placement, ...patch } : placement) }))
  const applyTemplate = (placement: WorldSetupPlacement, template: SettlementTemplateId | undefined) => onChange((current) => {
    if (template === undefined) return { ...current, placements: current.placements.map((candidate) => candidate.id === placement.id ? { ...candidate, template: undefined } : candidate), settlements: current.settlements.map((settlement) => settlement.id === placement.settlementId ? { ...settlement, template: undefined } : settlement) }
    const definition = SETTLEMENT_TEMPLATES.find((candidate) => candidate.id === template)!
    if (!definition.requiresSettlementMarker) {
      return { ...current, placements: current.placements.map((candidate) => candidate.id === placement.id ? { ...candidate, template, settlementId: undefined, settlementName: undefined } : candidate), settlements: current.settlements.filter((settlement) => settlement.id !== placement.settlementId) }
    }
    const settlementId = placement.settlementId ?? `settlement-draft-${current.nextSettlementId}`
    const settlementName = placement.settlementName || placement.name || `Settlement ${current.settlements.length + 1}`
    const settlement = { id: settlementId, name: settlementName, preset: placement.preset, template: template as Exclude<SettlementTemplateId, 'dispersed-homesteads'> }
    return { ...current, nextSettlementId: placement.settlementId ? current.nextSettlementId : current.nextSettlementId + 1, placements: current.placements.map((candidate) => candidate.id === placement.id ? { ...candidate, template, settlementId, settlementName, radiusCells: definition.defaultRadiusCells } : candidate), settlements: current.settlements.some((candidate) => candidate.id === settlementId) ? current.settlements.map((candidate) => candidate.id === settlementId ? { ...candidate, template: template as Exclude<SettlementTemplateId, 'dispersed-homesteads'> } : candidate) : [...current.settlements, settlement] }
  })
  const addPlacement = () => {
    const index = value.placements.length + 1
    const zoneId = `population-zone-draft-${value.nextPlacementId}`
    const settlementId = `settlement-draft-${value.nextPlacementId}`
    const region = PRESETS[value.placements.length % PRESETS.length]?.value ?? 'center'
    onChange({ ...value, nextPlacementId: value.nextPlacementId + 1, nextSettlementId: Math.max(value.nextSettlementId, value.nextPlacementId + 1), settlements: [...value.settlements, { id: settlementId, name: `Settlement ${index}`, preset: region }], placements: [...value.placements, { id: zoneId, name: `Starting place ${index}`, region, preset: region, radiusCells: 3, allocation: 0, cohortAllocation: 0, settlementId, settlementName: `Settlement ${index}` }] })
  }
  const removePlacement = (id: string) => {
    const settlementId = value.placements.find((placement) => placement.id === id)?.settlementId
    onChange({ ...value, placements: value.placements.filter((placement) => placement.id !== id), settlements: settlementId ? value.settlements.filter((settlement) => settlement.id !== settlementId) : value.settlements })
  }
  const updateSettlement = (id: string, patch: Partial<WorldSetupSettlement>) => onChange({ ...value, settlements: value.settlements.map((settlement) => settlement.id === id ? { ...settlement, ...patch } : settlement) })
  const removeSettlement = (id: string) => onChange({ ...value, settlements: value.settlements.filter((settlement) => settlement.id !== id), placements: value.placements.map((placement) => placement.settlementId === id ? { ...placement, settlementId: undefined, settlementName: undefined } : placement) })
  const addSettlement = () => {
    const id = `settlement-draft-${value.nextSettlementId}`
    onChange({ ...value, nextSettlementId: value.nextSettlementId + 1, settlements: [...value.settlements, { id, name: `Settlement ${value.settlements.length + 1}`, preset: 'center' }] })
    setSelectedSettlementId(id)
  }
  const updateRoad = (id: string, cellIds: readonly string[]) => onChange({ ...value, roads: value.roads.map((road) => road.id === id ? { id, cellIds: [...cellIds] } : road) })
  const addRoad = () => { const id = `road-draft-${value.nextRoadId}`; onChange({ ...value, nextRoadId: value.nextRoadId + 1, roads: [...value.roads, { id, cellIds: [] }] }); setSelectedRoadId(id) }
  const removeRoad = (id: string) => onChange({ ...value, roads: value.roads.filter((road) => road.id !== id) })
  const allocated = value.placements.reduce((total, placement) => total + placement.allocation, 0)
  const namesValid = value.name.trim().length > 0 && value.placements.length > 0 && value.placements.every((placement) => placement.name.trim().length > 0 && (!placement.settlementId || placement.settlementName?.trim())) && value.settlements.every((settlement) => settlement.name.trim().length > 0)
  const zonesValid = value.placements.every((placement) => placement.cellIds !== undefined || (placement.radiusCells >= 0 && placement.radiusCells <= 32 && Number.isInteger(placement.radiusCells)))
  const geometryValid = isWorldSetupGeometryValid(value)
  const canCommit = allocated === value.population && namesValid && geometryValid
  const dimensions = DIMENSIONS.some((entry) => entry.width === value.width && entry.height === value.height)
    ? DIMENSIONS : [{ label: `Imported · ${value.width} × ${value.height}`, width: value.width, height: value.height }, ...DIMENSIONS]
  const previewReady = previewCurrent && preview !== undefined && preview.revision === draftRevision
  const previewSummary = previewReady && preview
    ? <small className="draft-preview" aria-live="polite">Draft preview · {preview.cellCount.toLocaleString()} cells · {preview.passableCellCount.toLocaleString()} passable · {preview.terrainCounts.water.toLocaleString()} water</small>
    : <small className="draft-preview stale" aria-live="polite">Preview is stale while this draft is edited; commit is unavailable until this exact valid draft is accepted.</small>
  return <div className="setup-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onCancel() }}>
    <section className="world-setup" role="dialog" aria-modal="true" aria-labelledby="world-setup-title">
      <header><div><span className="eyebrow">WORLD DRAFT</span><h2 id="world-setup-title">Shape a new world</h2><p>This is a detached draft. Your active simulation remains unchanged until you commit it.</p></div><button className="setup-close" aria-label="Discard world draft" disabled={busy} onClick={onCancel}>×</button></header>
      <fieldset className="setup-fields">
        {error && <p className="draft-rejection" role="alert">Draft update rejected: {error}</p>}
        <div className="setup-grid">
          <label><span>World name</span><input autoFocus aria-label="World name" maxLength={80} value={value.name} onChange={(event) => update('name', event.target.value)} /></label>
          <label><span>Seed</span><input aria-label="World seed" maxLength={160} value={value.seed} onChange={(event) => update('seed', event.target.value)} /></label>
          <label><span>Map scale</span><select aria-label="Map scale" value={`${value.width}x${value.height}`} onChange={(event) => { const dimension = dimensions.find((entry) => `${entry.width}x${entry.height}` === event.target.value); if (dimension) onChange((current) => ({ ...current, width: dimension.width, height: dimension.height })) }}>{dimensions.map((dimension) => <option key={dimension.label} value={`${dimension.width}x${dimension.height}`}>{dimension.label}</option>)}</select></label>
          <label><span>Physical hex radius</span><select aria-label="Physical hex radius" value={value.hexRadiusMeters} onChange={(event) => update('hexRadiusMeters', Number(event.target.value))}>{[100, 250, 500, 1000, 2500, 5000, 10000].map((radius) => <option key={radius} value={radius}>{radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}</option>)}</select></label>
          <label><span>Terrain baseline</span><select aria-label="Terrain baseline" value={value.terrainBase} onChange={(event) => { const terrainBase = event.target.value as WorldTerrainBase; onChange((current) => ({ ...current, terrainBase, terrainOverrides: [], elevationOverrides: [], resourceCapacityOverrides: [] })) }}><option value="seeded-valley">Seeded valley</option><option value="blank-land">Blank land canvas</option></select></label>
          <label><span>Starting population</span><input aria-label="Starting population" type="number" min={1} max={500} value={value.population} onChange={(event) => update('population', Math.min(500, Math.max(1, Number(event.target.value) || 1)))} /></label>
        </div>
        {value.terrainBase === 'blank-land' && <small className="draft-baseline-note">Blank land begins as passable plain terrain. Use the Terrain editor to paint water around your intended landmass; changing the baseline clears existing terrain, elevation, and resource edits.</small>}
        <section className="placement-section" aria-labelledby="placement-title"><div className="placement-heading"><span className="eyebrow">INITIAL PLACEMENT</span><h3 id="placement-title">Population placement zones</h3><p>Zones resolve from deterministic presets for now. They are not communities, governance, or permanent membership.</p></div>
          <div className="placement-list">
            {value.placements.map((placement, index) => <section className="placement-card" key={placement.id} aria-label={`Placement zone ${index + 1}`}>
              <div className="placement-card-heading"><strong>Zone {index + 1}</strong><code>{placement.id}</code><button type="button" className="zone-remove" aria-label={`Remove zone ${index + 1}`} onClick={() => removePlacement(placement.id)}>Remove</button></div>
              <div className="placement-row placement-row-main"><label><span>Zone name</span><input aria-label={`Zone ${index + 1} name`} maxLength={80} value={placement.name} onChange={(event) => updatePlacement(placement.id, { name: event.target.value })} /></label>{placement.cellIds === undefined && <label><span>Region preset</span><select aria-label={`Zone ${index + 1} region`} value={placement.region} onChange={(event) => { const region = event.target.value as PlacementRegion; onChange((current) => ({ ...current, placements: current.placements.map((candidate) => candidate.id === placement.id ? { ...candidate, region, preset: region } : candidate), settlements: current.settlements.map((settlement) => settlement.id === placement.settlementId && settlement.anchorCellId === undefined ? { ...settlement, preset: region } : settlement) })) }}>{PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>}<label><span>Detailed people</span><input aria-label={`Zone ${index + 1} people`} type="number" min={0} max={500} value={placement.allocation} onChange={(event) => updatePlacement(placement.id, { allocation: Math.min(500, Math.max(0, Number(event.target.value) || 0)) })} /></label><label><span>Distant cohort people</span><input aria-label={`Zone ${index + 1} distant cohort people`} type="number" min={0} max={1000000000} value={placement.cohortAllocation ?? 0} onChange={(event) => updatePlacement(placement.id, { cohortAllocation: Math.min(1000000000, Math.max(0, Number(event.target.value) || 0)) })} /></label></div>
              <div className="placement-row placement-row-detail">{placement.cellIds === undefined && <label><span>Radius (hexes)</span><input aria-label={`Zone ${index + 1} radius`} type="number" min={0} max={32} value={placement.radiusCells} onChange={(event) => updatePlacement(placement.id, { radiusCells: Math.min(32, Math.max(0, Number(event.target.value) || 0)) })} /></label>}<label className="settlement-enabled"><span>Settlement marker</span><input aria-label={`Zone ${index + 1} has settlement`} type="checkbox" checked={placement.settlementId !== undefined} onChange={(event) => { if (event.target.checked) { const id = placement.settlementId ?? `settlement-draft-${value.nextSettlementId}`; const name = placement.settlementName || placement.name; onChange({ ...value, nextSettlementId: value.nextSettlementId + 1, settlements: value.settlements.some((settlement) => settlement.id === id) ? value.settlements : [...value.settlements, { id, name, preset: placement.preset }], placements: value.placements.map((candidate) => candidate.id === placement.id ? { ...candidate, settlementId: id, settlementName: name } : candidate) }) } else { onChange({ ...value, settlements: value.settlements.filter((settlement) => settlement.id !== placement.settlementId), placements: value.placements.map((candidate) => candidate.id === placement.id ? { ...candidate, settlementId: undefined, settlementName: undefined } : candidate) }) } }} /></label>{placement.settlementId && <label><span>Settlement name</span><input aria-label={`Zone ${index + 1} settlement name`} maxLength={80} value={placement.settlementName ?? ''} onChange={(event) => { const name = event.target.value; onChange({ ...value, settlements: value.settlements.map((settlement) => settlement.id === placement.settlementId ? { ...settlement, name } : settlement), placements: value.placements.map((candidate) => candidate.id === placement.id ? { ...candidate, settlementName: name } : candidate) }) }} /></label>}</div>
              <small className="placement-meta">{placement.cellIds === undefined ? `Preset: ${placement.preset} · radius ${placement.radiusCells}` : `Resolved cells: ${placement.cellIds.length} · fixed in this editor`} · settlement {placement.settlementId ?? 'none'}</small>
              {previewReady && preview && (() => {
                const seedPreview = preview.settlementSeedPreviews.find((candidate) => candidate.zoneId === placement.id)
                if (!seedPreview) return <small className="placement-preview">Accepted preview: {preview.creation.populationZones.find((zone) => zone.id === placement.id)?.cellIds.length ?? 0} resolved cells</small>
                return <small className="placement-preview">Accepted preview: {preview.creation.populationZones.find((zone) => zone.id === placement.id)?.cellIds.length ?? 0} resolved cells · {seedPreview.eligibleHomeCellCount} home cells · {seedPreview.peoplePerHomeCell} people/home · food {seedPreview.resourceCapacityPerPerson.toFixed(2)}/person{placement.cohortAllocation ? ` · ${placement.cohortAllocation.toLocaleString()} distant cohort people` : ''}{seedPreview.averageAnchorTravelSteps === undefined ? '' : ` · ${seedPreview.averageAnchorTravelSteps} steps to anchor`}{seedPreview.recommendedPopulationCapacity === undefined ? '' : ` · profile guide ${seedPreview.recommendedPopulationCapacity.toLocaleString()}`}</small>
              })()}
            </section>)}
          </div>
          <div className="placement-template-list" aria-label="Placement templates">{value.placements.map((placement, index) => <label key={placement.id}><span>Zone {index + 1} starting profile</span><select aria-label={`Zone ${index + 1} starting profile`} value={placement.template ?? ''} onChange={(event) => applyTemplate(placement, event.target.value === '' ? undefined : event.target.value as SettlementTemplateId)}><option value="">Custom placement</option>{SETTLEMENT_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>)}</div>
          <button type="button" className="secondary add-zone" onClick={addPlacement}>Add placement zone</button>
          <div className="authoring-layer-toggle" role="group" aria-label="Draft map editor"><button type="button" className={authoringLayer === 'zones' ? 'secondary active' : 'secondary'} onClick={() => setAuthoringLayer('zones')}>Placement zones</button><button type="button" className={authoringLayer === 'settlements' ? 'secondary active' : 'secondary'} onClick={() => setAuthoringLayer('settlements')}>Settlements</button><button type="button" className={authoringLayer === 'catchments' ? 'secondary active' : 'secondary'} onClick={() => setAuthoringLayer('catchments')}>Catchments</button><button type="button" className={authoringLayer === 'roads' ? 'secondary active' : 'secondary'} onClick={() => setAuthoringLayer('roads')}>Roads</button><button type="button" className={authoringLayer === 'terrain' ? 'secondary active' : 'secondary'} onClick={() => setAuthoringLayer('terrain')}>Terrain</button><button type="button" className={authoringLayer === 'elevation' ? 'secondary active' : 'secondary'} onClick={() => setAuthoringLayer('elevation')}>Elevation</button><button type="button" className={authoringLayer === 'resources' ? 'secondary active' : 'secondary'} onClick={() => setAuthoringLayer('resources')}>Resources</button></div>
          {authoringLayer === 'zones' && <section className="placement-drawing" aria-labelledby="zone-drawing-title">
            <div><span className="eyebrow">OPTIONAL DIRECT PLACEMENT</span><h3 id="zone-drawing-title">Draw a population zone</h3><p>Only zones without settlement markers can be drawn. Drawing replaces that zone’s preset with explicit generated cell IDs after worker validation.</p></div>
            {editablePlacements.length === 0 ? <small className="drawing-unavailable">Disable a settlement marker on a placement zone to draw it directly.</small> : <>
              <label><span>Zone to draw</span><select aria-label="Zone to draw" value={selectedZoneId ?? ''} onChange={(event) => setSelectedZoneId(event.target.value)}>{editablePlacements.map((placement) => <option key={placement.id} value={placement.id}>{placement.name || placement.id}</option>)}</select></label>
              {draftRevision !== undefined && selectedZoneId && onDraftViewportRequest && onZoneCellsCommit
                ? <DraftZoneMap world={{ width: value.width, height: value.height }} viewport={draftViewport} draftRevision={draftRevision} selectedZoneId={selectedZoneId} disabled={busy} onViewportRequest={onDraftViewportRequest} onSelectionCommit={onZoneCellsCommit} />
                : <small className="drawing-unavailable">Preparing the worker-owned draft…</small>}
            </>}
          </section>}
          {authoringLayer === 'settlements' && <section className="placement-drawing" aria-labelledby="settlement-editing-title">
            <div><span className="eyebrow">GEOGRAPHIC PLACES</span><h3 id="settlement-editing-title">Settlement markers</h3><p>Settlements are named map points only. They do not create a government, culture, economy, or automatic community membership.</p></div>
            <div className="placement-list">{value.settlements.map((settlement) => <section className="placement-card" key={settlement.id}><div className="placement-card-heading"><strong>{settlement.name || 'Unnamed settlement'}</strong><code>{settlement.id}</code><button type="button" className="zone-remove" onClick={() => removeSettlement(settlement.id)}>Remove</button></div><div className="placement-row"><label><span>Name</span><input aria-label={`Settlement ${settlement.id} name`} maxLength={80} value={settlement.name} onChange={(event) => updateSettlement(settlement.id, { name: event.target.value })} /></label><label><span>Anchor cell</span><output>{settlement.anchorCellId ?? `Preset: ${settlement.preset ?? 'center'}`}</output></label><button type="button" className="secondary" onClick={() => { setSelectedSettlementId(settlement.id); setAuthoringLayer('settlements') }}>Place on map</button></div></section>)}</div>
            <button type="button" className="secondary add-zone" onClick={addSettlement}>Add settlement</button>
            {value.settlements.length === 0 ? <small className="drawing-unavailable">Add a settlement marker to choose a geographic location.</small> : <><label><span>Settlement to place</span><select aria-label="Settlement to place" value={selectedSettlementId ?? value.settlements[0]?.id ?? ''} onChange={(event) => setSelectedSettlementId(event.target.value)}>{value.settlements.map((settlement) => <option key={settlement.id} value={settlement.id}>{settlement.name || settlement.id}</option>)}</select></label>{(() => { const settlement = value.settlements.find((candidate) => candidate.id === (selectedSettlementId ?? value.settlements[0]?.id)); return draftRevision !== undefined && settlement && onDraftViewportRequest ? <DraftZoneMap world={{ width: value.width, height: value.height }} viewport={draftViewport} draftRevision={draftRevision} selectedSettlementId={settlement.id} settlementAnchorCellId={settlement.anchorCellId} disabled={busy} onViewportRequest={onDraftViewportRequest} onSelectionCommit={() => {}} onSettlementAnchorCommit={(id, cellId) => updateSettlement(id, { anchorCellId: cellId, preset: undefined, catchmentCellIds: undefined })} /> : <small className="drawing-unavailable">Preparing the worker-owned draft…</small> })()}</>}
          </section>}
          {authoringLayer === 'catchments' && <section className="placement-drawing" aria-labelledby="catchment-editing-title"><div><span className="eyebrow">GEOGRAPHIC CATCHMENTS</span><h3 id="catchment-editing-title">Settlement catchment</h3><p>Catchments are authored passable map areas for inspection. They do not give people settlement membership or directly change behavior.</p></div>{value.settlements.length === 0 ? <small className="drawing-unavailable">Add and place a settlement before authoring its catchment.</small> : <><label><span>Settlement</span><select aria-label="Settlement catchment to draw" value={selectedSettlementId ?? value.settlements[0]?.id ?? ''} onChange={(event) => setSelectedSettlementId(event.target.value)}>{value.settlements.map((settlement) => <option key={settlement.id} value={settlement.id}>{settlement.name || settlement.id}</option>)}</select></label>{(() => { const settlement = value.settlements.find((candidate) => candidate.id === (selectedSettlementId ?? value.settlements[0]?.id)); return draftRevision !== undefined && settlement?.anchorCellId && onDraftViewportRequest ? <DraftZoneMap world={{ width: value.width, height: value.height }} viewport={draftViewport} draftRevision={draftRevision} selectedSettlementCatchmentId={settlement.id} settlementCatchmentCellIds={settlement.catchmentCellIds} disabled={busy} onViewportRequest={onDraftViewportRequest} onSelectionCommit={() => {}} onSettlementCatchmentCommit={(id, cellIds) => updateSettlement(id, { catchmentCellIds: [...new Set([...cellIds, settlement.anchorCellId!])].sort() })} /> : <small className="drawing-unavailable">Place the selected settlement anchor before drawing its catchment.</small> })()}</>}</section>}
          {authoringLayer === 'roads' && <section className="placement-drawing" aria-labelledby="road-editing-title"><div><span className="eyebrow">TRANSPORT</span><h3 id="road-editing-title">Road segments</h3><p>Roads are ordered, contiguous passable map geometry. They have no owner, traffic, trade, or economic behavior.</p></div><div className="placement-list">{value.roads.map((road) => <section className="placement-card" key={road.id}><div className="placement-card-heading"><strong>{road.id}</strong><code>{road.cellIds.length} cells</code><button type="button" className="zone-remove" onClick={() => removeRoad(road.id)}>Delete</button></div><button type="button" className="secondary" onClick={() => setSelectedRoadId(road.id)}>Draw or replace</button></section>)}</div><button type="button" className="secondary add-zone" onClick={addRoad}>Add road</button>{value.roads.length === 0 ? <small className="drawing-unavailable">Add a road, then draw at least two contiguous passable cells.</small> : <><label><span>Road to draw</span><select aria-label="Road to draw" value={selectedRoadId ?? value.roads[0]?.id ?? ''} onChange={(event) => setSelectedRoadId(event.target.value)}>{value.roads.map((road) => <option key={road.id} value={road.id}>{road.id}</option>)}</select></label>{(() => { const road = value.roads.find((candidate) => candidate.id === (selectedRoadId ?? value.roads[0]?.id)); return draftRevision !== undefined && road && onDraftViewportRequest ? <DraftZoneMap world={{ width: value.width, height: value.height }} viewport={draftViewport} draftRevision={draftRevision} selectedRoadId={road.id} roadCellIds={road.cellIds} disabled={busy} onViewportRequest={onDraftViewportRequest} onSelectionCommit={() => {}} onRoadCellsCommit={updateRoad} /> : <small className="drawing-unavailable">Preparing the worker-owned draft…</small> })()}</>}</section>}
          {authoringLayer === 'terrain' && <section className="placement-drawing" aria-labelledby="terrain-painting-title">
            <div><span className="eyebrow">TERRAIN TYPE</span><h3 id="terrain-painting-title">Paint draft terrain</h3><p>Terrain changes are sparse, deterministic draft edits. They update placement validation and only enter the live simulation on commit.</p></div>
            <label><span>Paint type</span><select aria-label="Terrain paint type" value={terrainPaint} onChange={(event) => setTerrainPaint(event.target.value as Terrain)}><option value="plain">Plain</option><option value="hill">Hill</option><option value="water">Water</option></select></label>
            {draftRevision !== undefined && onDraftViewportRequest && onZoneCellsCommit && onTerrainPaintCommit
              ? <DraftZoneMap world={{ width: value.width, height: value.height }} viewport={draftViewport} draftRevision={draftRevision} disabled={busy} onViewportRequest={onDraftViewportRequest} onSelectionCommit={onZoneCellsCommit} terrainPaint={terrainPaint} onTerrainPaintCommit={onTerrainPaintCommit} />
              : <small className="drawing-unavailable">Preparing the worker-owned draft…</small>}
            <small className="placement-meta">{value.terrainOverrides.length} active terrain override{value.terrainOverrides.length === 1 ? '' : 's'}</small>
          </section>}
          {authoringLayer === 'elevation' && <section className="placement-drawing" aria-labelledby="elevation-painting-title">
            <div><span className="eyebrow">ELEVATION</span><h3 id="elevation-painting-title">Set generated elevation</h3><p>Elevation uses the generator’s 0–1000 cell scale. Terrain type remains explicit when it has been painted separately.</p></div>
            <label><span>Elevation</span><input aria-label="Elevation paint value" type="number" min={0} max={1000} value={elevationPaint} onChange={(event) => setElevationPaint(Math.min(1000, Math.max(0, Number(event.target.value) || 0)))} /></label>
            {draftRevision !== undefined && onDraftViewportRequest && onZoneCellsCommit && onElevationPaintCommit
              ? <DraftZoneMap world={{ width: value.width, height: value.height }} viewport={draftViewport} draftRevision={draftRevision} disabled={busy} onViewportRequest={onDraftViewportRequest} onSelectionCommit={onZoneCellsCommit} elevationPaint={elevationPaint} onElevationPaintCommit={onElevationPaintCommit} />
              : <small className="drawing-unavailable">Preparing the worker-owned draft…</small>}
            <small className="placement-meta">{value.elevationOverrides.length} active elevation override{value.elevationOverrides.length === 1 ? '' : 's'}</small>
          </section>}
          {authoringLayer === 'resources' && <section className="placement-drawing" aria-labelledby="resource-painting-title">
            <div><span className="eyebrow">RESOURCE CAPACITY</span><h3 id="resource-painting-title">Set renewable food capacity</h3><p>Water cells cannot receive a resource edit. Capacity is an explicit whole-unit starting value.</p></div>
            <label><span>Capacity</span><input aria-label="Resource paint value" type="number" min={0} max={1000} value={resourcePaint} onChange={(event) => setResourcePaint(Math.min(1000, Math.max(0, Number(event.target.value) || 0)))} /></label>
            {draftRevision !== undefined && onDraftViewportRequest && onZoneCellsCommit && onResourcePaintCommit ? <DraftZoneMap world={{ width: value.width, height: value.height }} viewport={draftViewport} draftRevision={draftRevision} disabled={busy} onViewportRequest={onDraftViewportRequest} onSelectionCommit={onZoneCellsCommit} resourcePaint={resourcePaint} onResourcePaintCommit={onResourcePaintCommit} /> : <small className="drawing-unavailable">Preparing the worker-owned draft…</small>}
            <small className="placement-meta">{value.resourceCapacityOverrides.length} active resource override{value.resourceCapacityOverrides.length === 1 ? '' : 's'}</small>
          </section>}
          <div className={canCommit ? 'allocation valid' : 'allocation'}><span>Allocated</span><strong>{allocated} / {value.population}</strong>{allocated !== value.population && <small>Adjust zone allocations to match the starting population exactly.</small>}{value.placements.length === 0 && <small>Add at least one placement zone.</small>}{!namesValid && <small>Name the world, each zone, and every enabled settlement marker.</small>}{!zonesValid && <small>Zone radii must be whole values from 0 through 32.</small>}{zonesValid && !geometryValid && <small>Preset zones overlap. Choose different regions or smaller radii.</small>}</div>
        </section>
      </fieldset>
      <footer><span>Terrain baseline: <strong>{value.terrainBase === 'blank-land' ? 'Blank land canvas' : 'Seeded Valley'}</strong><small>{value.hexRadiusMeters >= 1000 ? `${value.hexRadiusMeters / 1000} km` : `${value.hexRadiusMeters} m`} hex radius · max 128 × 128</small>{previewSummary}</span><div>{onImportDraft && <><input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { onImportDraft(event.target.files?.[0]); event.target.value = '' }} /><button className="secondary" disabled={busy} onClick={() => importRef.current?.click()}>Import draft</button></>}{onExportDraft && <button className="secondary" disabled={busy || draftRevision === undefined} onClick={onExportDraft}>Export draft</button>}<button className="secondary" disabled={busy} onClick={onCancel}>Discard draft</button><button className="secondary" disabled={busy || draftRevision === undefined} onClick={onReset}>Reset draft</button><button className="primary" disabled={busy || !canCommit || !previewReady} onClick={onCommit}>Commit &amp; create world</button></div></footer>
    </section>
  </div>
}
