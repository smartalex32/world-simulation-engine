import type { HexGrid } from '../domain/types'
import { hexDistance, hexNeighbors } from './hex'

export interface PathResult {
  cellIds: string[]
  totalCost: number
}

export function findPath(grid: HexGrid, startCellId: string, goalCellId: string): PathResult | undefined {
  const cells = new Map(grid.cells.map((cell) => [cell.id, cell]))
  const start = cells.get(startCellId)
  const goal = cells.get(goalCellId)
  if (!start || !goal || !start.movementCost || !goal.movementCost) return undefined
  if (start.id === goal.id) return { cellIds: [start.id], totalCost: 0 }

  const open = new Set([start.id])
  const cameFrom = new Map<string, string>()
  const costs = new Map<string, number>([[start.id, 0]])
  const estimates = new Map<string, number>([[start.id, hexDistance(start, goal) * 1000]])

  while (open.size > 0) {
    const currentId = [...open].sort((a, b) => {
      const difference = (estimates.get(a) ?? Number.POSITIVE_INFINITY) - (estimates.get(b) ?? Number.POSITIVE_INFINITY)
      return difference || (a < b ? -1 : a > b ? 1 : 0)
    })[0]
    if (!currentId) break
    if (currentId === goal.id) return reconstructPath(cameFrom, costs, currentId)
    open.delete(currentId)
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
  return undefined
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
