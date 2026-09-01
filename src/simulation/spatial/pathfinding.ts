import type { HexGrid } from '../domain/types'
import { hexDistance, hexNeighbors } from './hex'

export interface PathResult {
  cellIds: string[]
  totalCost: number
}

export interface PathSearchResult {
  path?: PathResult
  truncated: boolean
  expansions: number
}

export interface PathSearchOptions {
  cellById?: ReadonlyMap<string, HexGrid['cells'][number]>
  maxExpansions?: number
}

export function findPath(grid: HexGrid, startCellId: string, goalCellId: string): PathResult | undefined {
  return findPathDetailed(grid, startCellId, goalCellId).path
}

export function findPathDetailed(grid: HexGrid, startCellId: string, goalCellId: string, options: PathSearchOptions = {}): PathSearchResult {
  const cells = options.cellById ?? new Map(grid.cells.map((cell) => [cell.id, cell]))
  const maxExpansions = options.maxExpansions ?? Number.POSITIVE_INFINITY
  if (!(maxExpansions === Number.POSITIVE_INFINITY || (Number.isSafeInteger(maxExpansions) && maxExpansions >= 1))) throw new RangeError('Path expansion limit must be a positive safe integer')
  const start = cells.get(startCellId)
  const goal = cells.get(goalCellId)
  if (!start || !goal || !start.movementCost || !goal.movementCost) return { truncated: false, expansions: 0 }
  if (start.id === goal.id) return { path: { cellIds: [start.id], totalCost: 0 }, truncated: false, expansions: 0 }

  const open = new Set([start.id])
  const cameFrom = new Map<string, string>()
  const costs = new Map<string, number>([[start.id, 0]])
  const estimates = new Map<string, number>([[start.id, hexDistance(start, goal) * 1000]])

  let expansions = 0
  while (open.size > 0) {
    if (expansions >= maxExpansions) return { truncated: true, expansions }
    const currentId = [...open].sort((a, b) => {
      const difference = (estimates.get(a) ?? Number.POSITIVE_INFINITY) - (estimates.get(b) ?? Number.POSITIVE_INFINITY)
      return difference || (a < b ? -1 : a > b ? 1 : 0)
    })[0]
    if (!currentId) break
    if (currentId === goal.id) return { path: reconstructPath(cameFrom, costs, currentId), truncated: false, expansions }
    open.delete(currentId)
    expansions += 1
    const current = cells.get(currentId)
    if (!current) continue
    const neighbors = hexNeighbors(current)
      .map(({ q, r }) => cells.get(`${q},${r}`))
      .filter((cell): cell is NonNullable<typeof cell> => Boolean(cell?.movementCost))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    for (const neighbor of neighbors) {
      const tentativeCost = (costs.get(currentId) ?? Number.POSITIVE_INFINITY) + neighbor.movementCost
      if (tentativeCost >= (costs.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) continue
      cameFrom.set(neighbor.id, currentId)
      costs.set(neighbor.id, tentativeCost)
      estimates.set(neighbor.id, tentativeCost + hexDistance(neighbor, goal) * 1000)
      open.add(neighbor.id)
    }
  }
  return { truncated: false, expansions }
}

function reconstructPath(cameFrom: Map<string, string>, costs: Map<string, number>, goalId: string): PathResult {
  const cellIds = [goalId]
  let current = goalId
  while (cameFrom.has(current)) {
    current = cameFrom.get(current) as string
    cellIds.push(current)
  }
  cellIds.reverse()
  return { cellIds, totalCost: costs.get(goalId) ?? 0 }
}
