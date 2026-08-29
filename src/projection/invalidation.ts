import type { SimulationEvent } from '../simulation/domain/types'

/**
 * Noncanonical hints for projection caches. They never participate in a
 * snapshot or simulation decision and can always be conservatively rebuilt.
 */
export type ProjectionInvalidationCategory = 'people' | 'locations' | 'relationships' | 'communities' | 'topology'

export interface ProjectionInvalidation {
  readonly categories: readonly ProjectionInvalidationCategory[]
  readonly cellIds: readonly string[]
}

export const NO_PROJECTION_INVALIDATION: ProjectionInvalidation = Object.freeze({ categories: [], cellIds: [] })

export function mergeProjectionInvalidations(...values: readonly ProjectionInvalidation[]): ProjectionInvalidation {
  const categories = new Set<ProjectionInvalidationCategory>()
  const cellIds = new Set<string>()
  for (const value of values) { for (const category of value.categories) categories.add(category); for (const cellId of value.cellIds) cellIds.add(cellId) }
  return { categories: [...categories].sort(), cellIds: [...cellIds].sort() }
}

export function projectionInvalidationFromEvents(events: readonly SimulationEvent[]): ProjectionInvalidation {
  const categories = new Set<ProjectionInvalidationCategory>()
  const cellIds = new Set<string>()
  for (const event of events) {
    if (event.type === 'HOUSEHOLD_RELOCATED') {
      categories.add('people'); categories.add('locations')
      addCellId(cellIds, event.payload.sourceCellId); addCellId(cellIds, event.payload.destinationCellId)
    } else if (event.type === 'COHORT_MATERIALIZED' || event.type === 'PEOPLE_DEMATERIALIZED') {
      categories.add('people'); categories.add('locations'); categories.add('relationships')
    } else if (event.type === 'PERSON_DIED' || event.type === 'PERSON_BORN') {
      categories.add('people'); categories.add('locations'); categories.add('relationships')
    } else if (event.type === 'PERSON_MOVED' || event.type === 'PERSON_STARTED_TRAVEL' || event.type === 'PERSON_MOVED_HOUSEHOLD') {
      categories.add('people'); categories.add('locations')
    } else if (event.type === 'RELATIONSHIP_FORMED' || event.type === 'PARTNERSHIP_FORMED') {
      categories.add('relationships')
    }
  }
  return { categories: [...categories].sort(), cellIds: [...cellIds].sort() }
}

function addCellId(target: Set<string>, value: unknown): void {
  if (typeof value === 'string') target.add(value)
}
