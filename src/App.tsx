import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WorkbenchDatabase, type SavedSnapshot } from './persistence/database'
import type { CommunityVariableDefinition, CommunityVariableId } from './simulation/community/types'
import type { DevelopmentExperienceType, GeographicCell, HouseholdState, ParentChildLink, PersonState, RelationshipPerspective, RelationshipState, SimulationEvent, StatisticSample, UtilityContribution } from './simulation/domain/types'
import { hexNeighbors } from './simulation/spatial/hex'
import type { ProjectedCommunityState, WorkbenchProjection } from './projection'
import { HexMap, type MapOverlay } from './ui/HexMap'
import { ActionExplanation } from './ui/ActionExplanation'
import { PersonVariableSections } from './ui/PersonVariableSections'
import { CommunityInspector, CommunitySignals } from './ui/CommunityPanels'
import { mergeWorkbenchProjection } from './ui/projectionFrame'
import type { ContributionView, VariableDefinitionView } from './ui/personVariables'
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
  const [projection, setProjection] = useState<WorkbenchProjection>()
  const projectionRef = useRef<WorkbenchProjection | undefined>(undefined)
  const [status, setStatus] = useState<'starting' | 'idle' | 'paused' | 'playing'>('starting')
  const [speed, setSpeed] = useState(24)
  const [events, setEvents] = useState<SimulationEvent[]>([])
  const [statistics, setStatistics] = useState<StatisticSample[]>([])
  const [selectedCellId, setSelectedCellId] = useState<string>()
  const [selectedPersonId, setSelectedPersonId] = useState<string>()
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>()
  const [overlay, setOverlay] = useState<MapOverlay>('terrain')
  const [communityMeasureId, setCommunityMeasureId] = useState<CommunityVariableId>('community.emergent.socialTrust')
  const [showActivityLocations, setShowActivityLocations] = useState(false)
  const [showHouseholds, setShowHouseholds] = useState(false)
  const [snapshots, setSnapshots] = useState<SavedSnapshot[]>([])
  const [error, setError] = useState<string>()
  const [processingMs, setProcessingMs] = useState(0)
  const [saveName, setSaveName] = useState('')
  const lastAutosavedTick = useRef(-1)
  const statusRef = useRef<typeof status>('starting')
  const importRef = useRef<HTMLInputElement>(null)
  const requestViewport = useCallback((request: import('./projection').MapProjectionRequest) => client.setViewport(request), [client])

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
        const previousProjection = projectionRef.current
        const nextProjection = { ...mergeWorkbenchProjection(previousProjection, response.projection), digest: response.projection.digest ?? previousProjection?.digest }
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
      setSelectedCellId(undefined)
      setSelectedPersonId(undefined)
      setSelectedCommunityId(undefined)
      await refreshSnapshots(saved.runId)
    } catch (reason) { setError(`Import failed: ${messageOf(reason)}`) }
    if (importRef.current) importRef.current.value = ''
  }

  function createRun() {
    client.create(seed)
    setEvents([])
    setStatistics([])
    setSelectedCellId(undefined)
    setSelectedPersonId(undefined)
    setSelectedCommunityId(undefined)
    setError(undefined)
    lastAutosavedTick.current = -1
  }

  function inspectPerson(personId: string) {
    const person = projectionRef.current?.people.find((candidate) => candidate.id === personId)
    if (!person) return
    setSelectedCellId(person.locationCellId)
    setSelectedPersonId(personId)
    setSelectedCommunityId(undefined)
  }

  function inspectCommunity(communityId: string) {
    if (!projectionRef.current?.communities.some((community) => community.catchment.id === communityId)) return
    setSelectedCommunityId(communityId)
  }

  const tick = projection?.tick ?? 0
  const day = Math.floor(tick / 24)
  const hour = tick % 24
  const recentMetrics = newestMetrics(statistics)
  const selectedPerson = projection?.people.find((person) => person.id === selectedPersonId)
  const selectedCommunity = projection?.communities.find((community) => community.catchment.id === selectedCommunityId)
  const selectedRelationships = selectedPerson ? relationshipViews(selectedPerson.id, projection?.relationships ?? []) : []
  const selected = selectedCellId ? projection?.map.exactCells.find((cell) => cell.id === selectedCellId) ?? (projection?.map.focusCell?.id === selectedCellId ? projection.map.focusCell : undefined) : undefined

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
          <Fact label="SAVED HASH" value={projection?.digest?.slice(0, 10) ?? 'computing…'} mono />
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
          <PanelTitle title="Map layers" subtitle={`${projection?.world.cellCount ?? 0} hex cells`} />
          <div className="overlay-list">
            {(['terrain', 'elevation', 'habitability', 'movement', 'food', 'population', 'community'] as MapOverlay[]).map((entry) => (
              <button key={entry} aria-pressed={overlay === entry} className={overlay === entry ? 'active' : ''} onClick={() => setOverlay(entry)}><span className={`swatch ${entry}`} />{entry}</button>
            ))}
          </div>
          {projection && <div className="map-annotation-toggles" aria-label="Map annotations">
            <button aria-label="Activity locations" aria-pressed={showActivityLocations} className={showActivityLocations ? 'active' : ''} onClick={() => setShowActivityLocations((current) => !current)}>Activity locations</button>
            <button aria-label="Households" aria-pressed={showHouseholds} className={showHouseholds ? 'active' : ''} onClick={() => setShowHouseholds((current) => !current)}>Households</button>
          </div>}
          <PanelTitle title="Daily samples" subtitle="Latest aggregates" />
          <div className="metric-list">
            <Metric label="Cells" value={recentMetrics['world.cellCount'] ?? projection?.world.cellCount ?? 0} />
            <Metric label="Habitable" value={recentMetrics['world.habitableCells'] ?? '—'} />
            <Metric label="Population" value={recentMetrics['population.count'] ?? projection?.people.length ?? 0} />
            <Metric label="Average hunger" value={recentMetrics['population.averageHunger'] ?? averageVariable(projection?.people, 'person.state.hunger')} />
            <Metric label="Occupied cells" value={recentMetrics['spatial.occupiedCells'] ?? '—'} />
            <Metric label="World food" value={recentMetrics['resources.totalFood'] ?? 'Awaiting daily sample'} />
            <Metric label="Food consumed/day" value={recentMetrics['resources.foodConsumed'] ?? '—'} />
            <Metric label="Travel cost/person" value={recentMetrics['spatial.averageTravelCost'] ?? '—'} />
            <Metric label="Simulated days" value={recentMetrics['engine.simulatedDays'] ?? day} />
            <Metric label="Last batch" value={`${processingMs.toFixed(2)} ms`} />
          </div>
          <PanelTitle title="Social signals" subtitle="Daily encounter aggregates" />
          <div className="metric-list">
            <Metric label="Encounters" value={recentMetrics['social.encounters'] ?? 0} />
            <Metric label="Encounters / 1k" value={recentMetrics['social.encountersPer1000People'] ?? 0} />
            <Metric label="Relationships" value={recentMetrics['social.relationshipCount'] ?? projection?.relationships.length ?? 0} />
            <Metric label="Network density" value={`${((recentMetrics['social.networkDensityPermille'] ?? networkDensityPermille(projection)) / 10).toFixed(1)}%`} />
            <Metric label="Avg familiarity" value={`${((recentMetrics['social.averageFamiliarity'] ?? averageFamiliarity(projection)) / 10).toFixed(1)}%`} />
            <Metric label="Tense encounters" value={recentMetrics['social.tenseEncounters'] ?? 0} />
          </div>
          {projection && <CommunitySignals
            communities={projection.communities}
            definitions={projection.communityVariableDefinitions}
            selectedMeasureId={communityMeasureId}
            onSelectMeasure={(id) => { setCommunityMeasureId(id); setOverlay('community') }}
            onInspect={inspectCommunity}
          />}
        </aside>

        <section className="map-panel panel">
          <div className="map-toolbar"><span>{projection?.world.name ?? 'Loading world…'}</span><span>Axial hex · {projection?.map.overlay ?? overlay}{projection && projection.map.overlay !== overlay ? ' · updating…' : ''}</span></div>
          {projection ? <HexMap world={projection.world} map={projection.map} overlay={overlay} selectedCellId={selectedPersonId ? undefined : selectedCellId} communities={projection.communities} communityVariableDefinitions={projection.communityVariableDefinitions} communityMeasureId={communityMeasureId} selectedCommunityId={selectedCommunityId} showActivityLocations={showActivityLocations} showHouseholds={showHouseholds} selectedPersonId={selectedPersonId} onSelect={(cell) => { setSelectedCellId(cell.id); setSelectedPersonId(undefined); setSelectedCommunityId(undefined) }} onFocusCell={(cellId) => { setSelectedCellId(cellId); setSelectedPersonId(undefined); setSelectedCommunityId(undefined) }} onViewportRequest={requestViewport} /> : <div className="loading">Starting simulation worker…</div>}
        </section>

        <aside className="right-panel panel">
          <PanelTitle title={selectedCommunity ? 'Community inspector' : selectedPerson ? 'Person inspector' : 'Cell inspector'} subtitle={selectedCommunity ? selectedCommunity.catchment.displayName : selectedPerson ? selectedPerson.id : selected ? `Cell ${selected.id}` : 'Select a cell'} />
          {selectedCommunity
            ? <CommunityInspector community={selectedCommunity} definitions={projection?.communityVariableDefinitions ?? []} hasHookedPerson={selectedPerson !== undefined} onReturnToPerson={() => setSelectedCommunityId(undefined)} />
            : selectedPerson
            ? <PersonInspector person={selectedPerson} tick={projection?.tick ?? 0} routeHome={projection?.routeHome?.personId === selectedPerson.id ? projection.routeHome : undefined} variableDefinitions={projection?.variableDefinitions ?? []} communityVariableDefinitions={projection?.communityVariableDefinitions ?? []} communities={projection?.communities ?? []} personCommunityId={projection?.personCommunityIds[selectedPerson.id]} relationships={selectedRelationships} households={projection?.households ?? []} parentChildLinks={projection?.parentChildLinks ?? []} people={projection?.people ?? []} onHookPerson={inspectPerson} onRelease={() => {
                setSelectedCellId(selectedPerson.locationCellId)
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
          {events.slice(0, 12).map((event) => <div className="event-row" key={event.id}><span>{event.tick}</span><strong>{event.type.replaceAll('_', ' ')}</strong><span><EventParticipants event={event} onInspect={inspectPerson} onInspectCommunity={inspectCommunity} /></span></div>)}
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
    <Metric label="Food stock" value={`${cell.foodAmount} / ${cell.resourceCapacity}`} />
    <Metric label="Daily regrowth" value={cell.foodRegenerationPerDay} />
    <div className="occupant-list"><span>People here ({people.length})</span>{people.slice(0, 12).map((person) => <button key={person.id} onClick={() => onSelectPerson(person.id)}>{person.id}<small>authoritative person state</small></button>)}{people.length === 0 && <em>None</em>}</div>
    <div className="neighbor-list"><span>Six neighbors</span><code>{hexNeighbors(cell).map((coord) => `${coord.q},${coord.r}`).join('  ')}</code></div>
  </div>
}

function PersonInspector({ person, tick, routeHome, variableDefinitions, communityVariableDefinitions, communities, personCommunityId, relationships, households, parentChildLinks, people, onHookPerson, onRelease }: { person: PersonState; tick: number; routeHome?: WorkbenchProjection['routeHome']; variableDefinitions: readonly VariableDefinitionView[]; communityVariableDefinitions: readonly CommunityVariableDefinition[]; communities: readonly ProjectedCommunityState[]; personCommunityId?: string; relationships: RelationshipView[]; households: readonly HouseholdState[]; parentChildLinks: readonly ParentChildLink[]; people: readonly PersonState[]; onHookPerson: (id: string) => void; onRelease: () => void }) {
  const [showDevelopmentInputs, setShowDevelopmentInputs] = useState(false)
  const decision = person.lastDecision
  const household = households.find((candidate) => candidate.id === person.householdId)
  const householdMembers = householdMemberViews(person, household, parentChildLinks, people)
  const firstOriginTrace = person.originTraces[0]
  const geographicCommunity = communities.find((community) => community.catchment.id === personCommunityId)
  return <div className="person-inspector">
    <div className="tracking-row"><span><i />Person hooked</span><button className="back-button" onClick={onRelease}>Release to current cell</button></div>
    <div className="inspector-grid">
      <Metric label="Age" value={`${person.ageYears} years`} />
      <Metric label="Location" value={person.locationCellId} />
      <Metric label="Home" value={person.homeCellId} />
      {person.journey && <><Metric label="Traveling to" value={person.journey.destinationCellId} /><Metric label="Travel remaining" value={`${person.journey.remainingCost} / ${person.journey.totalCost}`} /></>}
      <Metric label="Route home" value={routeHome?.reachable ? `${routeHome.steps ?? 0} steps · ${routeHome.totalCost ?? 0} cost` : routeHome?.truncated ? 'Search limit reached' : routeHome ? 'No route' : 'Calculating'} />
    </div>
    <section className="activity-panel" aria-labelledby="current-activity-heading">
      <div className="section-heading"><h3 id="current-activity-heading">Current activity</h3><span>{scheduleLabel(person.activityScheduleId)}</span></div>
      <div className="activity-details">
        <Metric label="Kind" value={person.currentActivity.kind} />
        <Metric label="Location" value={person.currentActivity.kind === 'travel' ? 'None while traveling' : person.currentActivity.locationId ?? 'None'} />
        <Metric label="Cell" value={person.locationCellId} />
        <Metric label="Since tick" value={person.currentActivity.sinceTick} />
      </div>
    </section>
    <section className="community-exposure-panel" aria-labelledby="geographic-exposure-heading">
      <div className="section-heading"><h3 id="geographic-exposure-heading">Current geographic exposure</h3><span>Actual current cell</span></div>
      {geographicCommunity ? <div className="activity-details">
        <Metric label="Catchment" value={geographicCommunity.catchment.displayName} />
        <Metric label="Community ID" value={geographicCommunity.catchment.id} />
        <Metric label="Cell" value={person.locationCellId} />
      </div> : <p>No community catchment covers the current cell.</p>}
    </section>
    <PersonVariableSections definitions={variableDefinitions} values={variableValues(person)} layers={['state', 'need']} />
    <section className="household-panel" aria-labelledby="household-heading">
      <div className="section-heading"><h3 id="household-heading">Household</h3><span>{household ? household.memberIds.length : 0} members</span></div>
      {household ? <>
        <div className="activity-details"><Metric label="Household ID" value={household.id} /><Metric label="Home" value={household.homeCellId} /></div>
        <div className="household-members">
          {householdMembers.map((member) => <button key={member.id} onClick={() => onHookPerson(member.id)} aria-label={`Hook ${member.id}`}><span><strong>{member.id}</strong><small>{member.role}</small></span><span>{member.ageYears} years</span></button>)}
        </div>
        {firstOriginTrace && <div className="inheritance-trace"><strong>Starting predisposition</strong><span>Curiosity {firstOriginTrace.finalValue / 10}%</span><small>Fictional, configurable parental-baseline-variation model; this is a starting tendency, not a fixed outcome.</small></div>}
      </> : <p>Household data is unavailable for this person.</p>}
    </section>
    <section className="encounter-panel" aria-labelledby="last-encounter-heading">
      <h3 id="last-encounter-heading">Last encounter</h3>
      {person.lastEncounter ? <>
        <div className="encounter-summary"><strong className={`outcome ${person.lastEncounter.outcome}`}>{person.lastEncounter.outcome}</strong><span>{(person.lastEncounter.probabilityPermille / 10).toFixed(1)}% outcome probability</span></div>
        <button className="encounter-person" onClick={() => onHookPerson(person.lastEncounter!.otherPersonId)} aria-label={`Hook ${person.lastEncounter.otherPersonId}`}>
          With {person.lastEncounter.otherPersonId} · {person.lastEncounter.cellId} · tick {person.lastEncounter.tick}
        </button>
        <small>Familiarity {(person.lastEncounter.familiarityBefore / 10).toFixed(1)}% → {(person.lastEncounter.familiarityAfter / 10).toFixed(1)}%</small>
      </> : <p>No encounter recorded yet.</p>}
    </section>
    <section className="relationship-panel" aria-labelledby="relationships-heading">
      <div className="section-heading"><h3 id="relationships-heading">Relationships</h3><span>{relationships.length} known</span></div>
      {relationships.length === 0 ? <p>No direct relationships recorded yet.</p> : <div className="relationship-list">
        {relationships.map((relationship) => <button key={relationship.id} onClick={() => onHookPerson(relationship.otherPersonId)} aria-label={`Hook ${relationship.otherPersonId}`}>
          <span><strong>{relationship.otherPersonId}</strong><small>Familiarity {(relationship.familiarity / 10).toFixed(1)}% · frequency {(relationship.interactionFrequency / 10).toFixed(1)}%</small></span>
          <span className="relationship-dimensions" aria-label="Directional relationship values"><small>A {normalizedPercent(relationship.perspective.affection)} · T {normalizedPercent(relationship.perspective.trust)}</small><small>R {normalizedPercent(relationship.perspective.respect)} · F {normalizedPercent(relationship.perspective.fear)}</small></span>
        </button>)}
      </div>}
    </section>
    <DevelopmentInspector person={person} tick={tick} variableDefinitions={variableDefinitions} onHookPerson={onHookPerson} showInputs={showDevelopmentInputs} onToggleInputs={() => setShowDevelopmentInputs((current) => !current)} />
    <PersonVariableSections definitions={variableDefinitions} values={variableValues(person)} layers={['trait']} />
    <ActionExplanation action={decision?.action} probabilityPermille={decision?.probabilityPermille} targetCellId={decision?.targetCellId} contributions={decision ? contributionViews(decision.contributions, variableDefinitions) : []} alternatives={decision?.alternatives ?? []} labelForSource={(sourceId, fallback) => sourceLabel(sourceId, fallback, variableDefinitions, communityVariableDefinitions)} />
  </div>
}

const DEVELOPMENT_EXPERIENCE_DISPLAY: Record<DevelopmentExperienceType, { label: string; channel: string }> = {
  'experience.parent.curiosity-modeling': { label: 'Parent curiosity modeling', channel: 'Household co-presence' },
}

function DevelopmentInspector({ person, tick, variableDefinitions, onHookPerson, showInputs, onToggleInputs }: { person: PersonState; tick: number; variableDefinitions: readonly VariableDefinitionView[]; onHookPerson: (id: string) => void; showInputs: boolean; onToggleInputs: () => void }) {
  const experience = person.development.lastExperience
  const exposure = person.development.exposures[0]
  const change = person.development.lastChange
  const targetLabel = change ? variableDefinitions.find((definition) => definition.id === change.targetId)?.label ?? change.targetId : 'Curiosity'
  const elapsedHours = exposure ? Math.max(0, Math.min(720, tick - exposure.windowStartTick + 1)) : 0
  return <div className="development-inspector">
    <section className="development-panel" aria-labelledby="recent-experience-heading">
      <div className="section-heading"><h3 id="recent-experience-heading">Recent experience</h3><span>{experience ? `Ticks ${experience.startTick}–${experience.endTick}` : 'No completed window'}</span></div>
      {experience ? <>
        <div className="development-grid">
          <Metric label="Type" value={DEVELOPMENT_EXPERIENCE_DISPLAY[experience.type].label} />
          <Metric label="Channel" value={DEVELOPMENT_EXPERIENCE_DISPLAY[experience.type].channel} />
          <Metric label="Household" value={experience.householdId} />
          <Metric label="Home activity" value={experience.activityLocationId} />
          <Metric label="Recipient hours" value={`${experience.recipientHours} person-hours`} />
          <Metric label="Source hours" value={`${experience.sourceHours} person-hours`} />
          <Metric label="Source mean" value={formatPermille(experience.sourceMeanPermille)} />
          <Metric label="Exposure strength" value={formatPermille(experience.exposureStrengthPermille)} />
        </div>
        <DevelopmentSources ids={experience.sourcePersonIds} onHookPerson={onHookPerson} />
      </> : <p>No completed developmental experience recorded.</p>}
    </section>
    <section className="development-panel" aria-labelledby="development-exposure-heading">
      <div className="section-heading"><h3 id="development-exposure-heading">Developmental exposure</h3><span>{elapsedHours} / 720 hours</span></div>
      {exposure && (exposure.recipientHours > 0 || exposure.sourceHours > 0) ? <>
        <div className="exposure-progress" aria-label={`Exposure window ${elapsedHours} of 720 hours`}><i style={{ width: `${elapsedHours / 7.2}%` }} /></div>
        <div className="development-grid">
          <Metric label="Window starts" value={`Tick ${exposure.windowStartTick}`} />
          <Metric label="Recipient hours" value={`${exposure.recipientHours} person-hours`} />
          <Metric label="Source hours" value={`${exposure.sourceHours} person-hours`} />
          <Metric label="Last co-presence" value={exposure.lastExposureTick === undefined ? 'None' : `Tick ${exposure.lastExposureTick}`} />
        </div>
        <DevelopmentSources ids={exposure.sourcePersonIds} onHookPerson={onHookPerson} />
      </> : <p>No co-presence recorded in current window.</p>}
    </section>
    <section className="development-panel" aria-labelledby="development-change-heading">
      <div className="section-heading"><h3 id="development-change-heading">Development change</h3><span>{change?.resolution ?? 'No applied change'}</span></div>
      {change ? <>
        <div className="development-change-summary"><strong>{targetLabel}</strong><span>{change.previousValue} → {change.currentValue} ({signed(change.appliedDelta)} permille)</span></div>
        <div className="development-grid">
          <Metric label="Age band" value={change.ageBand} />
          <Metric label="Plasticity" value={`${change.plasticityPermille} permille / month`} />
          <Metric label="Exposure strength" value={formatPermille(change.exposureStrengthPermille)} />
          <Metric label="Application" value={`${change.resolution} · ${formatPermille(change.applicationProbabilityPermille)}`} />
        </div>
        <button className="development-disclosure" aria-expanded={showInputs} aria-controls="development-formula-inputs" onClick={onToggleInputs}>Contributors and formula inputs</button>
        {showInputs && <div id="development-formula-inputs" className="formula-inputs">
          <Metric label="Parent source value" value={`${change.sourceValuePermille} permille`} />
          <Metric label="Source gap" value={`${signed(change.gapPermille)} permille`} />
          <Metric label="Requested delta" value={`${signed(change.requestedDelta)} permille`} />
          <Metric label="Applied delta" value={`${signed(change.appliedDelta)} permille`} />
          <Metric label="Edge" value={change.edgeId} />
          <Metric label="Experience" value={change.experienceId} />
        </div>}
      </> : <p>No developmental variable change recorded.</p>}
    </section>
  </div>
}

function DevelopmentSources({ ids, onHookPerson }: { ids: readonly string[]; onHookPerson: (id: string) => void }) {
  return <div className="development-sources"><span>Source people ({ids.length})</span>{ids.length ? ids.map((id) => <button key={id} onClick={() => onHookPerson(id)} aria-label={`Hook development source ${id}`}>{id}</button>) : <small>None recorded</small>}</div>
}

function formatPermille(value: number): string { return `${(value / 10).toFixed(1)}% · ${value} permille` }
function signed(value: number): string { return value > 0 ? `+${value}` : String(value) }

function EventParticipants({ event, onInspect, onInspectCommunity }: { event: SimulationEvent; onInspect: (id: string) => void; onInspectCommunity: (id: string) => void }) {
  if (event.type === 'COMMUNITY_MEASURES_UPDATED') {
    const communityId = event.payload.communityId
    const communityName = event.payload.communityName
    const values = ['socialTrust', 'cohesion', 'cooperation', 'conflict', 'innovationClimate']
      .flatMap((name) => typeof event.payload[`${name}Permille`] === 'number' ? [`${communityEventLabel(name)} ${(Number(event.payload[`${name}Permille`]) / 10).toFixed(1)}%`] : [])
    const window = typeof event.payload.windowStartTick === 'number' && typeof event.payload.windowEndTick === 'number' ? `ticks ${event.payload.windowStartTick}–${event.payload.windowEndTick}` : undefined
    return <span className="event-participants community-event">
      {typeof communityId === 'string' && <button className="event-person" onClick={() => onInspectCommunity(communityId)} aria-label={`Inspect ${String(communityName ?? communityId)} community`}>Inspect {String(communityName ?? communityId)}</button>}
      <small>{[window, ...values].filter(Boolean).join(' · ')}</small>
    </span>
  }
  const ids = ['personId', 'otherPersonId', 'personAId', 'personBId']
    .map((key) => event.payload[key])
    .filter((value): value is string => typeof value === 'string')
    .filter((value, index, values) => values.indexOf(value) === index)
  if (ids.length === 0) return formatPayload(event.payload)
  const details = ['outcome', 'cellId', 'targetId', 'appliedDelta', 'recipientHours', 'sourceHours', 'probabilityPermille', 'exposureStrengthPermille']
    .flatMap((key) => event.payload[key] === undefined ? [] : [`${key === 'probabilityPermille' ? 'probability' : key}: ${key === 'probabilityPermille' ? `${(Number(event.payload[key]) / 10).toFixed(1)}%` : String(event.payload[key])}`])
  return <span className="event-participants">{ids.map((personId) => <button key={personId} className="event-person" onClick={() => onInspect(personId)} aria-label={`Inspect ${personId}`}>Inspect {personId}</button>)}{details.length > 0 && <small>{details.join(' · ')}</small>}</span>
}

function communityEventLabel(value: string): string {
  if (value === 'socialTrust') return 'trust'
  if (value === 'innovationClimate') return 'innovation'
  return value
}

function newestMetrics(samples: StatisticSample[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const sample of samples) if (result[sample.metricId] === undefined) result[sample.metricId] = sample.value
  return result
}

interface RelationshipView {
  id: string
  otherPersonId: string
  familiarity: number
  interactionFrequency: number
  perspective: RelationshipPerspective
}

function relationshipViews(personId: string, relationships: RelationshipState[]): RelationshipView[] {
  return relationships
    .flatMap((relationship) => {
      if (relationship.personAId === personId) return [{ id: relationship.id, otherPersonId: relationship.personBId, familiarity: relationship.familiarity, interactionFrequency: relationship.interactionFrequency, perspective: relationship.aToB }]
      if (relationship.personBId === personId) return [{ id: relationship.id, otherPersonId: relationship.personAId, familiarity: relationship.familiarity, interactionFrequency: relationship.interactionFrequency, perspective: relationship.bToA }]
      return []
    })
    .sort((first, second) => second.familiarity - first.familiarity || (first.otherPersonId < second.otherPersonId ? -1 : first.otherPersonId > second.otherPersonId ? 1 : 0))
}

function normalizedPercent(value: number): string { return `${(value / 10).toFixed(1)}%` }

function scheduleLabel(scheduleId: PersonState['activityScheduleId']): string {
  if (scheduleId === 'activity.schedule.child.v1') return 'Child daily schedule'
  if (scheduleId === 'activity.schedule.adult.v1') return 'Adult daily schedule'
  return scheduleId
}

interface HouseholdMemberView {
  id: string
  ageYears: number
  role: 'Parent' | 'Child' | 'Member'
}

function householdMemberViews(person: PersonState, household: HouseholdState | undefined, links: readonly ParentChildLink[], people: readonly PersonState[]): HouseholdMemberView[] {
  if (!household) return []
  const peopleById = new Map(people.map((candidate) => [candidate.id, candidate]))
  const parentIds = new Set(links.filter((link) => link.householdId === household.id && link.childId === person.id).map((link) => link.parentId))
  const childIds = new Set(links.filter((link) => link.householdId === household.id && link.parentId === person.id).map((link) => link.childId))
  return household.memberIds
    .map((id): HouseholdMemberView | undefined => {
      const member = peopleById.get(id)
      if (!member) return undefined
      return { id, ageYears: member.ageYears, role: parentIds.has(id) ? 'Parent' : childIds.has(id) ? 'Child' : 'Member' }
    })
    .filter((member): member is HouseholdMemberView => member !== undefined)
    .sort((first, second) => roleRank(first.role) - roleRank(second.role) || first.id.localeCompare(second.id))
}

function roleRank(role: HouseholdMemberView['role']): number {
  return role === 'Parent' ? 0 : role === 'Child' ? 1 : 2
}

function networkDensityPermille(projection?: WorkbenchProjection): number {
  const population = projection?.people.length ?? 0
  const possible = population > 1 ? population * (population - 1) / 2 : 0
  return possible ? Math.round((projection?.relationships.length ?? 0) * 1000 / possible) : 0
}

function averageFamiliarity(projection?: WorkbenchProjection): number {
  const relationships = projection?.relationships ?? []
  return relationships.length ? Math.round(relationships.reduce((sum, relationship) => sum + relationship.familiarity, 0) / relationships.length) : 0
}

function variableValues(person: PersonState): Record<string, number> {
  return Object.fromEntries(Object.entries(person.variables))
}

function contributionViews(contributions: readonly UtilityContribution[], definitions: readonly VariableDefinitionView[]): ContributionView[] {
  const layerById = new Map(definitions.map((definition) => [definition.id, definition.layer]))
  return contributions.map((contribution) => ({
    value: contribution.value,
    sourceId: contribution.sourceId,
    sourceLayer: contribution.sourceId ? layerById.get(contribution.sourceId) : undefined,
    kind: contribution.kind,
    label: contribution.factor,
    edgeId: contribution.edgeId,
    targetId: contribution.targetId,
    sourceValue: contribution.sourceValue,
    centeredSourceValue: contribution.kind === 'communityInfluence' ? contribution.centeredSourceValue : undefined,
    weightPermille: contribution.weightPermille,
    communityId: contribution.kind === 'communityInfluence' ? contribution.communityId : undefined,
  }))
}

function sourceLabel(sourceId: string | undefined, fallback: string | undefined, definitions: readonly VariableDefinitionView[], communityDefinitions: readonly CommunityVariableDefinition[]): string {
  if (sourceId) return definitions.find((definition) => definition.id === sourceId)?.label ?? communityDefinitions.find((definition) => definition.id === sourceId)?.label ?? `Unknown source (${sourceId})`
  return fallback || 'Unattributed source'
}

function formatPayload(payload: SimulationEvent['payload']): string {
  const entries = Object.entries(payload)
  return entries.length ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : '—'
}

function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }

function averageVariable(people: PersonState[] | undefined, variableId: string): string | number {
  if (!people?.length) return '—'
  const values = people.map((person) => person.variables[variableId as keyof PersonState['variables']]).filter((value): value is number => typeof value === 'number')
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : '—'
}
