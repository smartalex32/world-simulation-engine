import { useEffect, useReducer, useRef, useState } from 'react'
import type { WorkbenchProjection } from '../../projection'
import type { TelemetryIntegrity } from '../../persistence/database'
import type { SessionStatus } from '../controllers/useSimulationSession'
import { Metric } from '../components/WorkbenchPrimitives'
import { Sparkline, buildTimeSeriesViewModel } from '../visualization'
import { initialWorkbenchCommandState, workbenchCommandReducer, type WorkbenchCommandId } from './commandState'

export function SimulationWorkspace({ projection, status, speed, processingMs, telemetry, error, onPlay, onPause, onStep, onSpeed, onReset, onCreateRun, onSave, onLoad, onExport }: {
  projection: WorkbenchProjection
  status: SessionStatus
  speed: number
  processingMs: number
  telemetry?: TelemetryIntegrity
  error?: string
  onPlay: () => Promise<boolean>
  onPause: () => Promise<boolean>
  onStep: (ticks: number) => Promise<boolean>
  onSpeed: (ticks: number) => Promise<boolean>
  onReset: () => Promise<boolean>
  onCreateRun: (seed: string) => Promise<boolean>
  onSave: () => Promise<boolean>
  onLoad: () => Promise<boolean>
  onExport: () => Promise<boolean>
}) {
  const [commands, dispatch] = useReducer(workbenchCommandReducer, initialWorkbenchCommandState)
  const [seed, setSeed] = useState(projection.seed)
  const [confirmSeed, setConfirmSeed] = useState(false)
  const [timings, setTimings] = useState<readonly { tick: number; value: number }[]>([])
  const correlation = useRef(0)
  const priorRun = useRef(projection.runId)
  useEffect(() => { setTimings((values) => [...values, { tick: projection.tick, value: processingMs }].slice(-32)) }, [processingMs, projection.tick])
  useEffect(() => { if (priorRun.current !== projection.runId) { priorRun.current = projection.runId; dispatch({ type: 'replace-run' }); setConfirmSeed(false) } }, [projection.runId])
  const run = async (command: WorkbenchCommandId, operation: () => Promise<boolean>) => {
    const id = correlation.current + 1
    correlation.current = id
    const before = commands[command]
    if (before.status === 'pending' || before.status === 'unavailable') return
    dispatch({ type: 'submit', command, correlation: id })
    const succeeded = await operation()
    dispatch({ type: 'settle', command, correlation: id, succeeded, error: succeeded ? undefined : 'The worker rejected the command.' })
  }
  const phaseCadenceTicks = (cadence: string) => cadence === 'hourly' ? 1 : cadence === 'daily' ? 24 : cadence === 'monthly' ? 720 : 8760
  const day = Math.floor(projection.tick / 24)
  const hour = projection.tick % 24
  const timingSeries = buildTimeSeriesViewModel({ id: 'processing', label: 'Recent simulation batch processing', unit: 'milliseconds', fromTick: timings[0]?.tick ?? projection.tick, toTick: projection.tick, values: timings, provenance: { source: 'worker frame diagnostics', cadenceTicks: speed }, pointLimit: 32 })
  return <section className="simulation-workspace" aria-labelledby="simulation-workspace-title">
    <header><div><span className="eyebrow">SIMULATION CONTROL &amp; SYSTEMS</span><h2 id="simulation-workspace-title">Run {projection.runId}</h2><p>Day {day} · {hour.toString().padStart(2, '0')}:00 · tick {projection.tick}. Typed commands wait for worker acknowledgement; presentation controls cannot mutate authoritative state directly.</p></div><span className={`status-pill ${status}`}><i />{status}</span></header>
    <div className="simulation-workspace-grid">
      <section aria-labelledby="run-controls-title"><h3 id="run-controls-title">Run controls</h3><div className="simulation-control-buttons">{status === 'playing' ? <CommandButton id="pause" state={commands.pause.status} onClick={() => run('pause', onPause)}>Pause</CommandButton> : <CommandButton id="play" state={commands.play.status} onClick={() => run('play', onPlay)}>Play</CommandButton>}<CommandButton id="step" state={commands.step.status} disabled={status === 'playing'} onClick={() => run('step', () => onStep(1))}>Step 1 hour</CommandButton><CommandButton id="step" state={commands.step.status} disabled={status === 'playing'} onClick={() => run('step', () => onStep(24))}>Step 1 day</CommandButton><label>Batch size<select value={speed} disabled={commands.speed.status === 'pending'} onChange={(event) => void run('speed', () => onSpeed(Number(event.target.value)))}><option value="1">1 hour</option><option value="24">1 day</option><option value="168">1 week</option><option value="720">30 days</option></select></label></div><div className="simulation-control-buttons"><CommandButton id="save" state={commands.save.status} onClick={() => run('save', onSave)}>Save snapshot</CommandButton><CommandButton id="load" state={commands.load.status} onClick={() => run('load', onLoad)}>Load snapshot</CommandButton><CommandButton id="export" state={commands.export.status} onClick={() => run('export', onExport)}>Export run</CommandButton><CommandButton id="reset" state={commands.reset.status} disabled={status === 'playing'} onClick={() => run('reset', onReset)}>Reset current run</CommandButton><button type="button" disabled title="No cancellable batch command is exposed by the current worker">Cancel unavailable</button></div><div className="new-run-control"><label>New run seed<input value={seed} onChange={(event) => { setSeed(event.target.value); setConfirmSeed(false) }} /></label><button type="button" onClick={() => setSeed(`run-${projection.tick + 1}`)}>Reroll presentation seed</button>{confirmSeed ? <div role="alert"><p>Create a separate draft for seed <strong>{seed}</strong>? The current run is not reseeded; unsaved work should be saved first.</p><CommandButton id="new-run" state={commands['new-run'].status} onClick={() => run('new-run', () => onCreateRun(seed))}>Confirm new-run draft</CommandButton><button type="button" onClick={() => setConfirmSeed(false)}>Cancel</button></div> : <button type="button" disabled={!seed.trim()} onClick={() => setConfirmSeed(true)}>Create new run with seed</button>}</div></section>
      <section aria-labelledby="systems-title"><h3 id="systems-title">Phase pipeline diagnostics</h3><div className="systems-table" role="table" aria-label="Engine phase diagnostics"><div role="row"><span role="columnheader">Phase</span><span role="columnheader">Cadence</span><span role="columnheader">Invocations through tick</span><span role="columnheader">Measured time</span></div>{projection.phaseManifest.map((phase) => <div role="row" key={phase.id}><strong role="cell">{phase.id}</strong><span role="cell">{phase.cadence}<small>{phase.rngStreams.length ? `RNG: ${phase.rngStreams.join(', ')}` : 'No RNG stream'}</small></span><span role="cell">{Math.floor(projection.tick / phaseCadenceTicks(phase.cadence))}</span><span role="cell">Not separately measured</span></div>)}</div><div className="processing-chart"><Sparkline series={timingSeries} /><small>Worker batch total: {processingMs.toFixed(2)} ms. Projection, persistence, and rendering costs are not conflated with simulation time.</small></div></section>
      <section aria-labelledby="effective-config-title"><h3 id="effective-config-title">Read-only effective configuration</h3><div className="effective-config"><Metric label="Seed" value={projection.seed} /><Metric label="Engine" value={projection.engineVersion} /><Metric label="Snapshot schema" value={`v${projection.effectiveConfiguration.snapshotSchemaVersion}`} /><Metric label="Projection protocol" value={projection.projectionProtocolVersion} /><Metric label="Base tick" value={`${projection.effectiveConfiguration.baseTickHours} hour`} /><Metric label="Content pack" value={`${projection.effectiveConfiguration.contentPackId}@${projection.effectiveConfiguration.contentPackVersion}`} /><Metric label="Pack checksum" value={projection.effectiveConfiguration.contentPackChecksum ?? 'Legacy reference unavailable'} /><Metric label="Pack dependencies" value={projection.effectiveConfiguration.contentPackDependencies.length ? projection.effectiveConfiguration.contentPackDependencies.map((dependency) => `${dependency.id}@${dependency.version}`).join(', ') : 'None'} /><Metric label="World scale" value={`${projection.world.width} × ${projection.world.height} cells · ${projection.world.scale.hexRadiusMeters} m radius`} /><Metric label="Enabled pipeline" value={`${projection.phaseManifest.length} registered phases`} />{Object.entries(projection.effectiveConfiguration.modelVersions).map(([name, version]) => <Metric key={name} label={name} value={`v${version}`} />)}</div><p>Source: immutable run configuration and version manifest. Seed, pack, world creation, and coefficients take effect only through a validated new-run workflow. Presentation settings remain outside canonical state.</p></section>
      <section aria-labelledby="integrity-title"><h3 id="integrity-title">Persistence and reconciliation health</h3><Metric label="Telemetry" value={telemetry?.status ?? 'Unavailable until history is loaded'} /><Metric label="Current checkpoint" value={telemetry ? `Event ${telemetry.committed.eventSequence} · statistic tick ${telemetry.committed.statisticTick}` : 'Unavailable'} /><Metric label="Worker" value={error ? 'Error' : status === 'starting' ? 'Starting' : 'Connected'} /><Metric label="Hosted lease/reconciliation" value="Unavailable in local workbench" />{error && <p role="alert">{error}</p>}<p>Missing hosted data is unavailable, never reported healthy.</p></section>
    </div><div className="sr-only" aria-live="polite">{Object.entries(commands).filter(([, value]) => value.status !== 'idle').map(([id, value]) => `${id} ${value.status}`).join('. ')}</div>
  </section>
}

function CommandButton({ id, state, disabled, onClick, children }: { id: WorkbenchCommandId; state: string; disabled?: boolean; onClick: () => void; children: string }) {
  return <button type="button" data-command={id} data-command-state={state} aria-busy={state === 'pending'} disabled={disabled || state === 'pending' || state === 'unavailable'} onClick={onClick}>{state === 'pending' ? `${children}…` : children}</button>
}
