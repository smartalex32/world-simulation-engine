import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PersonState, RelationshipState } from '../../simulation/domain/types'
import { RelationshipWorkspace } from './RelationshipWorkspace'
import { buildRelationshipNetworkViewModel, DEFAULT_RELATIONSHIP_FILTERS } from './relationshipViewModel'

const person = (id: string): PersonState => ({ id, ageYears: 30, ageHoursIntoYear: 0, lifeStatus: 'alive', locationCellId: `${id.length},0`, homeCellId: '0,0', householdId: `household-${id}`, activityScheduleId: 'activity.schedule.adult.v1', currentActivity: { kind: 'home', locationId: `activity.home.${id}`, sinceTick: 0 }, originTraces: [], development: { exposures: [] }, variables: {}, knownCellIds: [] } as PersonState)
const relationship: RelationshipState = { id: 'relationship-ab', personAId: 'person-a', personBId: 'person-b', familiarity: 700, interactionFrequency: 350, interactionCount: 4, lastInteractionTick: 20, aToB: { affection: 400, trust: 250, respect: 100, fear: 0 }, bToA: { affection: -300, trust: -200, respect: 50, fear: 500 } }

describe('relationship network view model', () => {
  it('keeps directional evidence exact and reports unavailable endpoints', () => {
    const view = buildRelationshipNetworkViewModel({ focusPersonId: 'person-a', people: [person('person-a')], relationships: [relationship], parentChildLinks: [], organizations: [], personCommunityIds: {}, filters: DEFAULT_RELATIONSHIP_FILTERS, relationshipsTruncated: false })
    expect(view.edgeEvidence.get(relationship.id)?.sourceToTarget).toEqual(relationship.aToB)
    expect(view.edgeEvidence.get(relationship.id)?.targetToSource).toEqual(relationship.bToA)
    expect(view.graph.missingEndpointCount).toBe(0)
    expect(view.graph.nodes.find((node) => node.id === 'person-b')?.description).toContain('unavailable')
    expect(view.graph.edges[0]?.style).toBe('negative')
  })

  it('filters one bounded ego network without inferring clusters', () => {
    const view = buildRelationshipNetworkViewModel({ focusPersonId: 'person-a', people: [person('person-a'), person('person-b')], relationships: [relationship], parentChildLinks: [], organizations: [], personCommunityIds: {}, filters: { ...DEFAULT_RELATIONSHIP_FILTERS, minimumFamiliarity: 800 }, relationshipsTruncated: true })
    expect(view.graph.nodes.map((node) => node.id)).toEqual(['person-a'])
    expect(view.graph.edges).toEqual([])
    expect(view.graph.edgesTruncated).toBe(true)
    expect(view.factionStatus).toBe('not-yet-modeled')
  })

  it('renders keyboard graph controls, filters, details, and explicit faction dependency', () => {
    const markup = renderToStaticMarkup(<RelationshipWorkspace focusPersonId="person-a" people={[person('person-a'), person('person-b')]} relationships={[relationship]} parentChildLinks={[]} organizations={[]} personCommunityIds={{}} relationshipsTruncated={false} onSelectPerson={() => undefined} onShowTimeline={() => undefined} onShowMap={() => undefined} />)
    expect(markup).toContain('BOUNDED EGO NETWORK')
    expect(markup).toContain('aria-label="Relationship filters"')
    expect(markup).toContain('aria-label="Bounded relationship graph"')
    expect(markup).toContain('Requires explicit faction evidence from #143')
  })
})
