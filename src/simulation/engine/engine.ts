import {
  BASE_TICK_HOURS,
  ENGINE_VERSION,
  INFLUENCE_REGISTRY_VERSION,
  VARIABLE_REGISTRY_VERSION,
  type SimulationEvent,
  type SimulationState,
  type SnapshotEnvelope,
  type StatisticSample,
  type WorldProjection,
} from '../domain/types'
import { advanceJourney, chooseAction, resolveAction, type ActionContext, type ActionOutcome, type JourneyOutcome } from '../agents/actions'
import { generatePopulation } from '../agents/population'
import {
  ENCOUNTER_SOCIAL_NEED_RECOVERY,
  HOURLY_FATIGUE_INCREASE,
  HOURLY_HUNGER_INCREASE,
  HOURLY_SOCIAL_NEED_INCREASE,
  HOURLY_TRAVEL_BUDGET,
} from '../agents/actionConfig'
import { RandomProvider } from '../rng/pcg32'
import { resolveEncounters, type ResolvedEncounter } from '../relationships/encounters'
import { applyEncounter, createRelationship, decayInteractionFrequency, relationshipId } from '../relationships/model'
import { createSnapshot, validateSnapshot } from '../serialization/snapshot'
import { generateValley } from '../spatial/worldGenerator'
import { PERSON_VARIABLE_DEFINITIONS, PERSON_VARIABLE_ID } from '../variables/registry'
import { adjustPersonVariable, getPersonVariable, validatePersonVariableValues } from '../variables/storage'

export interface StepResult {
  projection: WorldProjection
  events: SimulationEvent[]
  statistics: StatisticSample[]
}

export class SimulationEngine {
  private random: RandomProvider
  private readonly cellById: Map<string, SimulationState['world']['grid']['cells'][number]>
  private readonly personById: Map<string, SimulationState['people'][number]>
  private readonly relationshipById: Map<string, SimulationState['relationships'][number]>

  private constructor(private state: SimulationState, random: RandomProvider) {
    this.random = random
    this.cellById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
    this.personById = new Map(state.people.map((person) => [person.id, person]))
    this.relationshipById = new Map(state.relationships.map((relationship) => [relationship.id, relationship]))
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
      config: {
        seed: normalizedSeed,
        worldWidth: width,
        worldHeight: height,
        baseTickHours: BASE_TICK_HOURS,
        variableRegistryVersion: VARIABLE_REGISTRY_VERSION,
        influenceRegistryVersion: INFLUENCE_REGISTRY_VERSION,
      },
      world,
      people,
      relationships: [],
      dailySpatialCounters: { travelCost: 0, completedMoves: 0, foodConsumed: 0, failedMeals: 0 },
      dailySocialCounters: { encounters: 0, positiveEncounters: 0, neutralEncounters: 0, tenseEncounters: 0, relationshipsFormed: 0 },
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
    const pushEvent = (event: SimulationEvent) => {
      if (events.length < 500) events.push(event)
      else {
        events[eventWriteIndex] = event
        eventWriteIndex = (eventWriteIndex + 1) % 500
      }
    }
    const statistics: StatisticSample[] = []
    for (let index = 0; index < count; index += 1) {
      this.state.tick += 1
      for (const person of this.state.people) {
        adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger, HOURLY_HUNGER_INCREASE)
        adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.fatigue, HOURLY_FATIGUE_INCREASE)
        adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.socialConnection, HOURLY_SOCIAL_NEED_INCREASE)
      }

      for (const person of this.state.people) {
        const journey = advanceJourney(person, HOURLY_TRAVEL_BUDGET)
        if (journey?.arrived) {
          this.recordTravel(journey.travelCost)
          pushEvent(this.journeyEvent(person.id, journey))
        }
      }

      const occupantsByCell = this.buildOccupancy(true)
      const context: ActionContext = { tick: this.state.tick, cellById: this.cellById, occupantsByCell }
      const actionRng = this.random.stream('actions')
      const decisions = this.state.people
        .filter((person) => !person.journey)
        .map((person) => ({ person, decision: chooseAction(person, context, actionRng) }))
      for (const { person, decision } of decisions) {
        const outcome = resolveAction(person, decision, context)
        if (outcome.arrived) this.recordTravel(outcome.travelCost)
        this.state.dailySpatialCounters.foodConsumed += outcome.foodConsumed
        if (outcome.failedMeal) this.state.dailySpatialCounters.failedMeals += 1
        pushEvent(this.actionEvent(person.id, decision, outcome))
      }
      const socializerIds = new Set(decisions
        .filter(({ decision }) => decision.action === 'socialize')
        .map(({ person }) => person.id))
      const encounters = resolveEncounters({
        peopleById: this.personById,
        occupantsByCell,
        socializerIds,
        relationshipsById: this.relationshipById,
      }, this.random.stream('encounters'))
      for (const encounter of encounters) {
        const formed = this.applyEncounter(encounter)
        if (formed) pushEvent(this.relationshipFormedEvent(encounter))
        pushEvent(this.encounterEvent(encounter))
      }
      if (encounters.length > 0) {
        this.state.relationships = [...this.relationshipById.values()].sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0)
      }
      if (this.state.tick % 24 === 0) {
        this.regenerateFood()
        statistics.push(...this.sampleDailyStatistics())
        this.decayRelationshipFrequencies()
        this.state.dailySpatialCounters = { travelCost: 0, completedMoves: 0, foodConsumed: 0, failedMeals: 0 }
        this.state.dailySocialCounters = { encounters: 0, positiveEncounters: 0, neutralEncounters: 0, tenseEncounters: 0, relationshipsFormed: 0 }
      }
    }
    this.state.randomStreams = this.random.snapshot()
    const clockEvent = this.event('CLOCK_ADVANCED', { hours: count, currentTick: this.state.tick })
    pushEvent(clockEvent)
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
      relationships: this.state.relationships,
      variableDefinitions: PERSON_VARIABLE_DEFINITIONS,
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
    const population = this.state.people.length
    const relationshipCount = this.state.relationships.length
    const possibleRelationships = population > 1 ? population * (population - 1) / 2 : 0
    const averageFamiliarity = relationshipCount > 0
      ? Math.round(this.state.relationships.reduce((sum, relationship) => sum + relationship.familiarity, 0) / relationshipCount)
      : 0
    const base = { runId: this.state.runId, tick: this.state.tick, metricVersion: 1 as const, scope: 'world' as const }
    return [
      { ...base, metricId: 'world.cellCount', value: cells.length },
      { ...base, metricId: 'world.habitableCells', value: cells.filter((cell) => cell.habitability > 0).length },
      { ...base, metricId: 'engine.simulatedDays', value: this.state.tick / 24 },
      { ...base, metricId: 'population.count', value: this.state.people.length },
      { ...base, metricId: 'population.averageHunger', value: Math.round(this.state.people.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger), 0) / this.state.people.length) },
      { ...base, metricId: 'spatial.occupiedCells', value: this.buildOccupancy().size },
      { ...base, metricId: 'spatial.averageTravelCost', value: Math.round(this.state.dailySpatialCounters.travelCost / this.state.people.length) },
      { ...base, metricId: 'resources.totalFood', value: cells.reduce((sum, cell) => sum + cell.foodAmount, 0) },
      { ...base, metricId: 'resources.foodConsumed', value: this.state.dailySpatialCounters.foodConsumed },
      { ...base, metricId: 'resources.failedMeals', value: this.state.dailySpatialCounters.failedMeals },
      { ...base, metricId: 'social.encounters', value: this.state.dailySocialCounters.encounters },
      { ...base, metricId: 'social.encountersPer1000People', value: population > 0 ? Math.round(this.state.dailySocialCounters.encounters * 1000 / population) : 0 },
      { ...base, metricId: 'social.relationshipCount', value: relationshipCount },
      { ...base, metricId: 'social.networkDensityPermille', value: possibleRelationships > 0 ? Math.round(relationshipCount * 1000 / possibleRelationships) : 0 },
      { ...base, metricId: 'social.averageFamiliarity', value: averageFamiliarity },
      { ...base, metricId: 'social.positiveEncounters', value: this.state.dailySocialCounters.positiveEncounters },
      { ...base, metricId: 'social.tenseEncounters', value: this.state.dailySocialCounters.tenseEncounters },
    ]
  }

  private regenerateFood(): void {
    for (const cell of this.state.world.grid.cells) {
      cell.foodAmount = Math.min(cell.resourceCapacity, cell.foodAmount + cell.foodRegenerationPerDay)
    }
  }

  private recordTravel(cost: number): void {
    this.state.dailySpatialCounters.travelCost += cost
    this.state.dailySpatialCounters.completedMoves += 1
  }

  private buildOccupancy(excludeTravelers = false): Map<string, string[]> {
    const occupancy = new Map<string, string[]>()
    for (const person of this.state.people) {
      if (excludeTravelers && person.journey) continue
      const occupants = occupancy.get(person.locationCellId)
      if (occupants) occupants.push(person.id)
      else occupancy.set(person.locationCellId, [person.id])
    }
    return occupancy
  }

  private applyEncounter(encounter: ResolvedEncounter): boolean {
    const id = relationshipId(encounter.initiatorId, encounter.participantId)
    const existing = this.relationshipById.get(id)
    const updated = applyEncounter(existing ?? createRelationship(encounter.initiatorId, encounter.participantId), encounter.outcome, this.state.tick)
    this.relationshipById.set(id, updated)
    const familiarityAfter = updated.familiarity
    const initiator = this.personById.get(encounter.initiatorId)
    const participant = this.personById.get(encounter.participantId)
    if (!initiator || !participant) throw new Error('Resolved encounter contains a missing person')
    adjustPersonVariable(initiator.variables, PERSON_VARIABLE_ID.socialConnection, -ENCOUNTER_SOCIAL_NEED_RECOVERY)
    adjustPersonVariable(participant.variables, PERSON_VARIABLE_ID.socialConnection, -ENCOUNTER_SOCIAL_NEED_RECOVERY)
    const shared = {
      tick: this.state.tick,
      cellId: encounter.cellId,
      outcome: encounter.outcome,
      outcomeWeight: encounter.outcomeWeight,
      totalOutcomeWeight: encounter.totalOutcomeWeight,
      probabilityPermille: encounter.probabilityPermille,
      familiarityBefore: encounter.familiarityBefore,
      familiarityAfter,
    }
    initiator.lastEncounter = { ...shared, otherPersonId: participant.id, role: 'initiator' }
    participant.lastEncounter = { ...shared, otherPersonId: initiator.id, role: 'participant' }
    this.state.dailySocialCounters.encounters += 1
    if (encounter.outcome === 'positive') this.state.dailySocialCounters.positiveEncounters += 1
    else if (encounter.outcome === 'neutral') this.state.dailySocialCounters.neutralEncounters += 1
    else this.state.dailySocialCounters.tenseEncounters += 1
    if (!existing) this.state.dailySocialCounters.relationshipsFormed += 1
    return !existing
  }

  private decayRelationshipFrequencies(): void {
    this.state.relationships = this.state.relationships.map(decayInteractionFrequency)
    this.relationshipById.clear()
    for (const relationship of this.state.relationships) this.relationshipById.set(relationship.id, relationship)
  }

  private encounterEvent(encounter: ResolvedEncounter): SimulationEvent {
    const updated = this.relationshipById.get(relationshipId(encounter.initiatorId, encounter.participantId))
    if (!updated) throw new Error('Encounter relationship was not recorded')
    return this.event('PERSON_ENCOUNTERED', {
      personId: encounter.initiatorId,
      otherPersonId: encounter.participantId,
      cellId: encounter.cellId,
      outcome: encounter.outcome,
      outcomeWeight: encounter.outcomeWeight,
      totalOutcomeWeight: encounter.totalOutcomeWeight,
      probabilityPermille: encounter.probabilityPermille,
      familiarityBefore: encounter.familiarityBefore,
      familiarityAfter: updated.familiarity,
    })
  }

  private relationshipFormedEvent(encounter: ResolvedEncounter): SimulationEvent {
    const firstId = encounter.initiatorId < encounter.participantId ? encounter.initiatorId : encounter.participantId
    const secondId = encounter.initiatorId < encounter.participantId ? encounter.participantId : encounter.initiatorId
    return this.event('RELATIONSHIP_FORMED', {
      personId: encounter.initiatorId,
      personAId: firstId,
      personBId: secondId,
      cellId: encounter.cellId,
    })
  }

  private actionEvent(personId: string, decision: NonNullable<SimulationState['people'][number]['lastDecision']>, outcome: ActionOutcome): SimulationEvent {
    const type = decision.action === 'eat'
      ? outcome.failedMeal ? 'PERSON_FAILED_TO_EAT' : 'PERSON_ATE'
      : decision.action === 'move' || decision.action === 'explore'
        ? outcome.arrived ? decision.action === 'explore' ? 'PERSON_EXPLORED' : 'PERSON_MOVED' : 'PERSON_STARTED_TRAVEL'
        : decision.action === 'rest' ? 'PERSON_RESTED' : 'PERSON_SOCIALIZED'
    return this.event(type, {
      personId,
      fromCellId: outcome.fromCellId,
      targetCellId: decision.targetCellId ?? null,
      actionWeight: decision.weight,
      probabilityPermille: decision.probabilityPermille,
      foodConsumed: outcome.foodConsumed,
      hungerReduced: outcome.hungerReduced,
      fatigueReduced: outcome.fatigueReduced,
      travelCost: outcome.travelCost,
    })
  }

  private journeyEvent(personId: string, journey: JourneyOutcome): SimulationEvent {
    return this.event(journey.kind === 'explore' ? 'PERSON_EXPLORED' : 'PERSON_MOVED', {
      personId,
      fromCellId: journey.fromCellId,
      targetCellId: journey.targetCellId,
      actionWeight: null,
      probabilityPermille: null,
      foodConsumed: 0,
      travelCost: journey.travelCost,
    })
  }

  private assertInvariants(): void {
    const { width, height, cells } = this.state.world.grid
    if (cells.length !== width * height) throw new Error('World cell count does not match bounds')
    if (new Set(cells.map((cell) => cell.id)).size !== cells.length) throw new Error('World contains duplicate cell IDs')
    for (const cell of cells) {
      if (!Number.isInteger(cell.foodAmount) || cell.foodAmount < 0 || cell.foodAmount > cell.resourceCapacity) throw new Error(`Cell ${cell.id} has invalid food stock`)
    }
    if (!Number.isSafeInteger(this.state.tick) || this.state.tick < 0) throw new Error('Simulation tick is invalid')
    if (new Set(this.state.people.map((person) => person.id)).size !== this.state.people.length) throw new Error('Population contains duplicate person IDs')
    const personIds = new Set(this.state.people.map((person) => person.id))
    for (const person of this.state.people) {
      if (!this.cellById.has(person.locationCellId)) throw new Error(`Person ${person.id} occupies a missing cell`)
      validatePersonVariableValues(person.variables)
      if (person.journey) {
        const destination = this.cellById.get(person.journey.destinationCellId)
        if (!destination?.movementCost) throw new Error(`Person ${person.id} is traveling to an invalid cell`)
        if (!Number.isInteger(person.journey.remainingCost) || person.journey.remainingCost <= 0 || person.journey.remainingCost > person.journey.totalCost) throw new Error(`Person ${person.id} has invalid journey progress`)
      }
      if (person.lastEncounter) {
        if (!personIds.has(person.lastEncounter.otherPersonId) || person.lastEncounter.otherPersonId === person.id) throw new Error(`Person ${person.id} has an invalid last encounter`)
        if (person.lastEncounter.tick > this.state.tick) throw new Error(`Person ${person.id} has a future encounter`)
      }
    }
    if (new Set(this.state.relationships.map((relationship) => relationship.id)).size !== this.state.relationships.length) throw new Error('Relationships contain duplicate IDs')
    const sortedRelationshipIds = this.state.relationships.map((relationship) => relationship.id).sort()
    if (this.state.relationships.some((relationship, index) => relationship.id !== sortedRelationshipIds[index])) throw new Error('Relationships are not in canonical order')
    for (const relationship of this.state.relationships) {
      if (relationship.personAId >= relationship.personBId || relationship.id !== relationshipId(relationship.personAId, relationship.personBId)) throw new Error(`Relationship ${relationship.id} is not canonical`)
      if (!personIds.has(relationship.personAId) || !personIds.has(relationship.personBId)) throw new Error(`Relationship ${relationship.id} contains a missing person`)
      const bounded = [relationship.familiarity, relationship.interactionFrequency, ...Object.values(relationship.aToB), ...Object.values(relationship.bToA)]
      if (bounded.some((value) => !Number.isInteger(value) || value < 0 || value > 1000)) throw new Error(`Relationship ${relationship.id} has invalid dimensions`)
      if (!Number.isSafeInteger(relationship.interactionCount) || relationship.interactionCount < 1) throw new Error(`Relationship ${relationship.id} has invalid interaction count`)
      if (!Number.isSafeInteger(relationship.lastInteractionTick) || relationship.lastInteractionTick < 1 || relationship.lastInteractionTick > this.state.tick) throw new Error(`Relationship ${relationship.id} has invalid interaction tick`)
    }
    const social = this.state.dailySocialCounters
    if (Object.values(social).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('Daily social counters are invalid')
    if (social.positiveEncounters + social.neutralEncounters + social.tenseEncounters !== social.encounters) throw new Error('Daily social outcome counters do not sum to encounters')
    if (social.relationshipsFormed > social.encounters) throw new Error('Daily relationship formations exceed encounters')
  }
}
