import type { WorldDraftPreview, WorldPlacementPreset } from '../simulation/domain/types'

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
  settlementId?: string
  settlementName?: string
  /** Exact imported/previously-resolved cells. They are never converted to a preset implicitly. */
  cellIds?: string[]
}

export interface WorldSetupValues {
  name: string
  seed: string
  width: number
  height: number
  population: number
  placements: WorldSetupPlacement[]
  /** Monotonic UI-only allocation sequence; removed rows never make an ID reusable. */
  nextPlacementId: number
}

interface WorldSetupProps {
  value: WorldSetupValues
  onChange: (value: WorldSetupValues) => void
  onCancel: () => void
  onReset: () => void
  onCommit: () => void
  draftRevision?: number
  preview?: WorldDraftPreview
  previewCurrent?: boolean
  busy?: boolean
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

export function WorldSetup({ value, onChange, onCancel, onReset, onCommit, draftRevision, preview, previewCurrent = false, busy = false }: WorldSetupProps) {
  const update = <K extends keyof WorldSetupValues>(key: K, next: WorldSetupValues[K]) => onChange({ ...value, [key]: next })
  const updatePlacement = (id: string, patch: Partial<WorldSetupPlacement>) => onChange({ ...value, placements: value.placements.map((placement) => placement.id === id ? { ...placement, ...patch } : placement) })
  const addPlacement = () => {
    const index = value.placements.length + 1
    const zoneId = `population-zone-draft-${value.nextPlacementId}`
    const settlementId = `settlement-draft-${value.nextPlacementId}`
    const region = PRESETS[value.placements.length % PRESETS.length]?.value ?? 'center'
    onChange({ ...value, nextPlacementId: value.nextPlacementId + 1, placements: [...value.placements, { id: zoneId, name: `Starting place ${index}`, region, preset: region, radiusCells: 3, allocation: 0, settlementId, settlementName: `Settlement ${index}` }] })
  }
  const removePlacement = (id: string) => onChange({ ...value, placements: value.placements.filter((placement) => placement.id !== id) })
  const allocated = value.placements.reduce((total, placement) => total + placement.allocation, 0)
  const namesValid = value.name.trim().length > 0 && value.placements.length > 0 && value.placements.every((placement) => placement.name.trim().length > 0 && (!placement.settlementId || placement.settlementName?.trim()))
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
      <fieldset className="setup-fields" disabled={busy}>
        <div className="setup-grid">
          <label><span>World name</span><input autoFocus aria-label="World name" maxLength={80} value={value.name} onChange={(event) => update('name', event.target.value)} /></label>
          <label><span>Seed</span><input aria-label="World seed" maxLength={160} value={value.seed} onChange={(event) => update('seed', event.target.value)} /></label>
          <label><span>Map scale</span><select aria-label="Map scale" value={`${value.width}x${value.height}`} onChange={(event) => { const dimension = dimensions.find((entry) => `${entry.width}x${entry.height}` === event.target.value); if (dimension) onChange({ ...value, width: dimension.width, height: dimension.height }) }}>{dimensions.map((dimension) => <option key={dimension.label} value={`${dimension.width}x${dimension.height}`}>{dimension.label}</option>)}</select></label>
          <label><span>Starting population</span><input aria-label="Starting population" type="number" min={1} max={500} value={value.population} onChange={(event) => update('population', Math.min(500, Math.max(1, Number(event.target.value) || 1)))} /></label>
        </div>
        <section className="placement-section" aria-labelledby="placement-title"><div className="placement-heading"><span className="eyebrow">INITIAL PLACEMENT</span><h3 id="placement-title">Population placement zones</h3><p>Zones resolve from deterministic presets for now. They are not communities, governance, or permanent membership.</p></div>
          <div className="placement-list">
            {value.placements.map((placement, index) => <section className="placement-card" key={placement.id} aria-label={`Placement zone ${index + 1}`}>
              <div className="placement-card-heading"><strong>Zone {index + 1}</strong><code>{placement.id}</code><button type="button" className="zone-remove" aria-label={`Remove zone ${index + 1}`} onClick={() => removePlacement(placement.id)}>Remove</button></div>
              <div className="placement-row placement-row-main"><label><span>Zone name</span><input aria-label={`Zone ${index + 1} name`} maxLength={80} value={placement.name} onChange={(event) => updatePlacement(placement.id, { name: event.target.value })} /></label>{placement.cellIds === undefined && <label><span>Region preset</span><select aria-label={`Zone ${index + 1} region`} value={placement.region} onChange={(event) => { const region = event.target.value as PlacementRegion; updatePlacement(placement.id, { region, preset: region }) }}>{PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>}<label><span>People</span><input aria-label={`Zone ${index + 1} people`} type="number" min={0} max={500} value={placement.allocation} onChange={(event) => updatePlacement(placement.id, { allocation: Math.min(500, Math.max(0, Number(event.target.value) || 0)) })} /></label></div>
              <div className="placement-row placement-row-detail">{placement.cellIds === undefined && <label><span>Radius (hexes)</span><input aria-label={`Zone ${index + 1} radius`} type="number" min={0} max={32} value={placement.radiusCells} onChange={(event) => updatePlacement(placement.id, { radiusCells: Math.min(32, Math.max(0, Number(event.target.value) || 0)) })} /></label>}<label className="settlement-enabled"><span>Settlement marker</span><input aria-label={`Zone ${index + 1} has settlement`} type="checkbox" checked={placement.settlementId !== undefined} onChange={(event) => { if (event.target.checked) onChange({ ...value, nextPlacementId: value.nextPlacementId + 1, placements: value.placements.map((candidate) => candidate.id === placement.id ? { ...candidate, settlementId: candidate.settlementId ?? `settlement-draft-${value.nextPlacementId}`, settlementName: candidate.settlementName || candidate.name } : candidate) }); else updatePlacement(placement.id, { settlementId: undefined, settlementName: undefined }) }} /></label>{placement.settlementId && <label><span>Settlement name</span><input aria-label={`Zone ${index + 1} settlement name`} maxLength={80} value={placement.settlementName ?? ''} onChange={(event) => updatePlacement(placement.id, { settlementName: event.target.value })} /></label>}</div>
              <small className="placement-meta">{placement.cellIds === undefined ? `Preset: ${placement.preset} · radius ${placement.radiusCells}` : `Resolved cells: ${placement.cellIds.length} · fixed in this editor`} · settlement {placement.settlementId ?? 'none'}</small>
              {previewReady && preview && <small className="placement-preview">Accepted preview: {preview.creation.populationZones.find((zone) => zone.id === placement.id)?.cellIds.length ?? 0} resolved cells</small>}
            </section>)}
          </div>
          <button type="button" className="secondary add-zone" onClick={addPlacement}>Add placement zone</button>
          <div className={canCommit ? 'allocation valid' : 'allocation'}><span>Allocated</span><strong>{allocated} / {value.population}</strong>{allocated !== value.population && <small>Adjust zone allocations to match the starting population exactly.</small>}{value.placements.length === 0 && <small>Add at least one placement zone.</small>}{!namesValid && <small>Name the world, each zone, and every enabled settlement marker.</small>}{!zonesValid && <small>Zone radii must be whole values from 0 through 32.</small>}{zonesValid && !geometryValid && <small>Preset zones overlap. Choose different regions or smaller radii.</small>}</div>
        </section>
      </fieldset>
      <footer><span>Terrain preset: <strong>Seeded Valley</strong><small>1 km hex radius · max 128 × 128</small>{previewSummary}</span><div><button className="secondary" disabled={busy} onClick={onCancel}>Discard draft</button><button className="secondary" disabled={busy || draftRevision === undefined} onClick={onReset}>Reset draft</button><button className="primary" disabled={busy || !canCommit || !previewReady} onClick={onCommit}>Commit &amp; create world</button></div></footer>
    </section>
  </div>
}
