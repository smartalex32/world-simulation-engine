import {
  BASE_TICK_HOURS,
  ENGINE_VERSION,
  type SimulationEvent,
  type SimulationState,
  type SnapshotEnvelope,
  type StatisticSample,
  type WorldProjection,
} from '../domain/types'
import { applyAction, chooseAction, type ActionContext } from '../agents/actions'
import { generatePopulation } from '../agents/population'
import { RandomProvider } from '../rng/pcg32'
import { createSnapshot, validateSnapshot } from '../serialization/snapshot'
import { generateValley } from '../spatial/worldGenerator'

export interface StepResult {
  projection: WorldProjection
  events: SimulationEvent[]
  statistics: StatisticSample[]
}

export class SimulationEngine {
  private random: RandomProvider
  private readonly cellById: Map<string, SimulationState['world']['grid']['cells'][number]>

  private constructor(private state: SimulationState, random: RandomProvider) {
    this.random = random
    this.cellById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
  }

  static create(seed: string, width = 32, height = 24): SimulationEngine {
    const normalizedSeed = seed.trim() || 'valley-001'
    const { world, random } = generateValley(normalizedSeed, width, height)
    const people = generatePopulation(world.grid.cells, random)
    const runId = `run-${world.id.slice(6)}-${width}x${height}`
    return new SimulationEngine({
      runId,
      tick: 0,
      nextEventSequence: 1,
      config: { seed: normalizedSeed, worldWidth: width, worldHeight: height, baseTickHours: BASE_TICK_HOURS },
      world,
      people,
      randomStreams: random.snapshot(),
    }, random)
  }

  static async restore(snapshotValue: unknown): Promise<SimulationEngine> {
    const snapshot = await validateSnapshot(snapshotValue)
    const state = structuredClone(snapshot.state)
    return new SimulationEngine(state, new RandomProvider(state.config.seed, state.randomStreams))
  }

  step(count = 1): StepResult {
    if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Step count must be a positive safe integer')
    const events: SimulationEvent[] = []
    let eventWriteIndex = 0
    const statistics: StatisticSample[] = []
    for (let index = 0; index < count; index += 1) {
      this.state.tick += 1
      for (const person of this.state.people) person.hunger = Math.min(1000, person.hunger + 12)
      const occupantsByCell = this.buildOccupancy()
      const context: ActionContext = { tick: this.state.tick, cellById: this.cellById, occupantsByCell }
      const actionRng = this.random.stream('actions')
      for (const person of this.state.people) {
        const fromCellId = person.locationCellId
        const decision = chooseAction(person, context, actionRng)
        applyAction(person, decision, context)
        const actionEvent = this.actionEvent(person.id, fromCellId, decision)
        if (events.length < 500) events.push(actionEvent)
        else {
          events[eventWriteIndex] = actionEvent
          eventWriteIndex = (eventWriteIndex + 1) % 500
        }
      }
      if (this.state.tick % 24 === 0) statistics.push(...this.sampleDailyStatistics())
    }
    this.state.randomStreams = this.random.snapshot()
    const clockEvent = this.event('CLOCK_ADVANCED', { hours: count, currentTick: this.state.tick })
    if (events.length < 500) events.push(clockEvent)
    else {
      events[eventWriteIndex] = clockEvent
      eventWriteIndex = (eventWriteIndex + 1) % 500
    }
    if (events.length === 500 && eventWriteIndex > 0) {
      const ordered = [...events.slice(eventWriteIndex), ...events.slice(0, eventWriteIndex)]
      events.splice(0, events.length, ...ordered)
    }
    this.assertInvariants()
    return { projection: this.project(), events, statistics }
  }

  project(digest?: string): WorldProjection {
    return {
      runId: this.state.runId,
      tick: this.state.tick,
      seed: this.state.config.seed,
      engineVersion: ENGINE_VERSION,
      world: this.state.world,
      people: this.state.people,
      digest,
    }
  }

  async snapshot(): Promise<SnapshotEnvelope> {
    this.state.randomStreams = this.random.snapshot()
    return createSnapshot(this.state)
  }

  event(type: SimulationEvent['type'], payload: SimulationEvent['payload'] = {}): SimulationEvent {
    const sequence = this.state.nextEventSequence
    this.state.nextEventSequence += 1
    return {
      id: `${this.state.runId}:${this.state.tick}:${sequence}`,
      runId: this.state.runId,
      tick: this.state.tick,
      type,
      version: 1,
      payload,
    }
  }

  private sampleDailyStatistics(): StatisticSample[] {
    const cells = this.state.world.grid.cells
    const base = { runId: this.state.runId, tick: this.state.tick, metricVersion: 1 as const, scope: 'world' as const }
    return [
      { ...base, metricId: 'world.cellCount', value: cells.length },
      { ...base, metricId: 'world.habitableCells', value: cells.filter((cell) => cell.habitability > 0).length },
      { ...base, metricId: 'engine.simulatedDays', value: this.state.tick / 24 },
      { ...base, metricId: 'population.count', value: this.state.people.length },
      { ...base, metricId: 'population.averageHunger', value: Math.round(this.state.people.reduce((sum, person) => sum + person.hunger, 0) / this.state.people.length) },
    ]
  }

  private buildOccupancy(): Map<string, string[]> {
    const occupancy = new Map<string, string[]>()
    for (const person of this.state.people) {
      const occupants = occupancy.get(person.locationCellId)
      if (occupants) occupants.push(person.id)
      else occupancy.set(person.locationCellId, [person.id])
    }
    return occupancy
  }

  private actionEvent(personId: string, fromCellId: string, decision: NonNullable<SimulationState['people'][number]['lastDecision']>): SimulationEvent {
    const types = {
      eat: 'PERSON_ATE',
      move: 'PERSON_MOVED',
      explore: 'PERSON_EXPLORED',
      rest: 'PERSON_RESTED',
      socialize: 'PERSON_SOCIALIZED',
    } as const
    return this.event(types[decision.action], {
      personId,
      fromCellId,
      targetCellId: decision.targetCellId ?? null,
      actionWeight: decision.weight,
      probabilityPermille: decision.probabilityPermille,
    })
  }

  private assertInvariants(): void {
    const { width, height, cells } = this.state.world.grid
    if (cells.length !== width * height) throw new Error('World cell count does not match bounds')
    if (new Set(cells.map((cell) => cell.id)).size !== cells.length) throw new Error('World contains duplicate cell IDs')
    if (!Number.isSafeInteger(this.state.tick) || this.state.tick < 0) throw new Error('Simulation tick is invalid')
    if (new Set(this.state.people.map((person) => person.id)).size !== this.state.people.length) throw new Error('Population contains duplicate person IDs')
    for (const person of this.state.people) {
      if (!this.cellById.has(person.locationCellId)) throw new Error(`Person ${person.id} occupies a missing cell`)
      if (!Number.isInteger(person.hunger) || person.hunger < 0 || person.hunger > 1000) throw new Error(`Person ${person.id} has invalid hunger`)
      if (Object.values(person.traits).some((trait) => !Number.isInteger(trait) || trait < 0 || trait > 1000)) throw new Error(`Person ${person.id} has invalid traits`)
    }
  }
}
