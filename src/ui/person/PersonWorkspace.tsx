import type { ReactNode } from 'react'
import type { ParentChildLink, PersonState, RelationshipState } from '../../simulation/domain/types'
import { buildPersonWorkspaceViewModel } from './personViewModel'

const PERSON_SECTIONS = [
  ['person-overview', 'Overview'],
  ['current-activity-heading', 'Schedule'],
  ['person-variables', 'Variables'],
  ['relationships-heading', 'Relationships'],
  ['recent-experience-heading', 'Experience'],
  ['knowledge-heading', 'Knowledge'],
  ['household-heading', 'Household'],
] as const

export function PersonWorkspace({ person, tick, relationships, parentChildLinks, details, onShowMap, onShowRelationships, onShowTimeline }: {
  person: PersonState
  tick: number
  relationships: readonly RelationshipState[]
  parentChildLinks: readonly ParentChildLink[]
  details: ReactNode
  onShowMap: () => void
  onShowRelationships: () => void
  onShowTimeline: () => void
}) {
  const view = buildPersonWorkspaceViewModel(person, tick, relationships, parentChildLinks)
  return <section className="person-workspace" aria-labelledby="person-workspace-title">
    <header id="person-overview" className="person-workspace-header">
      <div className="person-silhouette" aria-hidden="true">{view.initials}</div>
      <div><span className="eyebrow">PERSON WORKSPACE</span><h2 id="person-workspace-title">{person.id}</h2><p>{person.lifeStage ?? (person.ageYears < 18 ? 'child' : 'adult')} · {view.lifeStatus} · {person.occupation ?? 'unassigned'}</p></div>
      <div className="person-workspace-actions"><button type="button" onClick={onShowMap}>Show on map</button><button type="button" onClick={onShowRelationships}>Relationship network</button><button type="button" onClick={onShowTimeline}>Recorded history</button></div>
    </header>
    <nav className="person-section-nav" aria-label="Person inspector sections">{PERSON_SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
    <section className="person-schedule" aria-labelledby="person-schedule-heading"><div><span className="eyebrow">BOUNDED DAILY SCHEDULE</span><h3 id="person-schedule-heading">Current and upcoming activity</h3></div><ol>{view.schedule.map((period) => <li key={period.id} className={period.current ? 'current' : period.upcoming ? 'upcoming' : ''}><time>{String(period.startHour).padStart(2, '0')}:00–{String(period.endHourExclusive).padStart(2, '0')}:00</time><strong>{period.label}</strong>{period.current && <span>Current</span>}{period.upcoming && <span>Upcoming</span>}</li>)}</ol></section>
    <div className="person-workspace-detail" id="person-variables">{details}</div>
  </section>
}
