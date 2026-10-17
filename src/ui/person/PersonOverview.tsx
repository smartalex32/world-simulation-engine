import type { ReactNode } from 'react'
import type { ParentChildLink, PersonState, RelationshipState, SimulationEvent } from '../../simulation/domain/types'
import { personTimeline } from '../../history/history'
import { buildPersonWorkspaceViewModel } from './personViewModel'
import { variableGroups, type VariableDefinitionView } from '../personVariables'

/** Compact map-side portrait of the same recorded person shown in the full workspace. */
export function PersonOverview({ person, tick, relationships, parentChildLinks, events, definitions, details, onPerson, onRelationships, onHistory, onDetails }: {
  person: PersonState
  tick: number
  relationships: readonly RelationshipState[]
  parentChildLinks: readonly ParentChildLink[]
  events: readonly SimulationEvent[]
  definitions: readonly VariableDefinitionView[]
  details: ReactNode
  onPerson: (id: string) => void
  onRelationships: () => void
  onHistory: () => void
  onDetails: () => void
}) {
  const view = buildPersonWorkspaceViewModel(person, tick, relationships, parentChildLinks)
  const states = variableGroups(definitions, person.variables, 'state').flatMap((group) => group.rows)
  const traits = variableGroups(definitions, person.variables, 'trait').flatMap((group) => group.rows)
  const recent = personTimeline(events, person.id, 3)
  const family = [...new Set([...(person.partnerId ? [person.partnerId] : []), ...view.parentIds, ...view.childIds])]
  return <section className="person-overview" aria-label="Person overview">
    <header className="person-overview-identity">
      <div className="person-avatar" aria-hidden="true"><svg viewBox="0 0 80 90"><circle cx="40" cy="30" r="14" /><path d="M13 85v-14c0-21 54-21 54 0v14Z" /></svg></div>
      <div><span className="eyebrow">A LIFE IN YOUR WORLD</span><h2>{person.id}</h2><p>{person.ageYears} years · {person.occupation ?? 'Unassigned'}</p><small>{view.lifeStatus} · {person.lifeStage ?? (person.ageYears < 18 ? 'child' : 'adult')}</small></div>
    </header>
    <nav className="person-overview-nav" aria-label="Explore this person"><button className="active" onClick={onDetails}>Overview</button><button onClick={onRelationships}>Relationships</button><button onClick={onHistory}>Life history</button></nav>
    <section className="person-now"><span className="eyebrow">RIGHT NOW</span><strong>{person.currentActivity.kind.replaceAll('_', ' ')}</strong><p>Cell {person.locationCellId} · since hour {person.currentActivity.sinceTick}</p></section>
    <div className="person-state-bars">{states.map(({ definition, value, normalized }) => <label key={definition.id}><span>{definition.label}<b>{value} / {definition.maximum}</b></span><meter min="0" max="1" value={normalized} aria-label={definition.label} /></label>)}</div>
    <section className="person-traits"><h3>Dispositions</h3><div>{traits.map(({ definition, value }) => <span key={definition.id}>{definition.label} <b>{(value / 10).toFixed(0)}%</b></span>)}</div></section>
    <section className="person-family"><h3>Family <small>{family.length} linked</small></h3>{family.length ? family.slice(0, 6).map((id) => <button key={id} onClick={() => onPerson(id)}><span>{id}</span><small>{id === person.partnerId ? 'Partner' : view.parentIds.includes(id) ? 'Parent' : 'Child'} →</small></button>) : <p>No recorded family links in this view.</p>}</section>
    <section className="person-recent"><h3>Recent life events</h3>{recent.length ? recent.map((event) => <button key={event.id} onClick={onHistory}><span>{event.type.replaceAll('_', ' ').toLowerCase()}</span><small>Day {Math.floor(event.tick / 24)}</small></button>) : <p>No personal events in the current event window.</p>}<button className="text-action" onClick={onHistory}>View recorded history →</button></section>
    <details className="recorded-person-details"><summary>Recorded details & explanations</summary>{details}</details>
  </section>
}
