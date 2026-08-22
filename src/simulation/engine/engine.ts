import {
  BASE_TICK_HOURS,
  ACTIVITY_REGISTRY_VERSION,
  COMMUNITY_REGISTRY_VERSION,
  DEVELOPMENT_REGISTRY_VERSION,
  ENGINE_VERSION,
  HOUSEHOLD_MODEL_VERSION,
  INFLUENCE_REGISTRY_VERSION,
  VARIABLE_REGISTRY_VERSION,
  WORLD_GENERATOR_VERSION,
  type WorldCreationDraft,
  type SimulationEvent,
  type SimulationState,
  type ActionName,
  type ParentCuriosityModelingExperience,
  type SnapshotEnvelope,
  type StatisticSample,
  type WorldProjection,
} from '../domain/types'
import { defaultWorldCreationRequest, normalizeWorldCreationRequest, validateWorldCreationDraftLimits } from '../domain/worldCreation'
import {
  COMMUNITY_EMERGENT_IDS,
  COMMUNITY_FEEDBACK_DEFINITIONS,
  COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID,
  COMMUNITY_VARIABLE_DEFINITIONS,
  aggregateCommunityDaily,
  createCommunityState,
  createTwoCatchmentGeography,
  symmetricRoundDivision,
  type CommunityAggregationTrace,
  type CommunityDailyCounterState,
  type CommunitySimulationState,
  type DailyCommunityCounters,
  validateCommunitySimulationState,
} from '../community'
import { resolveCurrentActivity } from '../activities/model'
import { scheduleForAge } from '../activities/config'
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
import { adjustPersonVariable, getPersonVariable, setPersonVariable, validatePersonVariableValues } from '../variables/storage'
import { validateHouseholdActivityState } from './invariants'
import {
  accumulateParentCuriosityExposure,
  completeParentCuriosityExposureWindow,
  PARENT_CURIOSITY_EXPOSURE_CHANNEL,
} from '../exposure/model'
import { applyParentCuriosityDevelopment } from '../development/apply'

interface RuntimeCommunityCounters {
  communityId: string
  windowStartTick: number
  windowEndTick: number
  exposedPersonIds: Set<string>
  encounterParticipantIds: Set<string>
  encounteredRelationshipIds: Set<string>
  exposedPersonHours: number
  commonsPersonHours: number
  curiosityPersonHourSum: number
  socializeSelections: number
  exploreSelections: number
  explorationArrivals: number
  mealAttempts: number
  failedMeals: number
  encounters: number
  positiveEncounters: number
  neutralEncounters: number
  tenseEncounters: number
  postEncounterDirectionalTrustPermilleSum: number
  postEncounterDirectionalFamiliarityPermilleSum: number
  postEncounterDirectionalFearPermilleSum: number
  foodAmountBeforeRegeneration: number
  foodCapacity: number
}

export interface StepResult {
  projection: WorldProjection
  events: SimulationEvent[]
  statistics: StatisticSample[]
}

export interface AdvanceResult {
  events: SimulationEvent[]
  statistics: StatisticSample[]
}

export interface AdvanceOptions {
  /** False defers the batch clock event so a worker may yield without changing event sequencing. */
  clockEventHours?: number | false
}

export class SimulationEngine {
  private random: RandomProvider
  private readonly cellById: Map<string, SimulationState['world']['grid']['cells'][number]>
  private readonly personById: Map<string, SimulationState['people'][number]>
  private readonly relationshipById: Map<string, SimulationState['relationships'][number]>
  private readonly householdById: Map<string, SimulationState['households'][number]>
  private readonly activityLocationById: Map<string, SimulationState['activityLocations'][number]>
  private readonly parentIdsByChildId: Map<string, readonly string[]>
  private readonly communityByCellId: Map<string, CommunitySimulationState>
  private readonly communityCountersById: Map<string, RuntimeCommunityCounters>

  private constructor(private state: SimulationState, random: RandomProvider) {
    this.random = random
    this.cellById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
    this.personById = new Map(state.people.map((person) => [person.id, person]))
    this.relationshipById = new Map(state.relationships.map((relationship) => [relationship.id, relationship]))
    this.householdById = new Map(state.households.map((household) => [household.id, household]))
    this.activityLocationById = new Map(state.activityLocations.map((location) => [location.id, location]))
    this.communityByCellId = new Map()
    for (const community of state.communities) for (const cellId of community.catchment.cellIds) this.communityByCellId.set(cellId, community)
    this.communityCountersById = new Map(state.dailyCommunityCounters.map(({ communityId, counters }) => [communityId, runtimeCommunityCounters(communityId, counters)]))
    const parentIdsByChildId = new Map<string, string[]>()
    for (const link of state.parentChildLinks) {
      const parentIds = parentIdsByChildId.get(link.childId)
      if (parentIds) parentIds.push(link.parentId)
      else parentIdsByChildId.set(link.childId, [link.parentId])
    }
    for (const parentIds of parentIdsByChildId.values()) parentIds.sort(compareIds)
    this.parentIdsByChildId = new Map([...parentIdsByChildId.entries()].sort(([first], [second]) => compareIds(first, second)))
  }

  static create(seedOrDraft: string | WorldCreationDraft, width = 32, height = 24): SimulationEngine {
    const draft = typeof seedOrDraft === 'string' ? defaultWorldCreationRequest(seedOrDraft, width, height) : seedOrDraft
    validateWorldCreationDraftLimits(draft)
    // Terrain generation is pure for a seed, so resolve presets before starting the authoritative RNG provider.
    const preliminary = generateValley(draft.seed.trim() || 'valley-001', draft.width, draft.height, { terrainOverrides: draft.terrainOverrides })
    const creation = normalizeWorldCreationRequest(draft, preliminary.world.grid.cells)
    const creationKey = JSON.stringify(creation)
    const { world, random } = generateValley(creation.seed, creation.width, creation.height, { name: creation.name, settlements: creation.settlements, terrainOverrides: creation.terrainOverrides, idSuffix: creationKey })
    const preserveLegacyHomePlacement = typeof seedOrDraft === 'string' || (draft.populationZones.length === 0 && draft.initialPopulationCount === 200)
    const generatedPopulation = generatePopulation(world.grid.cells, creation.populationZones, random, preserveLegacyHomePlacement)
    const catchments = createTwoCatchmentGeography({ cells: world.grid.cells, width: creation.width, height: creation.height })
    const worldCellById = new Map(world.grid.cells.map((cell) => [cell.id, cell]))
    const communities: CommunitySimulationState[] = catchments.map((catchment) => {
      const cells = catchment.cellIds.map((cellId) => worldCellById.get(cellId)).filter((cell): cell is NonNullable<typeof cell> => cell !== undefined)
      const capacity = cells.reduce((sum, cell) => sum + cell.resourceCapacity, 0)
      const amount = cells.reduce((sum, cell) => sum + cell.foodAmount, 0)
      const foodSecurity = capacity === 0 ? 0 : symmetricRoundDivision(amount * 1000, capacity)
      return { ...createCommunityState(catchment, 500, foodSecurity), lastUpdatedTick: 0, latestTraces: [] }
    })
    const runId = `run-${world.id.slice(6)}-${creation.width}x${creation.height}`
    return new SimulationEngine({
      runId,
      tick: 0,
      nextEventSequence: 1,
      config: {
        seed: creation.seed,
        worldWidth: creation.width,
        worldHeight: creation.height,
        worldGeneratorVersion: WORLD_GENERATOR_VERSION,
        worldCreation: creation,
        baseTickHours: BASE_TICK_HOURS,
        variableRegistryVersion: VARIABLE_REGISTRY_VERSION,
        influenceRegistryVersion: INFLUENCE_REGISTRY_VERSION,
        householdModelVersion: HOUSEHOLD_MODEL_VERSION,
        activityRegistryVersion: ACTIVITY_REGISTRY_VERSION,
        developmentRegistryVersion: DEVELOPMENT_REGISTRY_VERSION,
        communityRegistryVersion: COMMUNITY_REGISTRY_VERSION,
      },
      world,
      people: generatedPopulation.people,
      households: generatedPopulation.households,
      parentChildLinks: generatedPopulation.parentChildLinks,
      activityLocations: generatedPopulation.activityLocations,
      communities,
      dailyCommunityCounters: communities.map(({ catchment }) => emptyCommunityCounterState(catchment.id, 1)),
      relationships: [],
      dailySpatialCounters: { travelCost: 0, completedMoves: 0, foodConsumed: 0, failedMeals: 0 },
      dailySocialCounters: { encounters: 0, positiveEncounters: 0, neutralEncounters: 0, tenseEncounters: 0, relationshipsFormed: 0 },
      dailyActivityCounters: { homePersonHours: 0, commonsPersonHours: 0, travelPersonHours: 0 },
      dailyDevelopmentCounters: { parentChildCoExposureSourceHours: 0, developmentExperiences: 0, developmentChanges: 0, absoluteCuriosityChange: 0 },
      randomStreams: random.snapshot(),
    }, random)
  }

  static async restore(snapshotValue: unknown): Promise<SimulationEngine> {
    const snapshot = await validateSnapshot(snapshotValue)
    const state = structuredClone(snapshot.state)
    return new SimulationEngine(state, new RandomProvider(state.config.seed, state.randomStreams))
  }

  step(count = 1): StepResult {
    const result = this.advance(count)
    return { ...result, projection: this.project() }
  }

  /** Advances authoritative state without constructing a UI/test projection. */
  advance(count = 1, options: AdvanceOptions = {}): AdvanceResult {
    if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Step count must be a positive safe integer')
    if (options.clockEventHours !== undefined && options.clockEventHours !== false && (!Number.isSafeInteger(options.clockEventHours) || options.clockEventHours < 1)) {
      throw new RangeError('Clock event hours must be a positive safe integer')
    }
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
          if (journey.kind === 'explore') this.recordCommunityExplorationArrival(journey.targetCellId)
          pushEvent(this.journeyEvent(person.id, journey))
        }
      }

      this.resolveActivities(pushEvent)

      const occupantsByCell = this.buildOccupancy(true)
      const occupantsByActivityLocation = this.buildActivityOccupancy()
      const context: ActionContext = { tick: this.state.tick, cellById: this.cellById, occupantsByCell, occupantsByActivityLocation, communityByCellId: this.communityByCellId }
      const actionRng = this.random.stream('actions')
      const decisions = this.state.people
        .filter((person) => !person.journey)
        .map((person) => ({ person, decision: chooseAction(person, context, actionRng) }))
      for (const { person, decision } of decisions) {
        const outcome = resolveAction(person, decision, context)
        if (outcome.arrived) this.recordTravel(outcome.travelCost)
        this.state.dailySpatialCounters.foodConsumed += outcome.foodConsumed
        if (outcome.failedMeal) this.state.dailySpatialCounters.failedMeals += 1
        this.recordCommunityAction(decision.action, outcome)
        if (decision.action === 'explore' && outcome.arrived && decision.targetCellId) this.recordCommunityExplorationArrival(decision.targetCellId)
        pushEvent(this.actionEvent(person.id, decision, outcome))
      }
      this.resolveActivities(pushEvent)
      const postActionActivityOccupancy = this.buildActivityOccupancy()
      const socializerIds = new Set(decisions
        .filter(({ decision }) => decision.action === 'socialize')
        .map(({ person }) => person.id))
      const encounters = resolveEncounters({
        peopleById: this.personById,
        occupantsByActivityLocation: postActionActivityOccupancy,
        activityLocationsById: this.activityLocationById,
        socializerIds,
        relationshipsById: this.relationshipById,
      }, this.random.stream('encounters'))
      for (const encounter of encounters) {
        const formed = this.applyEncounter(encounter)
        this.recordCommunityEncounter(encounter)
        if (formed) pushEvent(this.relationshipFormedEvent(encounter))
        pushEvent(this.encounterEvent(encounter))
      }
      if (encounters.length > 0) {
        this.state.relationships = [...this.relationshipById.values()].sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0)
      }
      this.recordActivityPersonHours()
      this.recordCommunityPersonHours()
      this.accumulateDevelopmentExposure()
      if (this.state.tick % 720 === 0) this.processDevelopment(pushEvent)
      this.advanceAges(pushEvent)
      if (this.state.tick % 24 === 0) {
        this.aggregateCommunities(pushEvent)
        this.regenerateFood()
        statistics.push(...this.sampleDailyStatistics())
        this.decayRelationshipFrequencies()
        this.state.dailySpatialCounters = { travelCost: 0, completedMoves: 0, foodConsumed: 0, failedMeals: 0 }
        this.state.dailySocialCounters = { encounters: 0, positiveEncounters: 0, neutralEncounters: 0, tenseEncounters: 0, relationshipsFormed: 0 }
        this.state.dailyActivityCounters = { homePersonHours: 0, commonsPersonHours: 0, travelPersonHours: 0 }
        this.state.dailyDevelopmentCounters = { parentChildCoExposureSourceHours: 0, developmentExperiences: 0, developmentChanges: 0, absoluteCuriosityChange: 0 }
        this.resetCommunityCounters(this.state.tick + 1)
      }
    }
    this.state.randomStreams = this.random.snapshot()
    this.syncCommunityCounterState()
    if (options.clockEventHours !== false) {
      const clockHours = options.clockEventHours ?? count
      pushEvent(this.event('CLOCK_ADVANCED', { hours: clockHours, currentTick: this.state.tick }))
    }
    if (events.length === 500 && eventWriteIndex > 0) {
      const ordered = [...events.slice(eventWriteIndex), ...events.slice(0, eventWriteIndex)]
      events.splice(0, events.length, ...ordered)
    }
    this.assertInvariants()
    return { events, statistics }
  }

  completeAdvanceBatch(hours: number): SimulationEvent {
    if (!Number.isSafeInteger(hours) || hours < 1) throw new RangeError('Completed batch hours must be a positive safe integer')
    return this.event('CLOCK_ADVANCED', { hours, currentTick: this.state.tick })
  }

  project(digest?: string): WorldProjection {
    return {
      runId: this.state.runId,
      tick: this.state.tick,
      seed: this.state.config.seed,
      engineVersion: ENGINE_VERSION,
      world: this.state.world,
      populationZones: this.state.config.worldCreation.populationZones,
      people: this.state.people,
      households: this.state.households,
      parentChildLinks: this.state.parentChildLinks,
      activityLocations: this.state.activityLocations,
      communities: this.state.communities,
      relationships: this.state.relationships,
      variableDefinitions: PERSON_VARIABLE_DEFINITIONS,
      communityVariableDefinitions: COMMUNITY_VARIABLE_DEFINITIONS,
      communityFeedbackDefinitions: COMMUNITY_FEEDBACK_DEFINITIONS,
      digest,
    }
  }

  async snapshot(): Promise<SnapshotEnvelope> {
    this.state.randomStreams = this.random.snapshot()
    this.syncCommunityCounterState()
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
    const worldSamples: StatisticSample[] = [
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
      { ...base, metricId: 'activity.homePersonHours', value: this.state.dailyActivityCounters.homePersonHours },
      { ...base, metricId: 'activity.commonsPersonHours', value: this.state.dailyActivityCounters.commonsPersonHours },
      { ...base, metricId: 'activity.travelPersonHours', value: this.state.dailyActivityCounters.travelPersonHours },
      { ...base, metricId: 'household.parentChildCoExposureSourceHours', value: this.state.dailyDevelopmentCounters.parentChildCoExposureSourceHours },
      { ...base, metricId: 'development.experiences', value: this.state.dailyDevelopmentCounters.developmentExperiences },
      { ...base, metricId: 'development.curiosityChanges', value: this.state.dailyDevelopmentCounters.developmentChanges },
      { ...base, metricId: 'development.absoluteCuriosityChange', value: this.state.dailyDevelopmentCounters.absoluteCuriosityChange },
    ]
    const countersById = new Map(this.state.dailyCommunityCounters.map((entry) => [entry.communityId, entry.counters]))
    const communitySamples: StatisticSample[] = this.state.communities.flatMap((community) => {
      const scopeId = community.catchment.id
      const counters = countersById.get(scopeId)
      if (!counters) throw new Error(`Missing daily community counters for ${scopeId}`)
      const communityBase = { runId: this.state.runId, tick: this.state.tick, metricVersion: 1 as const, scope: 'community' as const, scopeId }
      return [
        { ...communityBase, metricId: 'community.emergent.socialTrust' as const, value: community.emergent['community.emergent.socialTrust'] },
        { ...communityBase, metricId: 'community.emergent.cohesion' as const, value: community.emergent['community.emergent.cohesion'] },
        { ...communityBase, metricId: 'community.emergent.cooperation' as const, value: community.emergent['community.emergent.cooperation'] },
        { ...communityBase, metricId: 'community.emergent.conflict' as const, value: community.emergent['community.emergent.conflict'] },
        { ...communityBase, metricId: 'community.emergent.innovationClimate' as const, value: community.emergent['community.emergent.innovationClimate'] },
        { ...communityBase, metricId: 'community.structural.foodSecurity' as const, value: community.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID] },
        { ...communityBase, metricId: 'community.exposedPersonHours' as const, value: counters.exposedPersonHours },
        { ...communityBase, metricId: 'community.encounters' as const, value: counters.encounters },
      ]
    })
    return [...worldSamples, ...communitySamples]
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

  private recordCommunityAction(action: ActionName, outcome: ActionOutcome): void {
    const counters = this.communityCountersForCell(outcome.fromCellId)
    if (action === 'socialize') counters.socializeSelections += 1
    else if (action === 'explore') counters.exploreSelections += 1
    else if (action === 'eat') {
      counters.mealAttempts += 1
      if (outcome.failedMeal) counters.failedMeals += 1
    }
  }

  private recordCommunityExplorationArrival(cellId: string): void {
    this.communityCountersForCell(cellId).explorationArrivals += 1
  }

  private recordCommunityEncounter(encounter: ResolvedEncounter): void {
    const counters = this.communityCountersForCell(encounter.cellId)
    const id = relationshipId(encounter.initiatorId, encounter.participantId)
    const relationship = this.relationshipById.get(id)
    if (!relationship) throw new Error(`Community encounter ${id} has no relationship state`)
    counters.encounters += 1
    if (encounter.outcome === 'positive') counters.positiveEncounters += 1
    else if (encounter.outcome === 'neutral') counters.neutralEncounters += 1
    else counters.tenseEncounters += 1
    counters.encounterParticipantIds.add(encounter.initiatorId)
    counters.encounterParticipantIds.add(encounter.participantId)
    counters.encounteredRelationshipIds.add(id)
    counters.postEncounterDirectionalTrustPermilleSum += symmetricRoundDivision(relationship.aToB.trust + relationship.bToA.trust, 2)
    counters.postEncounterDirectionalFamiliarityPermilleSum += relationship.familiarity
    counters.postEncounterDirectionalFearPermilleSum += symmetricRoundDivision(relationship.aToB.fear + relationship.bToA.fear, 2)
  }

  private recordCommunityPersonHours(): void {
    for (const person of this.state.people) {
      const counters = this.communityCountersForCell(person.locationCellId)
      counters.exposedPersonIds.add(person.id)
      counters.exposedPersonHours += 1
      if (person.currentActivity.kind === 'commons') counters.commonsPersonHours += 1
      counters.curiosityPersonHourSum += getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity)
    }
  }

  private aggregateCommunities(pushEvent: (event: SimulationEvent) => void): void {
    for (const counters of this.communityCountersById.values()) {
      counters.foodAmountBeforeRegeneration = 0
      counters.foodCapacity = 0
    }
    for (const cell of this.state.world.grid.cells) {
      const counters = this.communityCountersForCell(cell.id)
      counters.foodAmountBeforeRegeneration += cell.foodAmount
      counters.foodCapacity += cell.resourceCapacity
    }
    this.syncCommunityCounterState()
    const counterStateById = new Map(this.state.dailyCommunityCounters.map((entry) => [entry.communityId, entry.counters]))
    const nextCommunities: CommunitySimulationState[] = []
    for (const community of this.state.communities) {
      const counters = counterStateById.get(community.catchment.id)
      if (!counters) throw new Error(`Missing daily community evidence for ${community.catchment.id}`)
      const aggregated = aggregateCommunityDaily(community, counters)
      const next: CommunitySimulationState = {
        ...aggregated.state,
        lastUpdatedTick: this.state.tick,
        latestTraces: [...aggregated.traces],
      }
      nextCommunities.push(next)
      if (counters.exposedPersonHours > 0) pushEvent(this.communityUpdatedEvent(community, next, aggregated.traces, counters))
    }
    this.state.communities = nextCommunities
    this.communityByCellId.clear()
    for (const community of this.state.communities) {
      for (const cellId of community.catchment.cellIds) this.communityByCellId.set(cellId, community)
    }
  }

  private communityUpdatedEvent(
    previous: CommunitySimulationState,
    current: CommunitySimulationState,
    traces: readonly CommunityAggregationTrace[],
    counters: DailyCommunityCounters,
  ): SimulationEvent {
    const traceById = new Map(traces.map((trace) => [trace.variableId, trace]))
    const payload: SimulationEvent['payload'] = {
      communityId: current.catchment.id,
      communityName: current.catchment.displayName,
      windowStartTick: counters.windowStartTick,
      windowEndTick: counters.windowEndTick,
      exposedPersonHours: counters.exposedPersonHours,
      encounters: counters.encounters,
      foodSecurityPermille: current.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID],
      foodSecurityDeltaPermille: current.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID] - previous.structural[COMMUNITY_STRUCTURAL_FOOD_SECURITY_ID],
    }
    for (const id of COMMUNITY_EMERGENT_IDS) {
      const name = id.slice('community.emergent.'.length)
      payload[`${name}Permille`] = current.emergent[id]
      payload[`${name}DeltaPermille`] = current.emergent[id] - previous.emergent[id]
      const trace = traceById.get(id)
      if (!trace || trace.nextValuePermille !== current.emergent[id]) throw new Error(`Community update trace is missing ${id}`)
    }
    return this.event('COMMUNITY_MEASURES_UPDATED', payload)
  }

  private resetCommunityCounters(windowStartTick: number): void {
    this.communityCountersById.clear()
    for (const community of this.state.communities) {
      this.communityCountersById.set(community.catchment.id, emptyRuntimeCommunityCounters(community.catchment.id, windowStartTick))
    }
    this.syncCommunityCounterState()
  }

  private syncCommunityCounterState(): void {
    this.state.dailyCommunityCounters = this.state.communities.map((community) => {
      const runtime = this.communityCountersById.get(community.catchment.id)
      if (!runtime) throw new Error(`Community ${community.catchment.id} has no daily counters`)
      return serializeRuntimeCommunityCounters(runtime)
    })
  }

  private communityCountersForCell(cellId: string): RuntimeCommunityCounters {
    const community = this.communityByCellId.get(cellId)
    if (!community) throw new Error(`Cell ${cellId} does not belong to a community catchment`)
    const counters = this.communityCountersById.get(community.catchment.id)
    if (!counters) throw new Error(`Community ${community.catchment.id} has no daily counters`)
    return counters
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

  private buildActivityOccupancy(): Map<string, string[]> {
    const occupancy = new Map<string, string[]>()
    for (const person of this.state.people) {
      const locationId = person.currentActivity.locationId
      if (locationId === null || person.currentActivity.kind === 'travel') continue
      const occupants = occupancy.get(locationId)
      if (occupants) occupants.push(person.id)
      else occupancy.set(locationId, [person.id])
    }
    return occupancy
  }

  private resolveActivities(pushEvent: (event: SimulationEvent) => void): void {
    const hourOfDay = this.state.tick % 24
    for (const person of this.state.people) {
      const household = this.householdById.get(person.householdId)
      if (!household) throw new Error(`Person ${person.id} belongs to missing household ${person.householdId}`)
      const resolved = resolveCurrentActivity({
        personId: person.id,
        ageYears: person.ageYears,
        locationCellId: person.locationCellId,
        householdId: household.id,
        householdHomeCellId: household.homeCellId,
        journey: person.journey,
      }, hourOfDay)
      const next = resolved === null
        ? { kind: 'travel' as const, locationId: null }
        : { kind: resolved.kind, locationId: resolved.locationId }
      person.activityScheduleId = resolved?.scheduleId ?? scheduleForAge(person.ageYears)
      if (person.currentActivity.kind === next.kind && person.currentActivity.locationId === next.locationId) continue
      const previousKind = person.currentActivity.kind
      const previousLocationId = person.currentActivity.locationId
      person.currentActivity = { ...next, sinceTick: this.state.tick }
      pushEvent(this.event('PERSON_ACTIVITY_CHANGED', {
        personId: person.id,
        previousKind,
        previousLocationId,
        currentKind: next.kind,
        currentLocationId: next.locationId,
      }))
    }
  }

  private recordActivityPersonHours(): void {
    for (const person of this.state.people) {
      if (person.currentActivity.kind === 'home') this.state.dailyActivityCounters.homePersonHours += 1
      else if (person.currentActivity.kind === 'commons') this.state.dailyActivityCounters.commonsPersonHours += 1
      else this.state.dailyActivityCounters.travelPersonHours += 1
    }
  }

  private accumulateDevelopmentExposure(): void {
    for (const [childId, parentIds] of this.parentIdsByChildId) {
      const child = this.personById.get(childId)
      if (!child) throw new Error(`Development exposure recipient ${childId} is missing`)
      const household = this.householdById.get(child.householdId)
      if (!household) throw new Error(`Development exposure recipient ${childId} has a missing household`)
      if (child.currentActivity.kind !== 'home' || child.currentActivity.locationId !== household.homeActivityLocationId || child.locationCellId !== household.homeCellId) continue
      const coPresentParents = parentIds.flatMap((parentId) => {
        const parent = this.personById.get(parentId)
        if (!parent) throw new Error(`Development exposure source ${parentId} is missing`)
        if (parent.currentActivity.kind !== 'home' || parent.currentActivity.locationId !== household.homeActivityLocationId || parent.locationCellId !== household.homeCellId) return []
        return [{ parentId, curiosityPermille: getPersonVariable(parent.variables, PERSON_VARIABLE_ID.curiosity) }]
      })
      if (coPresentParents.length === 0) continue
      const accumulator = child.development.exposures.find(({ channelId }) => channelId === PARENT_CURIOSITY_EXPOSURE_CHANNEL)
      if (!accumulator) throw new Error(`Person ${child.id} is missing parent curiosity exposure state`)
      const updated = accumulateParentCuriosityExposure({ accumulator, tick: this.state.tick, coPresentParents })
      child.development.exposures = [{ ...updated, sourcePersonIds: [...updated.sourcePersonIds] }]
      this.state.dailyDevelopmentCounters.parentChildCoExposureSourceHours += coPresentParents.length
    }
  }

  private processDevelopment(pushEvent: (event: SimulationEvent) => void): void {
    const nextWindowStartTick = this.state.tick + 1
    for (const person of this.state.people) {
      const accumulator = person.development.exposures.find(({ channelId }) => channelId === PARENT_CURIOSITY_EXPOSURE_CHANNEL)
      if (!accumulator) throw new Error(`Person ${person.id} is missing parent curiosity exposure state`)
      const completed = completeParentCuriosityExposureWindow(accumulator, nextWindowStartTick, person.id)
      person.development.exposures = [{ ...completed.accumulator, sourcePersonIds: [...completed.accumulator.sourcePersonIds] }]
      if (!completed.experience) continue
      const household = this.householdById.get(person.householdId)
      if (!household) throw new Error(`Development recipient ${person.id} has a missing household`)
      const experienceId = `${person.id}:${completed.experience.windowStartTick}-${completed.experience.windowEndTick}:${completed.experience.type}`
      const experience: ParentCuriosityModelingExperience = {
        id: experienceId,
        type: completed.experience.type,
        personId: person.id,
        householdId: household.id,
        sourcePersonIds: [...completed.experience.sourcePersonIds],
        activityLocationId: household.homeActivityLocationId,
        startTick: completed.experience.windowStartTick,
        endTick: completed.experience.windowEndTick,
        recipientHours: completed.experience.recipientHours,
        sourceHours: completed.experience.sourceHours,
        sourceMeanPermille: completed.experience.sourceMeanPermille,
        exposureStrengthPermille: completed.experience.exposureStrengthPermille,
      }
      person.development.lastExperience = experience
      this.state.dailyDevelopmentCounters.developmentExperiences += 1
      pushEvent(this.event('PERSON_EXPERIENCED_PARENT_MODELING', {
        personId: person.id,
        householdId: household.id,
        experienceId,
        activityLocationId: household.homeActivityLocationId,
        sourcePersonIds: experience.sourcePersonIds.join(','),
        sourcePersonCount: experience.sourcePersonIds.length,
        recipientHours: experience.recipientHours,
        sourceHours: experience.sourceHours,
        sourceMeanPermille: experience.sourceMeanPermille,
        exposureStrengthPermille: experience.exposureStrengthPermille,
      }))
      const currentCuriosity = getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity)
      const developed = applyParentCuriosityDevelopment({
        currentCuriosityPermille: currentCuriosity,
        ageYears: person.ageYears,
        experience: completed.experience,
      })
      setPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity, developed.currentValuePermille)
      if (developed.trace.appliedDeltaPermille === 0) continue
      const trace = {
        edgeId: developed.trace.edgeId,
        targetId: PERSON_VARIABLE_ID.curiosity,
        experienceId,
        previousValue: developed.trace.previousValuePermille,
        sourceValuePermille: developed.trace.sourceValuePermille,
        gapPermille: developed.trace.gapPermille,
        exposureStrengthPermille: developed.trace.exposureStrengthPermille,
        ageBand: developed.trace.ageBand,
        plasticityPermille: developed.trace.plasticityPermille,
        resolution: 'deterministic' as const,
        applicationProbabilityPermille: developed.trace.applicationProbabilityPermille,
        requestedDelta: developed.trace.requestedDeltaPermille,
        appliedDelta: developed.trace.appliedDeltaPermille,
        currentValue: developed.trace.currentValuePermille,
      }
      person.development.lastChange = trace
      this.state.dailyDevelopmentCounters.developmentChanges += 1
      this.state.dailyDevelopmentCounters.absoluteCuriosityChange += Math.abs(trace.appliedDelta)
      pushEvent(this.event('PERSON_VARIABLE_DEVELOPED', {
        personId: person.id,
        experienceId,
        edgeId: trace.edgeId,
        targetId: trace.targetId,
        previousValue: trace.previousValue,
        sourceValuePermille: trace.sourceValuePermille,
        gapPermille: trace.gapPermille,
        exposureStrengthPermille: trace.exposureStrengthPermille,
        ageBand: trace.ageBand,
        plasticityPermille: trace.plasticityPermille,
        applicationProbabilityPermille: trace.applicationProbabilityPermille,
        requestedDelta: trace.requestedDelta,
        appliedDelta: trace.appliedDelta,
        currentValue: trace.currentValue,
      }))
    }
  }

  private advanceAges(pushEvent: (event: SimulationEvent) => void): void {
    for (const person of this.state.people) {
      person.ageHoursIntoYear += BASE_TICK_HOURS
      if (person.ageHoursIntoYear < 8760) continue
      person.ageHoursIntoYear -= 8760
      person.ageYears += 1
      person.activityScheduleId = scheduleForAge(person.ageYears)
      pushEvent(this.event('PERSON_AGED', {
        personId: person.id,
        ageYears: person.ageYears,
      }))
    }
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
      activityLocationId: encounter.activityLocationId,
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
      activityLocationId: encounter.activityLocationId,
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
      activityLocationId: encounter.activityLocationId,
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
    validateHouseholdActivityState(this.state)
    validateCommunitySimulationState(this.state)
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
        const encounterLocation = this.activityLocationById.get(person.lastEncounter.activityLocationId)
        if (!encounterLocation || encounterLocation.cellId !== person.lastEncounter.cellId) throw new Error(`Person ${person.id} has an invalid encounter activity location`)
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

function compareIds(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0
}

function emptyCommunityCounterState(communityId: string, windowStartTick: number): CommunityDailyCounterState {
  return serializeRuntimeCommunityCounters(emptyRuntimeCommunityCounters(communityId, windowStartTick))
}

function emptyRuntimeCommunityCounters(communityId: string, windowStartTick: number): RuntimeCommunityCounters {
  return {
    communityId,
    windowStartTick,
    windowEndTick: windowStartTick + 23,
    exposedPersonIds: new Set(),
    encounterParticipantIds: new Set(),
    encounteredRelationshipIds: new Set(),
    exposedPersonHours: 0,
    commonsPersonHours: 0,
    curiosityPersonHourSum: 0,
    socializeSelections: 0,
    exploreSelections: 0,
    explorationArrivals: 0,
    mealAttempts: 0,
    failedMeals: 0,
    encounters: 0,
    positiveEncounters: 0,
    neutralEncounters: 0,
    tenseEncounters: 0,
    postEncounterDirectionalTrustPermilleSum: 0,
    postEncounterDirectionalFamiliarityPermilleSum: 0,
    postEncounterDirectionalFearPermilleSum: 0,
    foodAmountBeforeRegeneration: 0,
    foodCapacity: 0,
  }
}

function runtimeCommunityCounters(communityId: string, counters: DailyCommunityCounters): RuntimeCommunityCounters {
  return {
    communityId,
    windowStartTick: counters.windowStartTick,
    windowEndTick: counters.windowEndTick,
    exposedPersonIds: new Set(counters.exposedPersonIds),
    encounterParticipantIds: new Set(counters.encounterParticipantIds),
    encounteredRelationshipIds: new Set(counters.encounteredRelationshipIds),
    exposedPersonHours: counters.exposedPersonHours,
    commonsPersonHours: counters.commonsPersonHours,
    curiosityPersonHourSum: counters.curiosityPersonHourSum,
    socializeSelections: counters.socializeSelections,
    exploreSelections: counters.exploreSelections,
    explorationArrivals: counters.explorationArrivals,
    mealAttempts: counters.mealAttempts,
    failedMeals: counters.failedMeals,
    encounters: counters.encounters,
    positiveEncounters: counters.positiveEncounters,
    neutralEncounters: counters.neutralEncounters,
    tenseEncounters: counters.tenseEncounters,
    postEncounterDirectionalTrustPermilleSum: counters.postEncounterDirectionalTrustPermilleSum,
    postEncounterDirectionalFamiliarityPermilleSum: counters.postEncounterDirectionalFamiliarityPermilleSum,
    postEncounterDirectionalFearPermilleSum: counters.postEncounterDirectionalFearPermilleSum,
    foodAmountBeforeRegeneration: counters.foodAmountBeforeRegeneration,
    foodCapacity: counters.foodCapacity,
  }
}

function serializeRuntimeCommunityCounters(runtime: RuntimeCommunityCounters): CommunityDailyCounterState {
  return {
    communityId: runtime.communityId,
    counters: {
      windowStartTick: runtime.windowStartTick,
      windowEndTick: runtime.windowEndTick,
      exposedPersonIds: [...runtime.exposedPersonIds].sort(compareIds),
      encounterParticipantIds: [...runtime.encounterParticipantIds].sort(compareIds),
      encounteredRelationshipIds: [...runtime.encounteredRelationshipIds].sort(compareIds),
      exposedPersonHours: runtime.exposedPersonHours,
      commonsPersonHours: runtime.commonsPersonHours,
      curiosityPersonHourSum: runtime.curiosityPersonHourSum,
      socializeSelections: runtime.socializeSelections,
      exploreSelections: runtime.exploreSelections,
      explorationArrivals: runtime.explorationArrivals,
      mealAttempts: runtime.mealAttempts,
      failedMeals: runtime.failedMeals,
      encounters: runtime.encounters,
      positiveEncounters: runtime.positiveEncounters,
      neutralEncounters: runtime.neutralEncounters,
      tenseEncounters: runtime.tenseEncounters,
      postEncounterDirectionalTrustPermilleSum: runtime.postEncounterDirectionalTrustPermilleSum,
      postEncounterDirectionalFamiliarityPermilleSum: runtime.postEncounterDirectionalFamiliarityPermilleSum,
      postEncounterDirectionalFearPermilleSum: runtime.postEncounterDirectionalFearPermilleSum,
      foodAmountBeforeRegeneration: runtime.foodAmountBeforeRegeneration,
      foodCapacity: runtime.foodCapacity,
    },
  }
}
