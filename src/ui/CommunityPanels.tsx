import { useState } from 'react'
import type { CommunityVariableDefinition, CommunityVariableId } from '../simulation/community/types'
import type { ProjectedCommunityState } from '../projection'

interface CommunitySignalsProps {
  communities: readonly ProjectedCommunityState[]
  definitions: readonly CommunityVariableDefinition[]
  selectedMeasureId: CommunityVariableId
  onSelectMeasure: (id: CommunityVariableId) => void
  onInspect: (id: string) => void
}

export function CommunitySignals({ communities, definitions, selectedMeasureId, onSelectMeasure, onInspect }: CommunitySignalsProps) {
  const emergent = orderedDefinitions(definitions, 'emergent')
  const structural = orderedDefinitions(definitions, 'structural')
  return <section className="community-signals" aria-labelledby="community-signals-heading">
    <div className="panel-title community-title"><div><h2 id="community-signals-heading">Community signals</h2><span>Observed geographic catchments</span></div></div>
    <label className="community-measure-select"><span>Map measure</span><select aria-label="Community map measure" value={selectedMeasureId} onChange={(event) => onSelectMeasure(event.target.value as CommunityVariableId)}>
      {[...emergent, ...structural].map((definition) => <option key={definition.id} value={definition.id}>{definition.label}</option>)}
    </select></label>
    <div className="community-signal-list">
      {communities.map((community) => <article className="community-signal-card" key={community.catchment.id} data-community-id={community.catchment.id}>
        <div className="community-card-heading"><div><strong>{community.catchment.displayName}</strong><small>{community.catchment.cellCount} cells</small></div><button onClick={() => onInspect(community.catchment.id)} aria-label={`Inspect ${community.catchment.displayName} community`}>Inspect</button></div>
        <div className="community-compact-values">
          {emergent.map((definition) => <button key={definition.id} className={selectedMeasureId === definition.id ? 'active' : ''} onClick={() => onSelectMeasure(definition.id)} aria-label={`Show ${definition.label} for ${community.catchment.displayName} on map`}><span>{definition.label}</span><strong>{formatPermille(community.emergent[definition.id as keyof typeof community.emergent])}</strong></button>)}
        </div>
        <div className="community-structural-summary"><span>{structural[0]?.label ?? 'Structural condition'}</span><strong>{structural[0] ? formatPermille(community.structural[structural[0].id as keyof typeof community.structural]) : '—'}</strong></div>
      </article>)}
    </div>
  </section>
}

interface CommunityInspectorProps {
  community: ProjectedCommunityState
  definitions: readonly CommunityVariableDefinition[]
  hasHookedPerson: boolean
  onReturnToPerson: () => void
}

export function CommunityInspector({ community, definitions, hasHookedPerson, onReturnToPerson }: CommunityInspectorProps) {
  const emergent = orderedDefinitions(definitions, 'emergent')
  const structural = orderedDefinitions(definitions, 'structural')
  const window = latestWindow(community)
  return <div className="community-inspector" data-community-id={community.catchment.id}>
    {hasHookedPerson && <div className="tracking-row community-return"><span><i />Person remains hooked</span><button className="back-button" onClick={onReturnToPerson}>Return to hooked person</button></div>}
    <div className="inspector-grid">
      <Metric label="Community ID" value={community.catchment.id} mono />
      <Metric label="Geographic scope" value={`${community.catchment.cellCount} catchment cells`} />
      <Metric label="Anchor cell" value={community.catchment.anchorCellId} mono />
      <Metric label="Latest update" value={`Tick ${community.lastUpdatedTick}`} />
      <Metric label="Evidence window" value={window ? `Ticks ${window.start}–${window.end}` : 'No completed window'} />
    </div>
    <p className="community-boundary-note">These measures are derived from observed local behavior, relationships, encounters, and resources. They are not assigned to people through community membership.</p>
    <section className="community-measure-section" aria-labelledby="emergent-community-heading">
      <div className="section-heading"><h3 id="emergent-community-heading">Emergent measures</h3><span>{emergent.length} observed signals</span></div>
      {emergent.map((definition) => <CommunityMeasureCard key={definition.id} community={community} definition={definition} value={community.emergent[definition.id as keyof typeof community.emergent]} />)}
    </section>
    <section className="community-measure-section structural" aria-labelledby="structural-community-heading">
      <div className="section-heading"><h3 id="structural-community-heading">Structural conditions</h3><span>Kept separate</span></div>
      {structural.map((definition) => <CommunityMeasureCard key={definition.id} community={community} definition={definition} value={community.structural[definition.id as keyof typeof community.structural]} />)}
    </section>
  </div>
}

function CommunityMeasureCard({ community, definition, value }: { community: ProjectedCommunityState; definition: CommunityVariableDefinition; value: number }) {
  const [expanded, setExpanded] = useState(false)
  const trace = community.latestTraces.find((candidate) => candidate.variableId === definition.id)
  const controlId = `community-trace-${safeId(community.catchment.id)}-${safeId(definition.id)}`
  return <article className="community-measure-card" data-variable-id={definition.id}>
    <div className="community-measure-value"><div><strong>{definition.label}</strong><small>{definition.description}</small></div><span>{formatPermille(value)}</span></div>
    <button className="community-trace-disclosure" aria-expanded={expanded} aria-controls={controlId} onClick={() => setExpanded((current) => !current)}>Why this measure?</button>
    {expanded && <div id={controlId} className="community-trace-details">
      {trace ? <>
        <div className="community-trace-summary" aria-label={`${definition.label} changed from ${trace.previousValuePermille} through observed ${trace.observedValuePermille} to ${trace.nextValuePermille} permille`}>
          <span>{trace.previousValuePermille}‰ previous</span><b>→</b><span>{trace.observedValuePermille}‰ observed</span><b>→</b><span>{trace.nextValuePermille}‰ current</span>
        </div>
        <div className="community-trace-facts">
          <Metric label="Evidence window" value={`Ticks ${trace.windowStartTick}–${trace.windowEndTick}`} />
          <Metric label="Retention weights" value={`${trace.previousWeightPermille}‰ previous · ${trace.observedWeightPermille}‰ observed`} />
          <Metric label="Frozen" value={trace.frozen ? 'Yes — insufficient evidence' : 'No'} />
        </div>
        <div className="community-contributors" aria-label={`${definition.label} contributors`}>
          {trace.contributors.length ? trace.contributors.map((contributor) => <div key={`${contributor.sourceId}:${contributor.factor}`} data-source-id={contributor.sourceId} data-weight-permille={contributor.weightPermille}>
            <span><strong>{contributor.label}</strong><small>{contributor.sourceId} · value {contributor.sourceValuePermille}‰ · weight {contributor.weightPermille}‰</small></span>
            <b className={contributor.effectFromNeutralPermille >= 0 ? 'positive' : 'negative'}>{signed(contributor.effectFromNeutralPermille)}‰</b>
          </div>) : <p>No contributor evidence was retained for this window.</p>}
        </div>
      </> : <p>No completed authoritative trace is available yet.</p>}
    </div>}
  </article>
}

function orderedDefinitions(definitions: readonly CommunityVariableDefinition[], layer: CommunityVariableDefinition['layer']): CommunityVariableDefinition[] {
  return definitions.filter((definition) => definition.layer === layer).sort((first, second) => first.order - second.order || first.id.localeCompare(second.id))
}

function latestWindow(community: ProjectedCommunityState): { start: number; end: number } | undefined {
  const trace = community.latestTraces[0]
  return trace ? { start: trace.windowStartTick, end: trace.windowEndTick } : undefined
}

function Metric({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return <div className="metric"><span>{label}</span><strong className={mono ? 'mono' : undefined}>{value}</strong></div>
}

function formatPermille(value: number | undefined): string { return typeof value === 'number' ? `${(value / 10).toFixed(1)}%` : '—' }
function signed(value: number): string { return value > 0 ? `+${value}` : String(value) }
function safeId(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, '-') }
