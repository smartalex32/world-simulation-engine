import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ParentChildLink, PersonState, RelationshipState } from '../../simulation/domain/types'
import { PersonWorkspace } from './PersonWorkspace'
import { buildPersonWorkspaceViewModel, deterministicInitials } from './personViewModel'

const person = {
  id: 'person-0042', ageYears: 31, ageHoursIntoYear: 0, lifeStatus: 'alive', locationCellId: '2,3', homeCellId: '1,1', householdId: 'household-1', occupation: 'forager', activityScheduleId: 'activity.schedule.adult.v1', currentActivity: { kind: 'commons', locationId: 'activity.commons.2,3', sinceTick: 6 }, originTraces: [], development: { exposures: [] }, variables: {}, knownCellIds: [],
} as PersonState

const relationship = (id: string, other: string, familiarity: number): RelationshipState => ({ id, personAId: person.id, personBId: other, familiarity, interactionFrequency: 100, interactionCount: 2, lastInteractionTick: 10, aToB: { affection: 0, trust: 0, respect: 0, fear: 0 }, bToA: { affection: 0, trust: 0, respect: 0, fear: 0 } })

describe('person workspace view model', () => {
  it('keeps schedule, family, and ranked relationship semantics separate and bounded', () => {
    const links = [{ id: 'parent-link', householdId: 'household-1', parentId: 'parent-1', childId: person.id }, { id: 'child-link', householdId: 'household-1', parentId: person.id, childId: 'child-1' }] as ParentChildLink[]
    const view = buildPersonWorkspaceViewModel(person, 7, [relationship('weak', 'person-b', 10), relationship('strong', 'person-a', 900)], links, { relationships: 1, knownCells: 1 })
    expect(view.schedule.find((period) => period.current)?.label).toBe('commons')
    expect(view.schedule.find((period) => period.upcoming)?.label).toBe('home')
    expect(view.relationships.map((entry) => entry.id)).toEqual(['strong'])
    expect(view.relationshipTruncated).toBe(true)
    expect(view.parentIds).toEqual(['parent-1'])
    expect(view.childIds).toEqual(['child-1'])
  })

  it('derives neutral initials only from the stable identifier', () => {
    expect(deterministicInitials('person-0042')).toBe('P0')
    expect(deterministicInitials('')).toBe('P')
  })

  it('renders a dense, linked, landmark-based inspector shell', () => {
    const markup = renderToStaticMarkup(<PersonWorkspace person={person} tick={7} relationships={[]} parentChildLinks={[]} details={<p>Evidence</p>} onShowMap={() => undefined} onShowRelationships={() => undefined} onShowTimeline={() => undefined} />)
    expect(markup).toContain('PERSON WORKSPACE')
    expect(markup).toContain('Relationship network')
    expect(markup).toContain('aria-label="Person inspector sections"')
    expect(markup).toContain('Current</span>')
    expect(markup).toContain('Evidence')
  })
})
