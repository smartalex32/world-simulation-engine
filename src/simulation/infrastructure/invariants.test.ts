import { beforeAll, describe, expect, it } from 'vitest'
import type { InfrastructureAssetState, SimulationState } from '../domain/types'
import { SimulationEngine } from '../engine/engine'
import { validateInfrastructureState } from './invariants'

describe('infrastructure canonical validation', () => {
  let canonical: SimulationState

  beforeAll(async () => {
    canonical = structuredClone((await SimulationEngine.create('infrastructure-validator').snapshot()).state)
  })

  it('accepts canonical infrastructure state', () => {
    expect(() => validateInfrastructureState(canonical)).not.toThrow()
  })

  it('rejects infrastructure that references a missing world cell', () => {
    const state = structuredClone(canonical)
    const asset = state.infrastructure[0]
    expect(asset).toBeDefined()
    asset!.cellIds = ['missing-cell']
    expect(() => validateInfrastructureState(state)).toThrow(`Infrastructure asset ${asset!.id} has invalid cells`)
  })

  it('validates explicit service operators and decommission ticks without changing legacy assets', () => {
    const operatorState = structuredClone(canonical)
    const service: InfrastructureAssetState = { version: 1, id: 'infrastructure.service.validation', kind: 'service', cellIds: [operatorState.world.grid.cells[0]!.id], capacity: 1, conditionPermille: 1000, disruptionPermille: 0, maintenanceUnits: 0 }
    operatorState.infrastructure.push(service)
    operatorState.infrastructure.sort((first, second) => first.id.localeCompare(second.id))
    service.operatorOrganizationId = 'missing-organization'
    expect(() => validateInfrastructureState(operatorState)).toThrow(`Infrastructure asset ${service.id} has invalid service operator`)

    const retirementState = structuredClone(canonical)
    const retired: InfrastructureAssetState = { version: 1, id: 'infrastructure.service.retired-validation', kind: 'service', cellIds: [retirementState.world.grid.cells[0]!.id], capacity: 1, conditionPermille: 1000, disruptionPermille: 0, maintenanceUnits: 0 }
    retirementState.infrastructure.push(retired)
    retirementState.infrastructure.sort((first, second) => first.id.localeCompare(second.id))
    retired.decommissionedTick = retirementState.tick + 1
    expect(() => validateInfrastructureState(retirementState)).toThrow(`Infrastructure asset ${retired.id} has invalid decommissioning state`)
    expect(() => validateInfrastructureState(canonical)).not.toThrow()
  })
})
