import { useEffect, useMemo, useRef, useState } from 'react'
import { WorkbenchDatabase, type SavedSnapshot } from './persistence/database'
import type { GeographicCell, PersonState, SimulationEvent, StatisticSample, WorldProjection } from './simulation/domain/types'
import { hexNeighbors } from './simulation/spatial/hex'
import { HexMap, type MapOverlay } from './ui/HexMap'
import { SimulationWorkerClient } from './worker/client'
import type { SimulationResponse } from './worker/protocol'

const SPEEDS = [
  { value: 1, label: '1 hour / batch' },
  { value: 24, label: '1 day / batch' },
  { value: 168, label: '1 week / batch' },
  { value: 720, label: '30 days / batch' },
]

export default function App() {
  const client = useMemo(() => new SimulationWorkerClient(), [])
  const database = useMemo(() => new WorkbenchDatabase(), [])
  const [seed, setSeed] = useState('valley-001')
  const [projection, setProjection] = useState<WorldProjection>()
  const projectionRef = useRef<WorldProjection | undefined>(undefined)
  const [status, setStatus] = useState<'starting' | 'idle' | 'paused' | 'playing'>('starting')
  const [speed, setSpeed] = useState(24)
  const [events, setEvents] = useState<SimulationEvent[]>([])
  const [statistics, setStatistics] = useState<StatisticSample[]>([])
  const [selected, setSelected] = useState<GeographicCell>()
  const [selectedPersonId, setSelectedPersonId] = useState<string>()
  const [overlay, setOverlay] = useState<MapOverlay>('terrain')
  const [snapshots, setSnapshots] = useState<SavedSnapshot[]>([])
  const [error, setError] = useState<string>()
  const [processingMs, setProcessingMs] = useState(0)
  const [saveName, setSaveName] = useState('')
  const lastAutosavedTick = useRef(-1)
  const statusRef = useRef<typeof status>('starting')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    projectionRef.current = projection
  }, [projection])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    const unsubscribe = client.subscribe((response) => {
      void handleResponse(response)
    })
    async function handleResponse(response: SimulationResponse) {
      if (response.type === 'READY') {
        client.create(seed)
      } else if (response.type === 'FRAME') {
        const nextProjection = { ...response.projection, digest: response.projection.digest ?? projectionRef.current?.digest }
        projectionRef.current = nextProjection
        setProjection(nextProjection)
        setProcessingMs(response.processingMs)
        if (response.events.length) setEvents((current) => [...response.events].reverse().concat(current).slice(0, 150))
        if (response.statistics.length) setStatistics((current) => [...response.statistics, ...current].slice(0, 150))
        try { await database.appendTelemetry(response.events, response.statistics) } catch (reason) { setError(messageOf(reason)) }
      } else if (response.type === 'STATUS') {
        setStatus(response.status)
        setSpeed(response.ticksPerBatch)
        if (response.status === 'paused') void autosave()
      } else if (response.type === 'ERROR') {
        setError(response.message)
        setStatus('paused')
      }
    }
    void refreshSnapshots()
    const interval = window.setInterval(() => { if (statusRef.current === 'playing') void autosave() }, 5000)
    return () => {
      window.clearInterval(interval)
      unsubscribe()
      client.dispose()
    }
  }, [client, database])

  async function autosave() {
    const current = projectionRef.current
    if (!current || current.tick === lastAutosavedTick.current) return
    try {
      const snapshot = await client.snapshot()
      await database.saveSnapshot(snapshot, 'autosave')
      lastAutosavedTick.current = snapshot.state.tick
      await refreshSnapshots(snapshot.state.runId)
    } catch (reason) {
      setError(`Autosave failed: ${messageOf(reason)}`)
    }
  }

  async function refreshSnapshots(runId = projectionRef.current?.runId) {
    try { setSnapshots(await database.listSnapshots(runId)) } catch (reason) { setError(messageOf(reason)) }
  }

  async function saveNamed() {
    try {
      const snapshot = await client.snapshot()
      await database.saveSnapshot(snapshot, 'named', saveName)
      setSaveName('')
      await refreshSnapshots(snapshot.state.runId)
    } catch (reason) { setError(messageOf(reason)) }
  }

  async function exportRun() {
    try {
      const snapshot = await client.snapshot()
      const bundle = await database.exportBundle(snapshot)
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${snapshot.state.runId}-hour-${snapshot.state.tick}.world.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (reason) { setError(messageOf(reason)) }
  }

  async function importRun(file?: File) {
    if (!file) return
    try {
      const value: unknown = JSON.parse(await file.text())
      const saved = await database.importBundle(value)
      client.load(saved.snapshot)
      setSeed(saved.snapshot.state.config.seed)
      setEvents([])
      setStatistics([])
      setSelected(undefined)
      setSelectedPersonId(undefined)
      await refreshSnapshots(saved.runId)
    } catch (reason) { setError(`Import failed: ${messageOf(reason)}`) }
    if (importRef.current) importRef.current.value = ''
  }

  function createRun() {
    client.create(seed)
    setEvents([])
    setStatistics([])
    setSelected(undefined)
    setSelectedPersonId(undefined)
    setError(undefined)
    lastAutosavedTick.current = -1
  }

  function inspectPerson(personId: string) {
    const person = projectionRef.current?.people.find((candidate) => candidate.id === personId)
    if (!person) return
    const cell = projectionRef.current?.world.grid.cells.find((candidate) => candidate.id === person.locationCellId)
    setSelected(cell)
    setSelectedPersonId(personId)
  }

  const tick = projection?.tick ?? 0
  const day = Math.floor(tick / 24)
  const hour = tick % 24
  const recentMetrics = newestMetrics(statistics)
  const selectedPerson = projection?.people.find((person) => person.id === selectedPersonId)

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="mark" aria-hidden="true">⬡</div>
          <div><h1>World Simulation</h1><span>deterministic engine workbench</span></div>
        </div>
        <div className="run-facts">
          <Fact label="SEED" value={projection?.seed ?? '—'} />
          <Fact label="TIME" value={`Day ${day} · ${hour.toString().padStart(2, '0')}:00`} />
          <Fact label="ENGINE" value={`v${projection?.engineVersion ?? '—'}`} />
          <Fact label="STATE" value={projection?.digest?.slice(0, 10) ?? 'computing…'} mono />
        </div>
        <div className={`status-pill ${status}`}><span />{status}</div>
      </header>

      <section className="controlbar" aria-label="Simulation controls">
        <label className="seed-control"><span>World seed</span><input value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
        <button className="secondary" onClick={createRun}>New world</button>
        <div className="divider" />
        <button className="icon-button" onClick={() => client.step()} disabled={status === 'playing'} title="Advance one hour">Step +1h</button>
        {status === 'playing'
          ? <button className="primary" onClick={() => client.pause()}>Pause</button>
          : <button className="primary" onClick={() => client.play(speed)} disabled={!projection}>Play</button>}
        <select aria-label="Simulation speed" value={speed} onChange={(event) => { const value = Number(event.target.value); setSpeed(value); client.setSpeed(value) }}>
          {SPEEDS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
        <button className="secondary" onClick={() => client.reset()}>Reset</button>
        <div className="control-spacer" />
        <button className="secondary" onClick={() => importRef.current?.click()}>Import</button>
        <button className="secondary" onClick={() => void exportRun()}>Export</button>
        <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importRun(event.target.files?.[0])} />
      </section>

      {error && <div className="error-banner"><strong>Workbench error</strong><span>{error}</span><button onClick={() => setError(undefined)}>Dismiss</button></div>}

      <section className="workspace">
        <aside className="left-panel panel">
          <PanelTitle title="Map layers" subtitle={`${projection?.world.grid.cells.length ?? 0} hex cells`} />
          <div className="overlay-list">
            {(['terrain', 'elevation', 'habitability', 'movement'] as MapOverlay[]).map((entry) => (
              <button key={entry} className={overlay === entry ? 'active' : ''} onClick={() => setOverlay(entry)}><span className={`swatch ${entry}`} />{entry}</button>
            ))}
          </div>
          <PanelTitle title="Daily samples" subtitle="Latest aggregates" />
          <div className="metric-list">
            <Metric label="Cells" value={recentMetrics['world.cellCount'] ?? projection?.world.grid.cells.length ?? 0} />
            <Metric label="Habitable" value={recentMetrics['world.habitableCells'] ?? '—'} />
            <Metric label="Population" value={recentMetrics['population.count'] ?? projection?.people.length ?? 0} />
            <Metric label="Average hunger" value={recentMetrics['population.averageHunger'] ?? averageHunger(projection?.people)} />
            <Metric label="Simulated days" value={recentMetrics['engine.simulatedDays'] ?? day} />
            <Metric label="Last batch" value={`${processingMs.toFixed(2)} ms`} />
          </div>
        </aside>

        <section className="map-panel panel">
          <div className="map-toolbar"><span>{projection?.world.name ?? 'Loading world…'}</span><span>Axial hex · {overlay}</span></div>
          {projection ? <HexMap grid={projection.world.grid} overlay={overlay} selectedCellId={selectedPersonId ? undefined : selected?.id} people={projection.people} selectedPersonId={selectedPersonId} onSelect={(cell) => { setSelected(cell); setSelectedPersonId(undefined) }} /> : <div className="loading">Starting simulation worker…</div>}
        </section>

        <aside className="right-panel panel">
          <PanelTitle title={selectedPerson ? 'Person inspector' : 'Cell inspector'} subtitle={selectedPerson ? selectedPerson.id : selected ? `Cell ${selected.id}` : 'Select a cell'} />
          {selectedPerson
            ? <PersonInspector person={selectedPerson} onRelease={() => {
                const currentCell = projection?.world.grid.cells.find((cell) => cell.id === selectedPerson.locationCellId)
                setSelected(currentCell)
                setSelectedPersonId(undefined)
              }} />
            : selected
              ? <CellInspector cell={selected} people={projection?.people.filter((person) => person.locationCellId === selected.id) ?? []} onSelectPerson={setSelectedPersonId} />
              : <div className="empty-state"><span>⌖</span><p>Choose a hex to inspect its authoritative spatial state.</p></div>}
          <PanelTitle title="Snapshots" subtitle={`${snapshots.length} local saves`} />
          <div className="save-form"><input placeholder="Snapshot name" value={saveName} onChange={(event) => setSaveName(event.target.value)} /><button onClick={() => void saveNamed()}>Save</button></div>
          <div className="snapshot-list">
            {snapshots.slice(0, 5).map((saved) => (
              <div key={saved.key} className="snapshot-row">
                <button onClick={() => { client.load(saved.snapshot); setSeed(saved.snapshot.state.config.seed) }}><strong>{saved.name}</strong><span>Hour {saved.snapshot.state.tick}</span></button>
                {saved.kind === 'named' && <button className="delete" title="Delete snapshot" onClick={() => void database.deleteSnapshot(saved.key).then(() => refreshSnapshots())}>×</button>}
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="event-panel panel">
        <PanelTitle title="Simulation events" subtitle="Meaningful state transitions; calculations are intentionally omitted" />
        <div className="event-table" role="log">
          <div className="event-header"><span>Tick</span><span>Type</span><span>Details</span></div>
          {events.length === 0 && <div className="event-empty">No events recorded yet.</div>}
          {events.slice(0, 12).map((event) => <div className="event-row" key={event.id}><span>{event.tick}</span><strong>{event.type.replaceAll('_', ' ')}</strong><span>{typeof event.payload.personId === 'string' ? <button className="event-person" onClick={() => inspectPerson(String(event.payload.personId))}>Inspect {event.payload.personId}</button> : formatPayload(event.payload)}</span></div>)}
        </div>
      </section>
    </main>
  )
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="fact"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value}</strong></div> }
function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="panel-title"><div><h2>{title}</h2><span>{subtitle}</span></div></div> }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div> }

function CellInspector({ cell, people, onSelectPerson }: { cell: GeographicCell; people: PersonState[]; onSelectPerson: (id: string) => void }) {
  return <div className="inspector-grid">
    <Metric label="Coordinates" value={`q ${cell.q} · r ${cell.r}`} />
    <Metric label="Terrain" value={cell.terrain} />
    <Metric label="Elevation" value={cell.elevation} />
    <Metric label="Habitability" value={`${(cell.habitability / 10).toFixed(1)}%`} />
    <Metric label="Move cost" value={cell.movementCost === 0 ? 'Blocked' : (cell.movementCost / 1000).toFixed(2)} />
    <Metric label="Resources" value={cell.resourceCapacity} />
    <div className="occupant-list"><span>People here ({people.length})</span>{people.slice(0, 12).map((person) => <button key={person.id} onClick={() => onSelectPerson(person.id)}>{person.id}<small>hunger {person.hunger}</small></button>)}{people.length === 0 && <em>None</em>}</div>
    <div className="neighbor-list"><span>Six neighbors</span><code>{hexNeighbors(cell).map((coord) => `${coord.q},${coord.r}`).join('  ')}</code></div>
  </div>
}

function PersonInspector({ person, onRelease }: { person: PersonState; onRelease: () => void }) {
  const decision = person.lastDecision
  return <div className="person-inspector">
    <div className="tracking-row"><span><i />Person hooked</span><button className="back-button" onClick={onRelease}>Release to current cell</button></div>
    <div className="inspector-grid">
      <Metric label="Age" value={`${person.ageYears} years`} />
      <Metric label="Location" value={person.locationCellId} />
      <Metric label="Home" value={person.homeCellId} />
      <Metric label="Hunger" value={`${(person.hunger / 10).toFixed(1)}%`} />
      <TraitBar label="Curiosity" value={person.traits.curiosity} />
      <TraitBar label="Risk tolerance" value={person.traits.riskTolerance} />
      <TraitBar label="Sociability" value={person.traits.sociability} />
    </div>
    <div className="decision-panel">
      <h3>Last decision</h3>
      {decision ? <>
        <div className="decision-name"><strong>{decision.action}</strong><span>{(decision.probabilityPermille / 10).toFixed(1)}% selection probability</span></div>
        {decision.targetCellId && <div className="decision-target">Target cell {decision.targetCellId}</div>}
        <div className="contributions">{decision.contributions.map((entry) => <div key={entry.factor}><span>{entry.factor}</span><strong className={entry.value >= 0 ? 'positive' : 'negative'}>{entry.value >= 0 ? '+' : ''}{entry.value}</strong></div>)}</div>
        <div className="alternatives"><span>Candidate weights</span>{decision.alternatives.map((entry) => <div key={entry.action}><span>{entry.action}</span><strong>{entry.weight}</strong></div>)}</div>
      </> : <p>No action has been evaluated yet. Advance one hour.</p>}
    </div>
  </div>
}

function TraitBar({ label, value }: { label: string; value: number }) {
  return <div className="trait"><div><span>{label}</span><strong>{(value / 10).toFixed(1)}</strong></div><div className="trait-track"><i style={{ width: `${value / 10}%` }} /></div></div>
}

function newestMetrics(samples: StatisticSample[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const sample of samples) if (result[sample.metricId] === undefined) result[sample.metricId] = sample.value
  return result
}

function formatPayload(payload: SimulationEvent['payload']): string {
  const entries = Object.entries(payload)
  return entries.length ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : '—'
}

function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }

function averageHunger(people?: PersonState[]): string | number {
  if (!people?.length) return '—'
  return Math.round(people.reduce((sum, person) => sum + person.hunger, 0) / people.length)
}
