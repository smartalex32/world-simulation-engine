import type { ReactNode } from 'react'
import { Fact } from '../components/WorkbenchPrimitives'

export const WORKBENCH_MODES = ['world', 'simulation', 'analytics', 'entities', 'history', 'tools', 'settings'] as const
export type WorkbenchMode = (typeof WORKBENCH_MODES)[number]

type TopbarProps = {
  activeMode: WorkbenchMode
  onModeChange: (mode: WorkbenchMode) => void
  seed: string
  tick: number
  engineVersion?: string
  digest?: string
  status: string
  onBuild: () => void
  onPopulate: () => void
}

export function WorkbenchTopbar({ activeMode, onModeChange, seed, tick, engineVersion, digest, status, onBuild, onPopulate }: TopbarProps) {
  const day = Math.floor(tick / 24)
  const hour = tick % 24
  return <header className="topbar">
    <a className="skip-link" href="#workbench-primary">Skip to workspace</a>
    <div className="brand-block"><div className="mark" aria-hidden="true">⬡</div><div><h1>World Simulation</h1><span>Build a place. Seed a population. Discover its history.</span></div></div>
    <nav className="worldbuilder-stages" aria-label="Worldbuilding workflow">
      <button aria-label="Build" onClick={(event) => { event.currentTarget.focus(); onBuild() }}><span>01</span> Build</button>
      <button aria-label="Populate" onClick={(event) => { event.currentTarget.focus(); onPopulate() }}><span>02</span> Populate</button>
      <button className="active" aria-current="step" onClick={() => onModeChange('world')}><span>03</span> Simulate & explore</button>
    </nav>
    <nav className="mode-navigation" aria-label="Workbench modes">
      {WORKBENCH_MODES.map((mode) => <button key={mode} aria-current={activeMode === mode ? 'page' : undefined} className={activeMode === mode ? 'active' : ''} onClick={() => onModeChange(mode)}>{mode}</button>)}
    </nav>
    <div className="run-facts">
      <Fact label="SEED" value={seed || '—'} />
      <div className="fact" data-simulation-tick={tick}><span>TIME</span><strong>{`Day ${day} · ${hour.toString().padStart(2, '0')}:00`}</strong></div>
      <Fact label="ENGINE" value={`v${engineVersion ?? '—'}`} />
      <Fact label="SAVED HASH" value={digest?.slice(0, 10) ?? 'computing…'} mono />
    </div>
    <div className={`status-pill ${status}`} aria-live="polite" aria-label={`Simulation ${status}`}><span />{status}</div>
  </header>
}

export function RunStatusStrip({ children }: { children: ReactNode }) {
  return <section className="controlbar" aria-label="Simulation controls">{children}</section>
}

export function WorkbenchWorkspace({ left, primary, right }: { left: ReactNode; primary: ReactNode; right: ReactNode }) {
  return <section className="workspace">
    <aside className="left-panel panel" aria-label="Workspace controls">{left}</aside>
    <section id="workbench-primary" className="primary-panel panel" tabIndex={-1} aria-label="Primary workspace">{primary}</section>
    <aside className="right-panel panel" aria-label="Workspace inspector">{right}</aside>
  </section>
}

/** Shared landmark container. App supplies projection-backed workspace slots. */
export function WorkbenchShell({ children, mode }: { children: ReactNode; mode?: WorkbenchMode }) {
  return <main className="app-shell" data-workspace={mode}>{children}</main>
}
