import { useMemo, useState } from 'react'
import type { OrganizationState, ParentChildLink, PersonState, RelationshipState } from '../../simulation/domain/types'
import { Metric } from '../components/WorkbenchPrimitives'
import { BoundedGraph, VisualizationLegend, formatPermille } from '../visualization'
import { buildRelationshipNetworkViewModel, DEFAULT_RELATIONSHIP_FILTERS, type RelationshipDimension } from './relationshipViewModel'

const DIMENSIONS: readonly (RelationshipDimension | 'all')[] = ['all', 'affection', 'trust', 'respect', 'fear']

export function RelationshipWorkspace({ focusPersonId, people, relationships, parentChildLinks, organizations, personCommunityIds, relationshipsTruncated, onSelectPerson, onShowTimeline, onShowMap }: {
  focusPersonId: string
  people: readonly PersonState[]
  relationships: readonly RelationshipState[]
  parentChildLinks: readonly ParentChildLink[]
  organizations: readonly OrganizationState[]
  personCommunityIds: Readonly<Record<string, string>>
  relationshipsTruncated: boolean
  onSelectPerson: (personId: string) => void
  onShowTimeline: (personId: string) => void
  onShowMap: (personId: string) => void
}) {
  const [filters, setFilters] = useState(DEFAULT_RELATIONSHIP_FILTERS)
  const [selectedNodeId, setSelectedNodeId] = useState(focusPersonId)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>()
  const view = useMemo(() => buildRelationshipNetworkViewModel({ focusPersonId, people, relationships, parentChildLinks, organizations, personCommunityIds, filters, relationshipsTruncated}), [filters, focusPersonId, organizations, parentChildLinks, people, personCommunityIds, relationships, relationshipsTruncated])
  const edge = selectedEdgeId ? view.edgeEvidence.get(selectedEdgeId) : undefined
  const selectedPerson = people.find((person) => person.id === selectedNodeId)
  return <section className="relationship-workspace" aria-labelledby="relationship-workspace-title">
    <header><div><span className="eyebrow">BOUNDED EGO NETWORK</span><h2 id="relationship-workspace-title">Relationships around {focusPersonId}</h2><p>{view.graph.nodes.length} projected people · {view.graph.edges.length} direct relationships · presentation layout only</p></div><VisualizationLegend label="Relationship styles" items={[{ id: 'positive', label: 'Positive evidence', color: '#6aa982' }, { id: 'negative', label: 'Fear or negative evidence', color: '#d07771', pattern: 'dashed' }, { id: 'family', label: 'Parent/child link', color: '#ad76e8' }]} /></header>
    <div className="relationship-layout">
      <aside aria-label="Relationship filters"><label>Minimum familiarity <output>{formatPermille(filters.minimumFamiliarity)}</output><input type="range" min="0" max="1000" step="100" value={filters.minimumFamiliarity} onChange={(event) => setFilters((current) => ({ ...current, minimumFamiliarity: Number(event.target.value) }))} /></label><label>Directional dimension<select value={filters.dimension} onChange={(event) => setFilters((current) => ({ ...current, dimension: event.target.value as typeof current.dimension }))}>{DIMENSIONS.map((dimension) => <option key={dimension}>{dimension}</option>)}</select></label><label><input type="checkbox" checked={filters.familyOnly} onChange={(event) => setFilters((current) => ({ ...current, familyOnly: event.target.checked }))} /> Family links only</label><label><input type="checkbox" checked={filters.showOrganizations} onChange={(event) => setFilters((current) => ({ ...current, showOrganizations: event.target.checked }))} /> Organization context</label><label><input type="checkbox" checked={filters.showCommunities} onChange={(event) => setFilters((current) => ({ ...current, showCommunities: event.target.checked }))} /> Community exposure context</label><div className="unavailable-context"><strong>Faction clusters unavailable</strong><span>Requires explicit faction evidence from #143; no clusters are inferred.</span></div></aside>
      <BoundedGraph graph={view.graph} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} onSelectNode={(id) => { setSelectedNodeId(id); setSelectedEdgeId(undefined) }} onSelectEdge={(id) => { setSelectedEdgeId(id); setSelectedNodeId('') }} />
      <aside className="relationship-detail" aria-label="Selected relationship evidence">{edge ? <><h3>{edge.sourceLabel} ↔ {edge.targetLabel}</h3><p>Exact directional evidence; values are not averaged.</p><h4>{edge.sourceLabel} to {edge.targetLabel}</h4><Metric label="Affection" value={edge.sourceToTarget.affection} /><Metric label="Trust" value={edge.sourceToTarget.trust} /><Metric label="Respect" value={edge.sourceToTarget.respect} /><Metric label="Fear" value={edge.sourceToTarget.fear} /><h4>{edge.targetLabel} to {edge.sourceLabel}</h4><Metric label="Affection" value={edge.targetToSource.affection} /><Metric label="Trust" value={edge.targetToSource.trust} /><Metric label="Respect" value={edge.targetToSource.respect} /><Metric label="Fear" value={edge.targetToSource.fear} /><Metric label="Last interaction" value={`Tick ${edge.relationship.lastInteractionTick}`} /></> : selectedPerson ? <><h3>{selectedPerson.id}</h3><Metric label="Location" value={selectedPerson.locationCellId} /><Metric label="Status" value={selectedPerson.lifeStatus ?? 'alive'} /><button type="button" onClick={() => onSelectPerson(selectedPerson.id)}>Open person inspector</button><button type="button" onClick={() => onShowTimeline(selectedPerson.id)}>Recorded history</button><button type="button" onClick={() => onShowMap(selectedPerson.id)}>Show on map</button></> : <p>Select a node or use the details table to inspect exact evidence.</p>}
      {view.organizationContexts.map((context) => <p key={context.id}>Organization: {context.name} · {context.memberIds.length} visible members</p>)}{view.communityContexts.map((context) => <p key={context.id}>Community exposure: {context.id} · {context.memberIds.length} visible people</p>)}</aside>
    </div>
  </section>
}
