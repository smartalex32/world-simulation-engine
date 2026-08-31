import { projectionInvalidationFromChangeSet, type ProjectionInvalidation } from '../projection'
import type { AuthoritativeChangeSet, SimulationEvent, StatisticSample } from '../simulation/domain/types'
import { SimulationEngine } from '../simulation/engine/engine'
import type { EngineCommand } from './contracts'
import { completeRetention, type EventRetentionReport } from '../simulation/events/retention'

export interface EngineCommandExecution {
  events: SimulationEvent[]
  statistics: StatisticSample[]
  eventRetention: EventRetentionReport
  changeSet: AuthoritativeChangeSet
  projectionInvalidation: ProjectionInvalidation
}

export interface SimulationCommandContext { engine: SimulationEngine }

/**
 * The one application-layer implementation for engine mutations. Adapters own
 * scheduling, durability, and response delivery; this service owns neither.
 */
export class SimulationApplicationService {
  execute(command: EngineCommand, context: SimulationCommandContext): EngineCommandExecution {
    const { engine } = context
    if (command.type === 'STEP') {
      const count = command.count ?? 1
      if (!Number.isSafeInteger(count) || count < 1) throw new Error('Simulation step count must be a positive safe integer')
      const result = engine.advance(count)
      return this.result(result.events, result.statistics, result.changeSet, result.eventRetention)
    }
    if (command.type === 'MATERIALIZE_COHORT') {
      const result = engine.materializeCohort(command.cohortId, command.populationCount)
      return this.result([result.event], [], result.changeSet)
    }
    if (command.type === 'DEMATERIALIZE_PEOPLE') {
      const result = engine.dematerializePeople(command.personIds)
      return this.result([result.event], [], result.changeSet)
    }
    if (command.type === 'SET_PROTECTED_PEOPLE') {
      engine.protectDetailedPeople(command.personIds)
      return this.result([], [], { categories: [], cellIds: [] })
    }
    return assertNever(command)
  }

  private result(events: SimulationEvent[], statistics: StatisticSample[], changeSet: AuthoritativeChangeSet, eventRetention: EventRetentionReport = completeRetention(events)): EngineCommandExecution {
    return { events, statistics, eventRetention, changeSet, projectionInvalidation: projectionInvalidationFromChangeSet(changeSet) }
  }
}

function assertNever(value: never): never { throw new Error(`Unsupported engine command: ${JSON.stringify(value)}`) }
