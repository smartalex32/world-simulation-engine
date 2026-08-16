import { describe, expect, it } from 'vitest'
import { isWorldSetupGeometryValid } from './WorldSetup'

describe('isWorldSetupGeometryValid', () => {
  it('blocks overlapping preset circles but preserves resolved-zone geometry as worker-owned', () => {
    expect(isWorldSetupGeometryValid({ width: 32, placements: [
      { id: 'west', name: 'West', region: 'west', preset: 'west', radiusCells: 4, allocation: 1 },
      { id: 'center', name: 'Center', region: 'center', preset: 'center', radiusCells: 4, allocation: 1 },
    ] })).toBe(false)

    expect(isWorldSetupGeometryValid({ width: 32, placements: [
      { id: 'resolved', name: 'Imported', region: 'center', preset: 'center', radiusCells: 3, allocation: 1, cellIds: ['1,1'] },
      { id: 'west', name: 'West', region: 'west', preset: 'west', radiusCells: 3, allocation: 1 },
    ] })).toBe(true)
  })
})
