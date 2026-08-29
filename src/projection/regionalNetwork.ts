import type { GeographicCell, RoadState, SettlementState } from '../simulation/domain/types'
import { findPathDetailed } from '../simulation/spatial/pathfinding'
import { ROAD_MOVEMENT_COST_MULTIPLIER_PERMILLE } from '../simulation/agents/actionConfig'
import type { ProjectedSettlementLink } from './types'
import { compareStableText } from '../shared/stableOrder'

export const MAX_SETTLEMENT_LINKS = 48

/** Read-only regional accessibility: routes, not membership, produce links. */
export function buildProjectedSettlementLinks(settlements: readonly SettlementState[], cells: readonly GeographicCell[], roads: readonly RoadState[] = []): ProjectedSettlementLink[] {
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  const roadIds = new Set(roads.flatMap((road) => road.cellIds))
  const ordered = [...settlements].sort((a, b) => compareStableText(a.id, b.id))
  const links: ProjectedSettlementLink[] = []
  for (let index = 0; index < ordered.length; index += 1) for (let next = index + 1; next < ordered.length; next += 1) {
    const first = ordered[index]!, second = ordered[next]!
    const result = findPathDetailed({ width: 0, height: 0, cells: [...cells] }, first.anchorCellId, second.anchorCellId, { cellById: byId, maxExpansions: 4096 })
    if (!result.path || result.truncated) continue
    const travelCost = result.path.cellIds.slice(1).reduce((sum, id) => sum + Math.floor((byId.get(id)?.movementCost ?? 0) * (roadIds.has(id) ? ROAD_MOVEMENT_COST_MULTIPLIER_PERMILLE : 1000) / 1000), 0)
    links.push({ id: `${first.id}|${second.id}`, fromSettlementId: first.id, toSettlementId: second.id, fromCellId: first.anchorCellId, toCellId: second.anchorCellId, steps: result.path.cellIds.length - 1, travelCost, roadCellCount: result.path.cellIds.filter((id) => roadIds.has(id)).length })
  }
  return links.sort((a, b) => a.travelCost - b.travelCost || compareStableText(a.id, b.id)).slice(0, MAX_SETTLEMENT_LINKS)
}
