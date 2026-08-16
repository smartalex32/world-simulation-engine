import { hexDistance } from '../spatial/hex'
import type { CatchmentAssignmentInput, CommunityCatchment } from './types'

export const COMMUNITY_CATCHMENT_IDS = Object.freeze(['community-west-valley', 'community-east-valley'] as const)
export const COMMUNITY_CATCHMENT_DISPLAY_NAMES = Object.freeze({
  'community-west-valley': 'West Valley',
  'community-east-valley': 'East Valley',
} as const)

/**
 * Creates two deterministic geography catchments. Anchors are passable cells nearest the
 * two specified valley centers; every world cell (including water) belongs exactly once.
 */
export function createTwoCatchmentGeography(input: CatchmentAssignmentInput & { readonly height: number }): readonly CommunityCatchment[] {
  if (!Number.isSafeInteger(input.width) || input.width < 2) throw new Error('width must be an integer of at least 2')
  if (!Number.isSafeInteger(input.height) || input.height < 1) throw new Error('height must be a positive integer')
  const passable = input.cells.filter((cell) => cell.movementCost > 0).sort((a, b) => a.id.localeCompare(b.id))
  if (passable.length < 2) throw new Error('Two community catchments require at least two passable cells')
  const centerR = Math.floor(input.height / 2)
  const west = selectAnchor(passable, Math.floor(input.width / 3), centerR)
  const eastCandidates = passable.filter((cell) => cell.id !== west.id)
  const east = selectAnchor(eastCandidates, Math.floor((input.width * 2) / 3), centerR)
  const orderedAnchors = [{ id: COMMUNITY_CATCHMENT_IDS[0], anchor: west }, { id: COMMUNITY_CATCHMENT_IDS[1], anchor: east }]
  const assignments = new Map<string, string[]>()
  for (const entry of orderedAnchors) assignments.set(entry.id, [])
  for (const cell of [...input.cells].sort((a, b) => a.id.localeCompare(b.id))) {
    const winner = [...orderedAnchors].sort((a, b) => hexDistance(cell, a.anchor) - hexDistance(cell, b.anchor) || a.id.localeCompare(b.id))[0]
    if (!winner) throw new Error('Missing catchment anchor')
    assignments.get(winner.id)!.push(cell.id)
  }
  return Object.freeze([
    Object.freeze({ id: COMMUNITY_CATCHMENT_IDS[0], displayName: COMMUNITY_CATCHMENT_DISPLAY_NAMES[COMMUNITY_CATCHMENT_IDS[0]], anchorCellId: west.id, cellIds: Object.freeze([...(assignments.get(COMMUNITY_CATCHMENT_IDS[0]) ?? [])].sort()) }),
    Object.freeze({ id: COMMUNITY_CATCHMENT_IDS[1], displayName: COMMUNITY_CATCHMENT_DISPLAY_NAMES[COMMUNITY_CATCHMENT_IDS[1]], anchorCellId: east.id, cellIds: Object.freeze([...(assignments.get(COMMUNITY_CATCHMENT_IDS[1]) ?? [])].sort()) }),
  ])
}

function selectAnchor(cells: readonly CatchmentAssignmentInput['cells'][number][], targetQ: number, targetR: number) {
  const winner = [...cells].sort((a, b) => hexDistance(a, { q: targetQ, r: targetR }) - hexDistance(b, { q: targetQ, r: targetR }) || b.habitability - a.habitability || a.id.localeCompare(b.id))[0]
  if (!winner) throw new Error('Missing passable catchment anchor')
  return winner
}
