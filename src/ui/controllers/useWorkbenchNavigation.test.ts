import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKBENCH_FILTERS,
  decodeEntityRef,
  encodeEntityRef,
  entityAvailability,
  initialWorkbenchNavigationState,
  parseWorkbenchNavigation,
  reconcileWorkbenchNavigation,
  serializeWorkbenchNavigation,
  workbenchNavigationReducer,
  type WorkbenchAvailabilityIndex,
  type WorkbenchEntityRef,
  type WorkbenchNavigationState,
} from './useWorkbenchNavigation'

const person: WorkbenchEntityRef = { kind: 'person', id: 'person-0001' }

function availability(overrides: Partial<WorkbenchAvailabilityIndex> = {}): WorkbenchAvailabilityIndex {
  return {
    runId: 'run-1', world: { width: 10, height: 8 }, people: new Map([['person-0001', 'alive']]), peopleTruncated: false,
    relationships: new Set(['relationship:1']), relationshipsTruncated: false, organizations: new Set(['school']), settlements: new Set(['west']), regions: new Set(['community:west']),
    events: new Set(['event:1']), historyLoaded: true, exactMapCells: new Set(['1,2']), metrics: new Set(['population.count']), ...overrides,
  }
}

describe('workbench navigation reducer', () => {
  it.each(['world', 'simulation', 'analytics', 'entities', 'history', 'tools', 'settings'] as const)('preserves a valid selection in the %s workspace', (workspace) => {
    const selected = workbenchNavigationReducer(initialWorkbenchNavigationState, { type: 'select-entity', entity: person, focus: true })
    expect(workbenchNavigationReducer(selected, { type: 'navigate-workspace', workspace })).toMatchObject({ activeWorkspace: workspace, selectedEntity: person, focusedEntity: person })
  })

  it('keeps selection and filters when workspaces change', () => {
    const selected = workbenchNavigationReducer(initialWorkbenchNavigationState, { type: 'select-entity', entity: person, focus: true })
    const filtered = workbenchNavigationReducer(selected, { type: 'set-filter', filter: 'mapOverlay', value: 'food' })
    const history = workbenchNavigationReducer(filtered, { type: 'navigate-workspace', workspace: 'history' })
    expect(history).toMatchObject({ activeWorkspace: 'history', selectedEntity: person, focusedEntity: person, filters: { mapOverlay: 'food' } })
    expect(workbenchNavigationReducer(history, { type: 'navigate-workspace', workspace: 'history' })).toBe(history)
  })

  it('owns comparison, time, detail, return, and focus transitions explicitly', () => {
    const comparison: WorkbenchEntityRef = { kind: 'settlement', id: 'west' }
    let state = workbenchNavigationReducer(initialWorkbenchNavigationState, { type: 'compare-entity', entity: comparison })
    state = workbenchNavigationReducer(state, { type: 'set-time-range', range: { fromTick: 12, toTick: 24 } })
    state = workbenchNavigationReducer(state, { type: 'select-entity', entity: person, workspace: 'history', detailSurface: 'timeline' })
    expect(state).toMatchObject({ comparisonEntity: comparison, timeRange: { fromTick: 12, toTick: 24 }, openDetailSurface: 'timeline', returnLocation: { workspace: 'world' } })
    state = workbenchNavigationReducer(state, { type: 'return' })
    expect(state).toMatchObject({ activeWorkspace: 'world', comparisonEntity: comparison, timeRange: { fromTick: 12, toTick: 24 } })
    expect(state.returnLocation).toBeUndefined()
  })

  it('clears run-specific context but preserves workspace filters', () => {
    const state: WorkbenchNavigationState = { ...initialWorkbenchNavigationState, activeWorkspace: 'analytics', selectedEntity: person, focusedEntity: person, comparisonEntity: person, selectionStatus: 'available', timeRange: { fromTick: 1, toTick: 2 }, openDetailSurface: 'timeline', runId: 'old', filters: { ...DEFAULT_WORKBENCH_FILTERS, mapOverlay: 'food' } }
    const next = workbenchNavigationReducer(state, { type: 'reset-for-run' })
    expect(next).toMatchObject({ activeWorkspace: 'analytics', filters: { mapOverlay: 'food' } })
    expect(next.selectedEntity).toBeUndefined()
    expect(next.focusedEntity).toBeUndefined()
    expect(next.timeRange).toBeUndefined()
    expect(next.runId).toBeUndefined()
  })
})

describe('workbench navigation serialization', () => {
  it('round trips every durable presentation field in stable order', () => {
    const state: WorkbenchNavigationState = {
      ...initialWorkbenchNavigationState,
      activeWorkspace: 'history', selectedEntity: person, focusedEntity: person, comparisonEntity: { kind: 'settlement', id: 'west' },
      timeRange: { fromTick: 2, toTick: 24 }, filters: { mapOverlay: 'community', communityMeasureId: 'community.emergent.socialTrust', mapAnnotations: ['households', 'activity-locations'] }, openDetailSurface: 'timeline',
    }
    const encoded = serializeWorkbenchNavigation(state)
    expect(encoded).toBe('workspace=history&entity=person%3Aperson-0001&focus=person%3Aperson-0001&compare=settlement%3Awest&from=2&to=24&overlay=community&annotations=activity-locations%2Chouseholds&detail=timeline')
    expect(parseWorkbenchNavigation(encoded)).toMatchObject({
      activeWorkspace: 'history', selectedEntity: person, focusedEntity: person, comparisonEntity: { kind: 'settlement', id: 'west' },
      selectionStatus: 'stale', timeRange: { fromTick: 2, toTick: 24 }, openDetailSurface: 'timeline',
      filters: { mapOverlay: 'community', communityMeasureId: 'community.emergent.socialTrust', mapAnnotations: ['activity-locations', 'households'] },
    })
  })

  it.each(['?workspace=unknown', '?entity=person:', '?entity=map-cell:1,-2', '?from=4&to=2', '?overlay=secret', '?measure=unknown.metric', '?annotations=households,secret', '?detail=popup'])('rejects malformed deep-link state without throwing: %s', (search) => {
    const state = parseWorkbenchNavigation(search)
    expect(state.selectionStatus).toBe('invalid')
    expect(state.invalidTarget).toBeDefined()
    expect(state.activeWorkspace).toBe('world')
  })

  it('uses a discriminated, validated entity codec', () => {
    expect(decodeEntityRef(encodeEntityRef({ kind: 'relationship', id: 'relationship:1' }))).toEqual({ kind: 'relationship', id: 'relationship:1' })
    expect(decodeEntityRef('unknown:one')).toBeUndefined()
    expect(decodeEntityRef('person:<script>')).toBeUndefined()
  })
})

describe('workbench projection reconciliation', () => {
  it('reports every bounded-data availability state distinctly', () => {
    expect(entityAvailability(person, availability())).toBe('available')
    expect(entityAvailability(person, availability({ people: new Map([['person-0001', 'dead']]) }))).toBe('deleted')
    expect(entityAvailability({ kind: 'person', id: 'person-9999' }, availability({ peopleTruncated: true }))).toBe('truncated')
    expect(entityAvailability({ kind: 'map-cell', id: '2,3' }, availability())).toBe('offscreen')
    expect(entityAvailability({ kind: 'map-cell', id: '20,3' }, availability())).toBe('invalid')
    expect(entityAvailability({ kind: 'region', id: 'future-region' }, availability())).toBe('not-yet-modeled')
    expect(entityAvailability({ kind: 'event', id: 'missing' }, availability({ historyLoaded: false }))).toBe('history-gap')
  })

  it('preserves focus across bounded gaps and clears only unavailable identity', () => {
    const state: WorkbenchNavigationState = { ...initialWorkbenchNavigationState, selectedEntity: person, focusedEntity: person, selectionStatus: 'stale' }
    const current = reconcileWorkbenchNavigation(state, availability())
    expect(current).toMatchObject({ selectedEntity: person, focusedEntity: person, selectionStatus: 'available', runId: 'run-1' })
    const truncated = reconcileWorkbenchNavigation(current, availability({ people: new Map(), peopleTruncated: true }))
    expect(truncated).toMatchObject({ selectedEntity: person, focusedEntity: person, selectionStatus: 'truncated' })
    const deleted = reconcileWorkbenchNavigation(current, availability({ people: new Map(), peopleTruncated: false }))
    expect(deleted.focusedEntity).toBeUndefined()
  })

  it('prevents presentation context leaking between runs', () => {
    const state: WorkbenchNavigationState = { ...initialWorkbenchNavigationState, activeWorkspace: 'entities', selectedEntity: person, focusedEntity: person, selectionStatus: 'available', runId: 'run-1' }
    const changedRun = reconcileWorkbenchNavigation(state, availability({ runId: 'run-2' }))
    expect(changedRun.activeWorkspace).toBe('entities')
    expect(changedRun.runId).toBe('run-2')
    expect(changedRun.selectedEntity).toBeUndefined()
    expect(changedRun.focusedEntity).toBeUndefined()
  })
})
