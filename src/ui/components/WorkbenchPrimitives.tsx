import type { ReactNode } from 'react'

export function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="fact"><span>{label}</span><strong className={mono ? 'mono' : ''}>{value}</strong></div>
}

export function PanelTitle({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="panel-title"><div><h2>{title}</h2><span>{subtitle}</span></div>{actions}</div>
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`ui-card ${className}`.trim()}>{children}</section>
}

export function Toolbar({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ui-toolbar" role="toolbar" aria-label={label}>{children}</div>
}

export function Tabs<T extends string>({ label, tabs, active, onChange }: { label: string; tabs: readonly T[]; active: T; onChange: (tab: T) => void }) {
  return <div className="ui-tabs" role="tablist" aria-label={label}>{tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => onChange(tab)}>{tab}</button>)}</div>
}

export type PresentationState = 'loading' | 'empty' | 'unavailable' | 'partial' | 'error' | 'stale'

/** A single vocabulary for non-authoritative data availability states. */
export function StatePresentation({ state, title, children }: { state: PresentationState; title?: string; children: ReactNode }) {
  const defaultTitle: Record<PresentationState, string> = {
    loading: 'Loading', empty: 'Nothing to show', unavailable: 'Unavailable', partial: 'Partial data', error: 'Unable to load', stale: 'Projection updating',
  }
  return <section className={`state-presentation ${state}`} aria-live={state === 'loading' || state === 'stale' ? 'polite' : undefined}>
    <strong>{title ?? defaultTitle[state]}</strong><p>{children}</p>
  </section>
}
