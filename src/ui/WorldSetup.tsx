export interface WorldSetupValues {
  name: string
  seed: string
  width: number
  height: number
  population: number
  placements: [{ name: string; region: 'west' | 'center' | 'east'; allocation: number }, { name: string; region: 'west' | 'center' | 'east'; allocation: number }]
}

interface WorldSetupProps {
  value: WorldSetupValues
  onChange: (value: WorldSetupValues) => void
  onClose: () => void
  onCreate: () => void
}

const DIMENSIONS = [
  { label: 'Small · 32 × 24', width: 32, height: 24 },
  { label: 'Medium · 64 × 48', width: 64, height: 48 },
  { label: 'Large · 128 × 128', width: 128, height: 128 },
]

export function WorldSetup({ value, onChange, onClose, onCreate }: WorldSetupProps) {
  const update = <K extends keyof WorldSetupValues>(key: K, next: WorldSetupValues[K]) => onChange({ ...value, [key]: next })
  const updatePlacement = (index: 0 | 1, key: 'name' | 'region' | 'allocation', next: string | number) => {
    const placements = [...value.placements] as WorldSetupValues['placements']
    placements[index] = { ...placements[index], [key]: next } as WorldSetupValues['placements'][number]
    onChange({ ...value, placements })
  }
  const allocated = value.placements[0].allocation + value.placements[1].allocation
  const distinctRegions = value.placements[0].region !== value.placements[1].region
  const namesValid = value.name.trim().length > 0 && value.placements.every((placement) => placement.name.trim().length > 0)
  const dimensions = DIMENSIONS.some((entry) => entry.width === value.width && entry.height === value.height)
    ? DIMENSIONS
    : [{ label: `Imported · ${value.width} × ${value.height}`, width: value.width, height: value.height }, ...DIMENSIONS]

  return <div className="setup-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <section className="world-setup" role="dialog" aria-modal="true" aria-labelledby="world-setup-title">
      <header><div><span className="eyebrow">WORLD CREATION</span><h2 id="world-setup-title">Shape a new world</h2><p>All inputs become part of a reproducible creation request.</p></div><button className="setup-close" aria-label="Close world setup" onClick={onClose}>×</button></header>
      <div className="setup-grid">
        <label><span>World name</span><input autoFocus aria-label="World name" value={value.name} onChange={(event) => update('name', event.target.value)} /></label>
        <label><span>Seed</span><input aria-label="World seed" value={value.seed} onChange={(event) => update('seed', event.target.value)} /></label>
        <label><span>Map scale</span><select aria-label="Map scale" value={`${value.width}x${value.height}`} onChange={(event) => { const dimension = dimensions.find((entry) => `${entry.width}x${entry.height}` === event.target.value); if (dimension) onChange({ ...value, width: dimension.width, height: dimension.height }) }}>{dimensions.map((dimension) => <option key={dimension.label} value={`${dimension.width}x${dimension.height}`}>{dimension.label}</option>)}</select></label>
        <label><span>Starting population</span><input aria-label="Starting population" type="number" min={1} max={500} value={value.population} onChange={(event) => update('population', Math.min(500, Math.max(1, Number(event.target.value) || 1)))} /></label>
      </div>
      <section className="placement-section" aria-labelledby="placement-title"><div><span className="eyebrow">INITIAL PLACEMENT</span><h3 id="placement-title">Two starting settlements</h3><p>Named placement zones are distinct from emergent communities and do not imply governance.</p></div>
        {value.placements.map((placement, index) => <div className="placement-row" key={index}><label><span>Settlement {index + 1}</span><input aria-label={`Settlement ${index + 1} name`} value={placement.name} onChange={(event) => updatePlacement(index as 0 | 1, 'name', event.target.value)} /></label><label><span>Placement region</span><select aria-label={`Settlement ${index + 1} region`} value={placement.region} onChange={(event) => updatePlacement(index as 0 | 1, 'region', event.target.value as 'west' | 'center' | 'east')}><option value="west">West</option><option value="center">Central</option><option value="east">East</option></select></label><label><span>People</span><input aria-label={`Settlement ${index + 1} people`} type="number" min={0} max={500} value={placement.allocation} onChange={(event) => updatePlacement(index as 0 | 1, 'allocation', Math.min(500, Math.max(0, Number(event.target.value) || 0)))} /></label></div>)}
        <div className={allocated === value.population && distinctRegions && namesValid ? 'allocation valid' : 'allocation'}><span>Allocated</span><strong>{allocated} / {value.population}</strong>{allocated !== value.population && <small>Adjust placements to match the starting population.</small>}{!distinctRegions && <small>Choose distinct placement regions so initial zones do not overlap.</small>}{!namesValid && <small>Name the world and both settlements before creation.</small>}</div>
      </section>
      <footer><span>Terrain preset: <strong>Seeded Valley</strong><small>1 km hex radius · max 128 × 128</small></span><div><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={allocated !== value.population || !distinctRegions || !namesValid} onClick={onCreate}>Create world</button></div></footer>
    </section>
  </div>
}
