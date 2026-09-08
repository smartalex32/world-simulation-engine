import { useMemo, useState } from 'react'
import { buildChronicle } from '../history/chronicle'
import { HISTORY_METRICS } from '../history/history'
import type { HistoricalCheckpoint } from '../history/checkpoints'
import type { TelemetryIntegrity } from '../persistence/database'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'
import type { WorkbenchTimeRange } from './controllers/useWorkbenchNavigation'
import { buildEvidenceTimeline, eventEntityRefs } from './history/timelineViewModel'
import { Sparkline } from './visualization'

interface HistoryPanelProps {
  events: readonly SimulationEvent[]
  statistics: readonly StatisticSample[]
  checkpoints: readonly HistoricalCheckpoint[]
  telemetry?: TelemetryIntegrity
  selectedEntityId?: string
  selectedEventId?: string
  currentTick: number
  timeRange?: WorkbenchTimeRange
  onTimeRange: (range: WorkbenchTimeRange) => void
  onInspectPerson: (personId: string) => void
  onInspectEntity: (kind: 'organization' | 'settlement' | 'region' | 'map-cell', id: string) => void
  onInspectEvent: (event: SimulationEvent) => void
  onRefresh: () => void
  loading: boolean
}

const RANGE_PRESETS = [{ label: 'Day', ticks: 24 }, { label: 'Week', ticks: 168 }, { label: 'Month', ticks: 720 }] as const

export function HistoryPanel({ events, statistics, checkpoints, telemetry, selectedEntityId, selectedEventId, currentTick, timeRange, onTimeRange, onInspectPerson, onInspectEntity, onInspectEvent, onRefresh, loading }: HistoryPanelProps) {
  const [showChronicle, setShowChronicle] = useState(false)
  const range = timeRange ?? { fromTick: Math.max(0, currentTick - 168), toTick: currentTick }
  const view = useMemo(() => buildEvidenceTimeline({ events, statistics, metricIds: HISTORY_METRICS, fromTick: range.fromTick, toTick: range.toTick, selectedEntityId }), [events, range.fromTick, range.toTick, selectedEntityId, statistics])
  const flatEvents = view.lanes.flatMap(([, laneEvents]) => laneEvents).slice().sort((a, b) => a.event.tick - b.event.tick || a.event.sequence - b.event.sequence)
  const selectedIndex = Math.max(0, flatEvents.findIndex((entry) => entry.event.id === selectedEventId))
  const selected = flatEvents.find((entry) => entry.event.id === selectedEventId)
  const chronicle = buildChronicle(events.filter((event) => event.tick >= range.fromTick && event.tick <= range.toTick), 24)
  const shiftRange = (delta: number) => onTimeRange({ fromTick: Math.max(0, range.fromTick + delta), toTick: Math.max(0, range.toTick + delta) })
  return <section className="history-panel evidence-timeline" aria-label="Historical inspection">
    <header className="history-heading">
      <div><span className="eyebrow">HISTORICAL INSPECTION</span><h2>Multi-lane recorded evidence</h2><p>Scrubbing filters retained evidence; it never rewinds or mutates the simulation.</p></div>
      <div className="history-actions"><button type="button" onClick={() => setShowChronicle((value) => !value)} aria-pressed={showChronicle}>{showChronicle ? 'Evidence lanes' : 'Chronicle view'}</button><button type="button" onClick={onRefresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh history'}</button></div>
    </header>
    <div className="timeline-controls" role="toolbar" aria-label="Timeline range controls">
      {RANGE_PRESETS.map((preset) => <button type="button" key={preset.label} onClick={() => onTimeRange({ fromTick: Math.max(0, currentTick - preset.ticks), toTick: currentTick })}>{preset.label}</button>)}
      <label>From tick<input type="number" min="0" max={range.toTick} value={range.fromTick} onChange={(event) => onTimeRange({ fromTick: Math.max(0, Number(event.target.value)), toTick: range.toTick })} /></label>
      <label>To tick<input type="number" min={range.fromTick} value={range.toTick} onChange={(event) => onTimeRange({ fromTick: range.fromTick, toTick: Math.max(range.fromTick, Number(event.target.value)) })} /></label>
      <button type="button" onClick={() => shiftRange(-Math.max(1, range.toTick - range.fromTick))} aria-label="Pan timeline earlier">← Earlier</button>
      <button type="button" onClick={() => shiftRange(Math.max(1, range.toTick - range.fromTick))} aria-label="Pan timeline later">Later →</button>
      <button type="button" disabled={flatEvents.length === 0 || selectedIndex === 0} onClick={() => onInspectEvent(flatEvents[Math.max(0, selectedIndex - 1)]!.event)}>Previous event</button>
      <button type="button" disabled={flatEvents.length === 0 || selectedIndex >= flatEvents.length - 1} onClick={() => onInspectEvent(flatEvents[Math.min(flatEvents.length - 1, selectedIndex + 1)]!.event)}>Next event</button>
      <button type="button" onClick={() => onTimeRange({ fromTick: Math.max(0, currentTick - 168), toTick: currentTick })}>Return to current</button>
    </div>
    {telemetry?.status === 'gapped' && <p className="error-banner" role="alert">Telemetry gap detected through sequence {telemetry.committed.eventSequence}: {telemetry.unexplainedSequenceGaps.map((gap) => gap.first === gap.last ? gap.first : `${gap.first}–${gap.last}`).join(', ')}</p>}
    {telemetry?.status === 'uncheckpointed' && <p className="timeline-integrity-note">Legacy uncheckpointed evidence: this run has no verified telemetry watermark.</p>}
    {view.truncated && <p className="timeline-integrity-note">The bounded result is truncated to the newest 200 events in this range.</p>}
    {showChronicle ? <section className="chronicle-lane"><h3>Deterministic chronicle</h3><p>Fixed text templates from retained evidence; no narrative is generated.</p>{chronicle.length === 0 ? <p>No significant retained evidence in this range.</p> : <ol>{chronicle.map((entry) => <li key={entry.id}><time>Tick {entry.tick}</time><strong>{entry.text}</strong><small>{entry.category} · Evidence {entry.evidenceEventId}</small></li>)}</ol>}</section> : <>
      <div className="timeline-lanes" aria-label="Evidence lanes">{view.lanes.map(([laneId, laneEvents]) => <section className="timeline-lane" key={laneId} aria-labelledby={`lane-${laneId}`}><h3 id={`lane-${laneId}`}>{laneId === 'world' ? 'World events' : laneId === 'community' ? 'Community, settlement, and organization' : `Selected entity · ${selectedEntityId ?? 'none'}`}</h3><div className="timeline-track">{laneEvents.map((entry) => <button type="button" key={entry.event.id} className={`timeline-marker ${entry.retention}`} style={{ left: `${timelinePercent(entry.event.tick, range)}%`, top: `${entry.stack * 17}px` }} aria-pressed={selectedEventId === entry.event.id} onClick={() => onInspectEvent(entry.event)} title={`${entry.event.type} at tick ${entry.event.tick}`}><span>{entry.event.type.replaceAll('_', ' ')}</span></button>)}{laneEvents.length === 0 && <span className="timeline-empty">No retained events</span>}</div></section>)}</div>
      <div className="timeline-metrics" aria-label="Metric lanes">{view.series.map((series) => <section key={series.id}><h3>{series.label}</h3><Sparkline series={series} /></section>)}</div>
    </>}
    <aside className="timeline-detail" aria-label="Selected event evidence">{selected ? <><span className="eyebrow">CAUSAL EVENT DETAIL</span><h3>{selected.event.type.replaceAll('_', ' ')}</h3><p>Tick {selected.event.tick} · sequence {selected.event.sequence} · {selected.retention} retention · evidence {selected.event.id}</p><table><caption>Exact recorded payload</caption><tbody>{Object.entries(selected.event.payload).map(([key, value]) => <tr key={key}><th>{key}</th><td>{String(value)}</td></tr>)}</tbody></table><div className="event-evidence-links">{eventEntityRefs(selected.event).map((entity) => <button type="button" key={`${entity.kind}:${entity.id}`} onClick={() => entity.kind === 'person' ? onInspectPerson(entity.id) : onInspectEntity(entity.kind === 'community' ? 'region' : entity.kind === 'cell' ? 'map-cell' : entity.kind, entity.id)}>Open {entity.kind} {entity.id}</button>)}</div></> : <p>Select an event marker to inspect its exact retained payload and linked entities.</p>}</aside>
    <p className="timeline-future-boundary"><strong>Replay, branch comparison, and time-lapse unavailable.</strong> These require authoritative historical-analysis contracts from #103.</p>
    <small className="timeline-checkpoints">{checkpoints.length} bounded retained checkpoints contribute comparison evidence.</small>
  </section>
}

function timelinePercent(tick: number, range: WorkbenchTimeRange): number {
  if (range.fromTick === range.toTick) return 50
  return Math.max(0, Math.min(100, (tick - range.fromTick) / (range.toTick - range.fromTick) * 100))
}
