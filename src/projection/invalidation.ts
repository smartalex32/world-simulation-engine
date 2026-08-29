import type { AuthoritativeChangeSet } from '../simulation/domain/types'

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

export function projectionInvalidationFromChangeSet(changeSet: AuthoritativeChangeSet): ProjectionInvalidation {
  const categories = new Set<ProjectionInvalidationCategory>()
  for (const category of changeSet.categories) categories.add(category)
  return { categories: [...categories].sort(), cellIds: [...new Set(changeSet.cellIds)].sort() }
}
