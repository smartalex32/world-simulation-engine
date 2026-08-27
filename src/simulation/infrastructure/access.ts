import type { InfrastructureAssetState } from '../domain/types'
import { effectiveCapacity } from './model'

/** Shared, read-only access view for consumers. It never grants a person an
 * asset merely through settlement membership: only physical asset cells count. */
export interface InfrastructureAccess { transportPermille: number; storagePermille: number; servicePermille: number }

export function infrastructureAccessAtCell(assets: readonly InfrastructureAssetState[], cellId: string): InfrastructureAccess {
  const local = assets.filter((asset) => asset.cellIds.includes(cellId))
  const capacity = (kinds: readonly InfrastructureAssetState['kind'][]) => Math.min(1000, local.filter((asset) => kinds.includes(asset.kind)).reduce((total, asset) => total + effectiveCapacity(asset) * 20, 0))
  return { transportPermille: capacity(['road', 'waterway', 'port']), storagePermille: capacity(['storage']), servicePermille: capacity(['service']) }
}

export function infrastructureAccessAcrossCells(assets: readonly InfrastructureAssetState[], cellIds: readonly string[]): InfrastructureAccess {
  if (cellIds.length === 0) return { transportPermille: 0, storagePermille: 0, servicePermille: 0 }
  const total = cellIds.map((cellId) => infrastructureAccessAtCell(assets, cellId)).reduce((sum, value) => ({ transportPermille: sum.transportPermille + value.transportPermille, storagePermille: sum.storagePermille + value.storagePermille, servicePermille: sum.servicePermille + value.servicePermille }), { transportPermille: 0, storagePermille: 0, servicePermille: 0 })
  return { transportPermille: Math.floor(total.transportPermille / cellIds.length), storagePermille: Math.floor(total.storagePermille / cellIds.length), servicePermille: Math.floor(total.servicePermille / cellIds.length) }
}
