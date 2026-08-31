import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { SimulationEngine } from '../simulation/engine/engine'
import { SimulationApplicationService } from './simulationApplicationService'

describe('SimulationApplicationService', () => {
  it('keeps the shared engine command path deterministic', async () => {
    const creation = defaultWorldCreationRequest('application-service-golden')
    const direct = SimulationEngine.create(creation)
    const adapted = SimulationEngine.create(creation)
    direct.advance(48)

    const result = new SimulationApplicationService().execute(adapted, { type: 'STEP', requestId: 'step-48', count: 48 })

    expect(result.events.length).toBeGreaterThan(0)
    expect(result.statistics.length).toBeGreaterThan(0)
    expect(await adapted.snapshot()).toEqual(await direct.snapshot())
  })

  it('validates command arguments before mutating the engine', async () => {
    const engine = SimulationEngine.create(defaultWorldCreationRequest('application-service-invalid'))
    const before = await engine.snapshot()
    expect(() => new SimulationApplicationService().execute(engine, { type: 'STEP', requestId: 'bad-step', count: 0 })).toThrow('positive safe integer')
    expect(await engine.snapshot()).toEqual(before)
  })
})
