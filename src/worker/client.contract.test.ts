import { describe, expectTypeOf, it } from 'vitest'
import type { CommandAcknowledgement, SimulationCommand } from '../runtime/contracts'
import type { SimulationWorkerClient } from './client'

describe('simulation worker client contract', () => {
  it('exposes typed correlated completion for every mutating convenience command', () => {
    type Ack = CommandAcknowledgement<SimulationCommand>
    expectTypeOf<ReturnType<SimulationWorkerClient['create']>>().toMatchTypeOf<Promise<Ack>>()
    expectTypeOf<ReturnType<SimulationWorkerClient['updateDraft']>>().toMatchTypeOf<Promise<Ack>>()
    expectTypeOf<ReturnType<SimulationWorkerClient['commitDraft']>>().toMatchTypeOf<Promise<Ack>>()
    expectTypeOf<ReturnType<SimulationWorkerClient['load']>>().toMatchTypeOf<Promise<Ack>>()
    expectTypeOf<ReturnType<SimulationWorkerClient['step']>>().toMatchTypeOf<Promise<Ack>>()
    expectTypeOf<ReturnType<SimulationWorkerClient['play']>>().toMatchTypeOf<Promise<Ack>>()
    expectTypeOf<ReturnType<SimulationWorkerClient['pause']>>().toMatchTypeOf<Promise<Ack>>()
    expectTypeOf<ReturnType<SimulationWorkerClient['reset']>>().toMatchTypeOf<Promise<Ack>>()
  })
})
