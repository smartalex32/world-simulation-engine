import { describe, expect, it } from 'vitest'
import type { InfrastructureAssetState } from '../domain/types'
import { disruptInfrastructure, effectiveCapacity, maintainInfrastructure } from './model'
import { infrastructureAccessAtCell } from './access'

describe('authoritative infrastructure lifecycle', () => {
  it('records explicit disruption and resource-backed repair without random draws', () => {
    const asset: InfrastructureAssetState = { version: 1, id: 'road.a', kind: 'road', cellIds: ['0,0'], capacity: 100, conditionPermille: 900, disruptionPermille: 0, maintenanceUnits: 5 }
    disruptInfrastructure(asset, 250, 720, 'controlled flood scenario')
    expect(asset.lastTrace).toMatchObject({ kind: 'disrupted', capacity: 67, reason: 'controlled flood scenario' })
    maintainInfrastructure([asset], 1440)
    expect(asset).toMatchObject({ conditionPermille: 905, maintenanceUnits: 0, lastTrace: { kind: 'repaired', previousConditionPermille: 900, conditionDeltaPermille: 5, capacity: 67 } })
    expect(effectiveCapacity(asset)).toBe(67)
  })

  it('degrades deterministically when no maintenance units are available', () => {
    const asset: InfrastructureAssetState = { version: 1, id: 'storage.a', kind: 'storage', cellIds: ['0,0'], capacity: 20, conditionPermille: 1000, disruptionPermille: 0, maintenanceUnits: 0 }
    maintainInfrastructure([asset], 720)
    expect(asset).toMatchObject({ conditionPermille: 990, lastTrace: { kind: 'degraded', conditionDeltaPermille: -10, capacity: 19 } })
  })

  it('exposes capacity only at an asset’s physical cells', () => {
    const asset: InfrastructureAssetState = { version: 1, id: 'service.a', kind: 'service', cellIds: ['1,0'], capacity: 30, conditionPermille: 1000, disruptionPermille: 0, maintenanceUnits: 0 }
    expect(infrastructureAccessAtCell([asset], '1,0')).toMatchObject({ servicePermille: 600 })
    expect(infrastructureAccessAtCell([asset], '0,0')).toEqual({ transportPermille: 0, storagePermille: 0, servicePermille: 0 })
  })
})
