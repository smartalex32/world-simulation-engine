import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { COMMUNITY_EMERGENT_IDS, COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID, type CommunityVariableId } from '../../simulation/community/types'
import type { ProjectionOverlay, WorkbenchProjection } from '../../projection'
import { WORKBENCH_MODES, type WorkbenchMode } from '../layout/WorkbenchShell'

export const WORKBENCH_ENTITY_KINDS = ['person', 'relationship', 'organization', 'settlement', 'region', 'event', 'map-cell', 'metric'] as const
export type WorkbenchEntityKind = (typeof WORKBENCH_ENTITY_KINDS)[number]
export type WorkbenchEntityRef = { [Kind in WorkbenchEntityKind]: { kind: Kind; id: string } }[WorkbenchEntityKind]
export type WorkbenchDetailSurface = 'inspector' | 'network' | 'timeline' | 'map' | 'analytics' | 'explanation'
export type WorkbenchEntityAvailability = 'available' | 'invalid' | 'stale' | 'offscreen' | 'truncated' | 'deleted' | 'history-gap' | 'not-yet-modeled'
export type WorkbenchMapAnnotation = 'activity-locations' | 'households'

export interface WorkbenchTimeRange { fromTick: number; toTick: number }
export interface WorkbenchFilters {
  mapOverlay: ProjectionOverlay
  communityMeasureId: CommunityVariableId
  mapAnnotations: WorkbenchMapAnnotation[]
}
export interface WorkbenchReturnLocation {
  workspace: WorkbenchMode
  selectedEntity?: WorkbenchEntityRef
  detailSurface?: WorkbenchDetailSurface
}
export interface WorkbenchNavigationState {
  activeWorkspace: WorkbenchMode
  selectedEntity?: WorkbenchEntityRef
  focusedEntity?: WorkbenchEntityRef
  comparisonEntity?: WorkbenchEntityRef
  selectionStatus?: WorkbenchEntityAvailability
  invalidTarget?: string
  timeRange?: WorkbenchTimeRange
  filters: WorkbenchFilters
  openDetailSurface?: WorkbenchDetailSurface
  returnLocation?: WorkbenchReturnLocation
  runId?: string
  announcement: string
  revision: number
}

export interface WorkbenchAvailabilityIndex {
  runId: string
  world: { width: number; height: number }
  people: ReadonlyMap<string, 'alive' | 'dead'>
  peopleTruncated: boolean
  relationships: ReadonlySet<string>
  relationshipsTruncated: boolean
  organizations: ReadonlySet<string>
  settlements: ReadonlySet<string>
  regions: ReadonlySet<string>
  events: ReadonlySet<string>
  historyLoaded: boolean
  exactMapCells: ReadonlySet<string>
  metrics: ReadonlySet<string>
}

export type WorkbenchNavigationAction =
  | { type: 'navigate-workspace'; workspace: WorkbenchMode }
  | { type: 'select-entity'; entity?: WorkbenchEntityRef; focus?: boolean; workspace?: WorkbenchMode; detailSurface?: WorkbenchDetailSurface }
  | { type: 'focus-entity'; entity?: WorkbenchEntityRef }
  | { type: 'compare-entity'; entity?: WorkbenchEntityRef }
  | { type: 'set-time-range'; range?: WorkbenchTimeRange }
  | { type: 'set-filter'; filter: keyof WorkbenchFilters; value: WorkbenchFilters[keyof WorkbenchFilters] }
  | { type: 'open-detail'; surface?: WorkbenchDetailSurface }
  | { type: 'return' }
  | { type: 'restore'; state: WorkbenchNavigationState }
  | { type: 'reconcile'; availability: WorkbenchAvailabilityIndex }
  | { type: 'reset-for-run' }

export const DEFAULT_WORKBENCH_FILTERS: WorkbenchFilters = {
  mapOverlay: 'terrain',
  communityMeasureId: 'community.emergent.socialTrust',
  mapAnnotations: [],
}

export const initialWorkbenchNavigationState: WorkbenchNavigationState = {
  activeWorkspace: 'world',
  filters: DEFAULT_WORKBENCH_FILTERS,
  announcement: 'World workspace',
  revision: 0,
}

export function workbenchNavigationReducer(state: WorkbenchNavigationState, action: WorkbenchNavigationAction): WorkbenchNavigationState {
  if (action.type === 'restore') return action.state
  if (action.type === 'navigate-workspace') {
    if (state.activeWorkspace === action.workspace) return state
    return changed(state, { activeWorkspace: action.workspace, announcement: `${workspaceLabel(action.workspace)} workspace` })
  }
  if (action.type === 'select-entity') {
    const returnLocation = action.workspace && action.workspace !== state.activeWorkspace
      ? { workspace: state.activeWorkspace, selectedEntity: state.selectedEntity, detailSurface: state.openDetailSurface }
      : state.returnLocation
    const nextWorkspace = action.workspace ?? state.activeWorkspace
    return changed(state, {
      activeWorkspace: nextWorkspace,
      selectedEntity: action.entity,
      focusedEntity: action.focus ? action.entity : state.focusedEntity,
      selectionStatus: action.entity ? 'stale' : undefined,
      invalidTarget: undefined,
      openDetailSurface: action.detailSurface ?? (action.entity ? 'inspector' : undefined),
      returnLocation,
      announcement: action.entity ? `${entityLabel(action.entity)} selected in ${workspaceLabel(nextWorkspace)}` : 'Selection cleared',
    })
  }
  if (action.type === 'focus-entity') return changed(state, { focusedEntity: action.entity, announcement: action.entity ? `${entityLabel(action.entity)} focused` : 'Entity focus cleared' })
  if (action.type === 'compare-entity') return changed(state, { comparisonEntity: action.entity, announcement: action.entity ? `${entityLabel(action.entity)} added for comparison` : 'Comparison cleared' })
  if (action.type === 'set-time-range') return changed(state, { timeRange: action.range, announcement: action.range ? `Time range ${action.range.fromTick} to ${action.range.toTick}` : 'Time range cleared' })
  if (action.type === 'set-filter') {
    const filters = { ...state.filters, [action.filter]: action.value } as WorkbenchFilters
    return changed(state, { filters, announcement: 'Workbench filters updated' })
  }
  if (action.type === 'open-detail') return changed(state, { openDetailSurface: action.surface, announcement: action.surface ? `${detailLabel(action.surface)} opened` : 'Detail closed' })
  if (action.type === 'return') {
    if (!state.returnLocation) return state
    const { workspace, selectedEntity, detailSurface } = state.returnLocation
    return changed(state, { activeWorkspace: workspace, selectedEntity, selectionStatus: selectedEntity ? 'stale' : undefined, openDetailSurface: detailSurface, returnLocation: undefined, announcement: `Returned to ${workspaceLabel(workspace)}` })
  }
  if (action.type === 'reset-for-run') {
    return changed(state, {
      selectedEntity: undefined,
      focusedEntity: undefined,
      comparisonEntity: undefined,
      selectionStatus: undefined,
      invalidTarget: undefined,
      timeRange: undefined,
      openDetailSurface: undefined,
      returnLocation: undefined,
      runId: undefined,
      announcement: 'Presentation context cleared for run change',
    })
  }
  return reconcileWorkbenchNavigation(state, action.availability)
}

export function reconcileWorkbenchNavigation(state: WorkbenchNavigationState, availability: WorkbenchAvailabilityIndex): WorkbenchNavigationState {
  if (state.runId !== undefined && state.runId !== availability.runId) {
    return changed(state, {
      selectedEntity: undefined,
      focusedEntity: undefined,
      comparisonEntity: undefined,
      selectionStatus: undefined,
      invalidTarget: undefined,
      timeRange: undefined,
      openDetailSurface: undefined,
      returnLocation: undefined,
      runId: availability.runId,
      announcement: 'Presentation context cleared for the loaded run',
    })
  }
  const selectionStatus = state.selectedEntity ? entityAvailability(state.selectedEntity, availability) : state.selectionStatus
  const focusedStatus = state.focusedEntity ? entityAvailability(state.focusedEntity, availability) : undefined
  const focusedEntity = focusedStatus === 'invalid' || focusedStatus === 'deleted' || focusedStatus === 'not-yet-modeled' ? undefined : state.focusedEntity
  if (state.runId === availability.runId && state.selectionStatus === selectionStatus && state.focusedEntity === focusedEntity) return state
  return changed(state, {
    runId: availability.runId,
    selectionStatus,
    focusedEntity,
    announcement: selectionStatus && selectionStatus !== 'available' && state.selectedEntity
      ? `${entityLabel(state.selectedEntity)} is ${availabilityLabel(selectionStatus)}`
      : state.announcement,
  })
}

export function entityAvailability(entity: WorkbenchEntityRef, index: WorkbenchAvailabilityIndex): WorkbenchEntityAvailability {
  if (!isValidEntityRef(entity)) return 'invalid'
  if (entity.kind === 'person') {
    const status = index.people.get(entity.id)
    if (status === 'dead') return 'deleted'
    if (status === 'alive') return 'available'
    return index.peopleTruncated ? 'truncated' : 'deleted'
  }
  if (entity.kind === 'relationship') return index.relationships.has(entity.id) ? 'available' : index.relationshipsTruncated ? 'truncated' : 'deleted'
  if (entity.kind === 'organization') return index.organizations.has(entity.id) ? 'available' : 'deleted'
  if (entity.kind === 'settlement') return index.settlements.has(entity.id) ? 'available' : 'deleted'
  if (entity.kind === 'region') return index.regions.has(entity.id) ? 'available' : 'not-yet-modeled'
  if (entity.kind === 'event') return index.events.has(entity.id) ? 'available' : index.historyLoaded ? 'deleted' : 'history-gap'
  if (entity.kind === 'metric') return index.metrics.has(entity.id) ? 'available' : 'not-yet-modeled'
  const coordinates = parseMapCellId(entity.id)
  if (!coordinates || coordinates.q >= index.world.width || coordinates.r >= index.world.height) return 'invalid'
  return index.exactMapCells.has(entity.id) ? 'available' : 'offscreen'
}

export function buildWorkbenchAvailability(projection: WorkbenchProjection, options: { eventIds?: readonly string[]; historyLoaded?: boolean; metricIds?: readonly string[] } = {}): WorkbenchAvailabilityIndex {
  const exactMapCells = new Set(projection.map.exactCells.map((cell) => cell.id))
  if (projection.map.focusCell) exactMapCells.add(projection.map.focusCell.id)
  return {
    runId: projection.runId,
    world: { width: projection.world.width, height: projection.world.height },
    people: new Map(projection.people.map((person) => [person.id, person.lifeStatus === 'dead' ? 'dead' : 'alive'] as const)),
    peopleTruncated: projection.detailBudget.peopleTruncated,
    relationships: new Set(projection.relationships.map((relationship) => relationship.id)),
    relationshipsTruncated: projection.detailBudget.relationshipsTruncated,
    organizations: new Set(projection.organizationProfiles.map((organization) => organization.id)),
    settlements: new Set(projection.settlements.map((settlement) => settlement.id)),
    regions: new Set(projection.communities.map((community) => community.catchment.id)),
    events: new Set(options.eventIds ?? []),
    historyLoaded: options.historyLoaded ?? false,
    exactMapCells,
    metrics: new Set(options.metricIds ?? []),
  }
}

export function serializeWorkbenchNavigation(state: WorkbenchNavigationState): string {
  const query = new URLSearchParams()
  if (state.activeWorkspace !== 'world') query.set('workspace', state.activeWorkspace)
  if (state.selectedEntity) query.set('entity', encodeEntityRef(state.selectedEntity))
  if (state.focusedEntity) query.set('focus', encodeEntityRef(state.focusedEntity))
  if (state.comparisonEntity) query.set('compare', encodeEntityRef(state.comparisonEntity))
  if (state.timeRange) { query.set('from', String(state.timeRange.fromTick)); query.set('to', String(state.timeRange.toTick)) }
  if (state.filters.mapOverlay !== DEFAULT_WORKBENCH_FILTERS.mapOverlay) query.set('overlay', state.filters.mapOverlay)
  if (state.filters.communityMeasureId !== DEFAULT_WORKBENCH_FILTERS.communityMeasureId) query.set('measure', state.filters.communityMeasureId)
  if (state.filters.mapAnnotations.length > 0) query.set('annotations', [...state.filters.mapAnnotations].sort().join(','))
  if (state.openDetailSurface && state.openDetailSurface !== 'inspector') query.set('detail', state.openDetailSurface)
  return query.toString()
}

export function parseWorkbenchNavigation(search: string): WorkbenchNavigationState {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  let invalidTarget: string | undefined
  const workspace = query.get('workspace')
  const activeWorkspace = isWorkbenchMode(workspace) ? workspace : 'world'
  if (workspace !== null && !isWorkbenchMode(workspace)) invalidTarget = `workspace:${workspace}`
  const selectedEntity = parseEntityParameter(query.get('entity'), (value) => { invalidTarget ??= value })
  const focusedEntity = parseEntityParameter(query.get('focus'), (value) => { invalidTarget ??= value })
  const comparisonEntity = parseEntityParameter(query.get('compare'), (value) => { invalidTarget ??= value })
  const timeRange = parseTimeRange(query, () => { invalidTarget ??= 'time-range' })
  const mapOverlay = parseOverlay(query.get('overlay'), () => { invalidTarget ??= `overlay:${query.get('overlay')}` })
  const communityMeasureId = parseCommunityMeasureId(query.get('measure'))
  if (query.has('measure') && !communityMeasureId) invalidTarget ??= `measure:${query.get('measure')}`
  const mapAnnotations = parseAnnotations(query.get('annotations'), () => { invalidTarget ??= `annotations:${query.get('annotations')}` })
  const detail = query.get('detail')
  const openDetailSurface = isDetailSurface(detail) ? detail : selectedEntity ? 'inspector' : undefined
  if (detail !== null && !isDetailSurface(detail)) invalidTarget ??= `detail:${detail}`
  return {
    activeWorkspace,
    selectedEntity,
    focusedEntity,
    comparisonEntity,
    selectionStatus: invalidTarget ? 'invalid' : selectedEntity ? 'stale' : undefined,
    invalidTarget,
    timeRange,
    filters: {
      mapOverlay,
      communityMeasureId: communityMeasureId ?? DEFAULT_WORKBENCH_FILTERS.communityMeasureId,
      mapAnnotations,
    },
    openDetailSurface,
    announcement: invalidTarget ? 'Invalid workbench navigation target' : `${workspaceLabel(activeWorkspace)} workspace restored`,
    revision: 0,
  }
}

export function encodeEntityRef(entity: WorkbenchEntityRef): string { return `${entity.kind}:${entity.id}` }

export function decodeEntityRef(value: string): WorkbenchEntityRef | undefined {
  const separator = value.indexOf(':')
  if (separator <= 0) return undefined
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!isEntityKind(kind) || !isStableId(id)) return undefined
  const entity = { kind, id } as WorkbenchEntityRef
  return isValidEntityRef(entity) ? entity : undefined
}

function changed(state: WorkbenchNavigationState, patch: Partial<WorkbenchNavigationState>): WorkbenchNavigationState {
  return { ...state, ...patch, revision: state.revision + 1 }
}

function parseEntityParameter(value: string | null, invalid: (value: string) => void): WorkbenchEntityRef | undefined {
  if (value === null) return undefined
  const parsed = decodeEntityRef(value)
  if (!parsed) invalid(value)
  return parsed
}

function parseTimeRange(query: URLSearchParams, invalid: () => void): WorkbenchTimeRange | undefined {
  if (!query.has('from') && !query.has('to')) return undefined
  const fromTick = Number(query.get('from'))
  const toTick = Number(query.get('to'))
  if (!Number.isSafeInteger(fromTick) || !Number.isSafeInteger(toTick) || fromTick < 0 || toTick < fromTick) { invalid(); return undefined }
  return { fromTick, toTick }
}

function parseOverlay(value: string | null, invalid: () => void): ProjectionOverlay {
  const overlays: readonly ProjectionOverlay[] = ['terrain', 'elevation', 'habitability', 'movement', 'food', 'population', 'community']
  if (value === null) return DEFAULT_WORKBENCH_FILTERS.mapOverlay
  if (overlays.includes(value as ProjectionOverlay)) return value as ProjectionOverlay
  invalid()
  return DEFAULT_WORKBENCH_FILTERS.mapOverlay
}

function parseAnnotations(value: string | null, invalid: () => void): WorkbenchMapAnnotation[] {
  if (!value) return []
  const annotations = [...new Set(value.split(','))]
  if (annotations.some((entry) => entry !== 'activity-locations' && entry !== 'households')) { invalid(); return [] }
  return annotations.sort() as WorkbenchMapAnnotation[]
}

function parseCommunityMeasureId(value: string | null): CommunityVariableId | undefined {
  const measures: readonly string[] = [...COMMUNITY_EMERGENT_IDS, COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID]
  return value !== null && measures.includes(value) ? value as CommunityVariableId : undefined
}
function isStableId(value: string): boolean { return value.length > 0 && value.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._,:@/-]*$/.test(value) }
function parseMapCellId(value: string): { q: number; r: number } | undefined {
  const match = /^(0|[1-9]\d*),(0|[1-9]\d*)$/.exec(value)
  if (!match) return undefined
  const q = Number(match[1]); const r = Number(match[2])
  return Number.isSafeInteger(q) && Number.isSafeInteger(r) ? { q, r } : undefined
}
function isValidEntityRef(entity: WorkbenchEntityRef): boolean { return isStableId(entity.id) && (entity.kind !== 'map-cell' || parseMapCellId(entity.id) !== undefined) }
function isEntityKind(value: string): value is WorkbenchEntityKind { return WORKBENCH_ENTITY_KINDS.includes(value as WorkbenchEntityKind) }
function isWorkbenchMode(value: string | null): value is WorkbenchMode { return value !== null && WORKBENCH_MODES.includes(value as WorkbenchMode) }
function isDetailSurface(value: string | null): value is WorkbenchDetailSurface { return value !== null && ['inspector', 'network', 'timeline', 'map', 'analytics', 'explanation'].includes(value) }
function workspaceLabel(workspace: WorkbenchMode): string { return `${workspace[0]?.toUpperCase() ?? ''}${workspace.slice(1)}` }
function detailLabel(surface: WorkbenchDetailSurface): string { return `${surface[0]?.toUpperCase() ?? ''}${surface.slice(1)} detail` }
export function entityLabel(entity: WorkbenchEntityRef): string { return `${entity.kind.replace('-', ' ')} ${entity.id}` }
export function availabilityLabel(status: WorkbenchEntityAvailability): string { return status.replaceAll('-', ' ') }

export function useWorkbenchNavigation() {
  const [state, dispatch] = useReducer(workbenchNavigationReducer, undefined, () => typeof window === 'undefined' ? initialWorkbenchNavigationState : parseWorkbenchNavigation(window.location.search))
  const historyMode = useRef<'push' | 'replace'>('replace')
  const serialized = useMemo(() => serializeWorkbenchNavigation(state), [state])

  useEffect(() => {
    const current = window.location.search.startsWith('?') ? window.location.search.slice(1) : window.location.search
    if (current === serialized) return
    const url = `${window.location.pathname}${serialized ? `?${serialized}` : ''}${window.location.hash}`
    window.history[historyMode.current === 'push' ? 'pushState' : 'replaceState']({ workbench: true }, '', url)
    historyMode.current = 'push'
  }, [serialized])

  useEffect(() => {
    const restore = () => {
      historyMode.current = 'replace'
      dispatch({ type: 'restore', state: parseWorkbenchNavigation(window.location.search) })
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  const send = useCallback((action: WorkbenchNavigationAction, mode: 'push' | 'replace' = 'push') => {
    historyMode.current = mode
    dispatch(action)
  }, [])

  return {
    state,
    dispatch,
    navigateWorkspace: useCallback((workspace: WorkbenchMode) => send({ type: 'navigate-workspace', workspace }), [send]),
    selectEntity: useCallback((entity?: WorkbenchEntityRef, options: { focus?: boolean; workspace?: WorkbenchMode; detailSurface?: WorkbenchDetailSurface } = {}) => send({ type: 'select-entity', entity, ...options }), [send]),
    focusEntity: useCallback((entity?: WorkbenchEntityRef) => send({ type: 'focus-entity', entity }), [send]),
    compareEntity: useCallback((entity?: WorkbenchEntityRef) => send({ type: 'compare-entity', entity }), [send]),
    setTimeRange: useCallback((range?: WorkbenchTimeRange) => send({ type: 'set-time-range', range }), [send]),
    setFilter: useCallback(<Key extends keyof WorkbenchFilters>(filter: Key, value: WorkbenchFilters[Key]) => send({ type: 'set-filter', filter, value }), [send]),
    openDetail: useCallback((surface?: WorkbenchDetailSurface) => send({ type: 'open-detail', surface }), [send]),
    returnToPrevious: useCallback(() => send({ type: 'return' }), [send]),
    reconcile: useCallback((availability: WorkbenchAvailabilityIndex) => send({ type: 'reconcile', availability }, 'replace'), [send]),
    resetForRun: useCallback(() => send({ type: 'reset-for-run' }, 'replace'), [send]),
  }
}
