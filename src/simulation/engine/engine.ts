import {
  BASE_TICK_HOURS,
  ACTIVITY_REGISTRY_VERSION,
  COMMUNITY_REGISTRY_VERSION,
  CONTENT_PACK_MODEL_VERSION,
  DEVELOPMENT_REGISTRY_VERSION,
  ENGINE_VERSION,
  ENVIRONMENT_MODEL_VERSION,
  LIFE_CYCLE_MODEL_VERSION,
  ECONOMY_MODEL_VERSION,
  ORGANIZATION_MODEL_VERSION,
  CULTURE_MODEL_VERSION,
  LANGUAGE_MODEL_VERSION,
  GOVERNANCE_MODEL_VERSION,
  CONFLICT_MODEL_VERSION,
  HEALTH_MODEL_VERSION,
  KNOWLEDGE_MODEL_VERSION,
  INNOVATION_MODEL_VERSION,
  INFRASTRUCTURE_MODEL_VERSION,
  HOUSEHOLD_MODEL_VERSION,
  INFLUENCE_REGISTRY_VERSION,
  VARIABLE_REGISTRY_VERSION,
  WORLD_GENERATOR_VERSION,
  type WorldCreationDraft,
  type SimulationEvent,
  type SimulationState,
  type ActionName,
  type AuthoritativeChangeSet,
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
import { advanceJourney, chooseAction, resolveAction, type ActionBaseWeight, type ActionContext, type ActionOutcome, type JourneyOutcome } from '../agents/actions'
import { generatePopulation } from '../agents/population'
import {
  ACTION_BASE_WEIGHT,
  ACTION_WEIGHT_MAXIMUM,
  ACTION_WEIGHT_MINIMUM,
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
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'
import { createContentPackRuntime, evaluateExpression, resolveContentPack, type ContentPack, type ContentPackRuntime, type ResolvedContentPack } from '../../contentPacks'
import { adjustPersonVariable, createDefaultPersonVariableValues, getPersonVariable, setPersonVariable, validatePersonVariableValues } from '../variables/storage'
import { validateCanonicalSimulationState } from '../validation/canonicalState'
import {
  accumulateParentCuriosityExposure,
  completeParentCuriosityExposureWindow,
  createParentCuriosityExposureAccumulator,
  PARENT_CURIOSITY_EXPOSURE_CHANNEL,
} from '../exposure/model'
import { applyParentCuriosityDevelopment } from '../development/apply'
import { accumulateBroaderExposure, applyBroaderDevelopment, broaderExposure, BROADER_DEVELOPMENT_DEFINITIONS, completeBroaderExposure, createBroaderDevelopmentState } from '../development/broader'
import { seasonAtTick } from '../environment/season'
import { climateConditionsAt, regeneratedFoodAmount } from '../environment/climate'
import { calculateCuriosityInheritance } from '../households/inheritance'
import { annualMortalityPermille, birthEligible, lifeStageForAge, LIFE_CYCLE_STREAM, partnershipEligible } from '../lifecycle/model'
import { createInitialMarkets, resolveFoodShares, resolveToolExchanges } from '../economy/model'
import { clearMarkets, createEconomyState, decayGoods, distributeMarketWages, initializeGoods, produceMonthlyGoods } from '../economy/stockFlow'
import { createInitialSchools } from '../organizations/model'
import { evaluateSchoolAttendance, SCHOOL_ATTENDANCE, SCHOOL_ATTENDANCE_STREAM, schoolAttendanceTrace, schoolTravelCost } from '../organizations/attendance'
import { createCulturalState, transmitCulture } from '../culture/model'
import { acquireLanguage, initialLanguage } from '../language/model'
import { createLocalGovernance, updateLegitimacy } from '../governance/model'
import { applyDispute, disputeId, resolveCommunityContentions } from '../conflict/model'
import { discoverLocalTerrain, initialKnowledge, transmitKnowledge } from '../knowledge/model'
import { evaluateHouseholdRelocation, HOUSEHOLD_RELOCATION, HOUSEHOLD_RELOCATION_STREAM, relocationTrace } from '../households/relocation'
import { advanceCohortFictionalInfections, applyAnnualCohortInfectionMortality, emptyHealthExposure, FICTIONAL_PATHOGEN_STREAM, healthStressMortalityRiskPermille, progressFictionalInfections, resolveDailyHealthStress, transmitFictionalPathogens } from '../health/model'
import { attemptPracticalExperiment, INNOVATION_STREAM } from '../innovation/model'
import { COHORT_MODEL_VERSION, advanceCohortsAnnual, advanceCohortsDaily, cohortPopulationByCell, createInitialCohorts } from '../cohorts/model'
import { materializeCohortPeople, materializationStreamName } from '../cohorts/materialization'
import { applyCohortMaterialization, planCohortMaterialization } from '../cohorts/transitions'
import { initializeSettlementScales, updateSettlementScales } from '../settlements/growth'
import { migrateCohortsBetweenSettlements, reconcileSettlementRegions, settlementMigrationTrace } from '../settlements/regional'
import { allocateInfrastructureMaintenance, createInfrastructureAssets, maintainInfrastructure } from '../infrastructure/model'
import { infrastructureAccessAcrossCells, infrastructureAccessAtCell } from '../infrastructure/access'
import { compareStableText } from '../../shared/stableOrder'
import { runSimulationTickPipeline, TICK_PHASE_MANIFEST, type SimulationPhaseOperations, type SimulationTickContext } from './phasePipeline'
export { TICK_PHASE_MANIFEST } from './phasePipeline'

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
  /** Noncanonical cache hints; authoritative execution never reads these. */
  changeSet: AuthoritativeChangeSet
  /** Noncanonical measurements scoped to this advance call. */
  diagnostics: { livingPersonIndexBuilds: number; phaseCounts: Record<string, number> }
}

export interface FidelityCommandResult { event: SimulationEvent; changeSet: AuthoritativeChangeSet }

export interface AdvanceOptions {
  /** False defers the batch clock event so a worker may yield without changing event sequencing. */
  clockEventHours?: number | false
}

/** Canonical, non-extensible order for every authoritative tick. */
export class SimulationEngine {
  private random: RandomProvider
  private readonly cellById: Map<string, SimulationState['world']['grid']['cells'][number]>
  /** Static authored-road index: avoids rebuilding the same set every tick. */
  private readonly roadCellIds: ReadonlySet<string>
  private readonly personById: Map<string, SimulationState['people'][number]>
  private readonly relationshipById: Map<string, SimulationState['relationships'][number]>
  private readonly disputeById: Map<string, SimulationState['disputes'][number]>
  private readonly householdById: Map<string, SimulationState['households'][number]>
  private readonly activityLocationById: Map<string, SimulationState['activityLocations'][number]>
  private readonly parentIdsByChildId: Map<string, readonly string[]>
  private readonly communityByCellId: Map<string, CommunitySimulationState>
  private readonly communityCountersById: Map<string, RuntimeCommunityCounters>
  private readonly schoolTravelCosts = new Map<string, number | null>()
  /** Reused for a simulation hour; lifecycle changes explicitly invalidate it. */
  private livingPersonCache: SimulationState['people'][number][] | undefined
  private livingPersonIndexBuilds = 0

  private constructor(private state: SimulationState, random: RandomProvider, private readonly contentPackRuntime: ContentPackRuntime = createContentPackRuntime(DEFAULT_PREINDUSTRIAL_PACK), private readonly migrationProvenance?: SnapshotEnvelope['migrationProvenance']) {
    this.random = random
    this.cellById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
    this.roadCellIds = new Set((state.world.roads ?? []).flatMap((road) => road.cellIds))
    this.personById = new Map(state.people.map((person) => [person.id, person]))
    this.relationshipById = new Map(state.relationships.map((relationship) => [relationship.id, relationship]))
    this.disputeById = new Map(state.disputes.map((dispute) => [dispute.id, dispute]))
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

  static create(seedOrDraft: string | WorldCreationDraft, width = 32, height = 24, contentPack: ContentPack | ResolvedContentPack = DEFAULT_PREINDUSTRIAL_PACK): SimulationEngine {
    const draft = typeof seedOrDraft === 'string' ? defaultWorldCreationRequest(seedOrDraft, width, height) : seedOrDraft
    validateWorldCreationDraftLimits(draft)
    // Terrain generation is pure for a seed, so resolve presets before starting the authoritative RNG provider.
    const preliminary = generateValley(draft.seed.trim() || 'valley-001', draft.width, draft.height, { hexRadiusMeters: draft.hexRadiusMeters, terrainBase: draft.terrainBase, terrainOverrides: draft.terrainOverrides, elevationOverrides: draft.elevationOverrides, resourceCapacityOverrides: draft.resourceCapacityOverrides })
    const creation = normalizeWorldCreationRequest(draft, preliminary.world.grid.cells)
    const creationKey = JSON.stringify(creation)
    const { world, random } = generateValley(creation.seed, creation.width, creation.height, { name: creation.name, hexRadiusMeters: creation.hexRadiusMeters, settlements: creation.settlements, roads: creation.roads, terrainBase: creation.terrainBase, terrainOverrides: creation.terrainOverrides, elevationOverrides: creation.elevationOverrides, resourceCapacityOverrides: creation.resourceCapacityOverrides, idSuffix: creationKey })
    const preserveLegacyHomePlacement = typeof seedOrDraft === 'string' || (draft.populationZones.length === 0 && draft.initialPopulationCount === 200)
    const resolvedPack = resolveContentPack(contentPack)
    const runtime = createContentPackRuntime(resolvedPack.pack)
    const generatedPopulation = generatePopulation(world.grid.cells, creation.populationZones, random, preserveLegacyHomePlacement, runtime.variables)
    const initialPathogen = [...runtime.pack.pathogens].sort((a, b) => compareStableText(a.id, b.id))[0]
    const initialPerson = [...generatedPopulation.people].sort((a, b) => compareIds(a.id, b.id))[0]
    if (initialPathogen && initialPerson) initialPerson.fictionalInfection = { version: 1, pathogenId: initialPathogen.id, phase: 'incubating', startedTick: 0, phaseEndsTick: initialPathogen.incubationHours }
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
    // Initialize retained scale from physical homes/resources before the first
    // projection. It remains independent from authored settlement markers.
    initializeSettlementScales({ settlements: world.settlements, cells: world.grid.cells, people: generatedPopulation.people })
    // A school is an authored place service; an unmarked home cell is never silently promoted into one.
    const organizations = createInitialSchools(generatedPopulation.people, world.settlements.map((settlement) => settlement.anchorCellId))
    const markets = createInitialMarkets(world.grid.cells, world.settlements)
    for (const household of generatedPopulation.households) if (household.inventory) initializeGoods(household.inventory)
    const economy = createEconomyState(markets, runtime.pack.economy.goods)
    const cohorts = createInitialCohorts(world.grid.cells, creation.populationZones)
    reconcileSettlementRegions({ settlements: world.settlements, cells: world.grid.cells, households: generatedPopulation.households, cohorts, markets, organizations, roads: world.roads ?? [], tick: 0 })
    const infrastructure = createInfrastructureAssets({ roads: world.roads ?? [], cells: world.grid.cells, settlements: world.settlements, markets, organizations, tick: 0 })
    const governance = createLocalGovernance(communities, generatedPopulation.people)
    const engine = new SimulationEngine({
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
        contentPackId: runtime.pack.manifest.id,
        contentPackVersion: runtime.pack.manifest.version,
        contentPackChecksum: resolvedPack.checksum,
        contentPackDependencies: resolvedPack.dependencies,
        contentPackModelVersion: CONTENT_PACK_MODEL_VERSION,
        variableRegistryVersion: VARIABLE_REGISTRY_VERSION,
        influenceRegistryVersion: INFLUENCE_REGISTRY_VERSION,
        householdModelVersion: HOUSEHOLD_MODEL_VERSION,
        activityRegistryVersion: ACTIVITY_REGISTRY_VERSION,
        developmentRegistryVersion: DEVELOPMENT_REGISTRY_VERSION,
        communityRegistryVersion: COMMUNITY_REGISTRY_VERSION,
        environmentModelVersion: ENVIRONMENT_MODEL_VERSION,
        lifeCycleModelVersion: LIFE_CYCLE_MODEL_VERSION,
        economyModelVersion: ECONOMY_MODEL_VERSION,
        organizationModelVersion: ORGANIZATION_MODEL_VERSION,
        cultureModelVersion: CULTURE_MODEL_VERSION,
        languageModelVersion: LANGUAGE_MODEL_VERSION,
        governanceModelVersion: GOVERNANCE_MODEL_VERSION,
        conflictModelVersion: CONFLICT_MODEL_VERSION,
        knowledgeModelVersion: KNOWLEDGE_MODEL_VERSION,
        healthModelVersion: HEALTH_MODEL_VERSION,
        innovationModelVersion: INNOVATION_MODEL_VERSION,
        infrastructureModelVersion: INFRASTRUCTURE_MODEL_VERSION,
        cohortModelVersion: COHORT_MODEL_VERSION,
      },
      world,
      people: generatedPopulation.people,
      cohorts,
      populationFidelity: { version: 1, nextTransitionSequence: 1, protectedPersonIds: [], transitions: [] },
      households: generatedPopulation.households,
      markets,
      organizations,
      infrastructure,
      economy,
      governance,
      disputes: [],
      parentChildLinks: generatedPopulation.parentChildLinks,
      activityLocations: generatedPopulation.activityLocations,
      communities,
      dailyCommunityCounters: communities.map(({ catchment }) => emptyCommunityCounterState(catchment.id, 1)),
      relationships: [],
      dailySpatialCounters: { travelCost: 0, completedMoves: 0, foodConsumed: 0, failedMeals: 0 },
      dailySocialCounters: { encounters: 0, positiveEncounters: 0, neutralEncounters: 0, tenseEncounters: 0, relationshipsFormed: 0 },
      dailyActivityCounters: { homePersonHours: 0, commonsPersonHours: 0, travelPersonHours: 0 },
      dailyDevelopmentCounters: { parentChildCoExposureSourceHours: 0, developmentExperiences: 0, developmentChanges: 0, absoluteCuriosityChange: 0, broaderDevelopmentExperiences: 0, broaderDevelopmentChanges: 0 },
      dailyLifeCycleCounters: { births: 0, deaths: 0, partnershipsFormed: 0, householdMoves: 0, lifeStageTransitions: 0 },
      dailyEconomicCounters: { productiveHours: 0, foodProduced: 0, agriculturalFoodProduced: 0, foodConsumedFromHouseholds: 0, foodShared: 0, exchangeCount: 0 },
      dailyEnvironmentalCounters: { foodRegenerated: 0 },
      randomStreams: random.snapshot(),
    }, random, runtime)
    engine.assertInvariants()
    return engine
  }

  static async restore(snapshotValue: unknown, contentPack: ContentPack | ResolvedContentPack = DEFAULT_PREINDUSTRIAL_PACK): Promise<SimulationEngine> {
    const resolvedPack = resolveContentPack(contentPack)
    const snapshot = await validateSnapshot(snapshotValue, resolvedPack)
    const state = structuredClone(snapshot.state)
    return new SimulationEngine(state, new RandomProvider(state.config.seed, state.randomStreams), createContentPackRuntime(resolvedPack.pack), snapshot.migrationProvenance)
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
    const livingPersonIndexBuildsBefore = this.livingPersonIndexBuilds
    const phaseCounts: Record<string, number> = {}
    const changeCategories = new Set<AuthoritativeChangeSet['categories'][number]>()
    const changedCellIds = new Set<string>()
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
      this.runTickPipeline({ pushEvent, statistics, changeCategories, changedCellIds, phaseCounts, invalidate: (categories, cellIds = []) => { for (const category of categories) changeCategories.add(category); for (const cellId of cellIds) changedCellIds.add(cellId) } })
    }
    // Disputes are indexed during encounter resolution.  Materialize the stable serialized
    // collection once per requested advance batch instead of rebuilding it for every encounter.
    this.state.disputes = [...this.disputeById.values()].sort((first, second) => compareStableText(first.id, second.id))
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
    return { events, statistics, changeSet: changeSetFromEvents([], changeCategories, changedCellIds), diagnostics: { livingPersonIndexBuilds: this.livingPersonIndexBuilds - livingPersonIndexBuildsBefore, phaseCounts } }
  }

  private runTickPipeline(runtime: EngineTickRuntime): void {
    const context: SimulationTickContext = {
      tick: this.state.tick + 1,
      phaseCounts: runtime.phaseCounts,
      state: this.state,
      random: this.random,
      content: this.contentPackRuntime,
      emit: runtime.pushEvent,
      record: (sample) => runtime.statistics.push(sample),
      invalidate: runtime.invalidate,
      scratch: {},
      operations: this.phaseOperations(runtime),
    }
    runSimulationTickPipeline(context)
  }

  private phaseOperations(runtime: EngineTickRuntime): SimulationPhaseOperations {
    return {
      clockAndLifecycle: () => { this.state.tick += 1; this.runClockAndLifecycle(runtime.pushEvent); runtime.invalidate(['people', 'relationships']) },
      needs: () => { if (this.livingPeople().length > 0) { this.runNeeds(); runtime.invalidate(['people']) } },
      journeys: () => { const cellIds = this.runJourneys(runtime.pushEvent); if (cellIds.length > 0) runtime.invalidate(['people', 'locations'], cellIds) },
      activitiesAndSchool: () => { this.runActivitiesAndSchool(runtime.pushEvent); if (this.livingPeople().length > 0) runtime.invalidate(['people']) },
      decisionsAndActions: (context) => { const result = this.runDecisionsAndActions(runtime.pushEvent); context.scratch.decisions = result.decisions; context.scratch.postActionActivityOccupancy = result.occupancy; if (result.decisions.length > 0) runtime.invalidate(['people']); if (result.changedCellIds.length > 0) runtime.invalidate(['locations'], result.changedCellIds) },
      encountersAndMarkets: (context) => { const encounters = this.runEncountersAndMarkets(runtime.pushEvent, context.scratch); if (encounters > 0) runtime.invalidate(['relationships', 'communities']) },
      exposureEnvironmentAndHealth: (context) => { this.runExposureEnvironmentAndHealth(runtime.pushEvent, context.scratch); runtime.invalidate(['people', 'communities']) },
      monthlyProcessing: () => { this.runMonthlyProcessing(runtime.pushEvent, runtime.changeCategories, runtime.changedCellIds); runtime.invalidate(['people', 'locations', 'communities']) },
      annualProcessing: () => { this.runAnnualProcessing(runtime.pushEvent, runtime.changeCategories, runtime.changedCellIds); runtime.invalidate(['people', 'relationships']) },
      dailyProcessing: () => { this.runDailyProcessing(runtime.pushEvent, runtime.statistics); runtime.invalidate(['people', 'communities']) },
    }
  }

  private runClockAndLifecycle(pushEvent: (event: SimulationEvent) => void): void {
    this.livingPersonCache = undefined
    if (this.advanceAges(pushEvent)) this.livingPersonCache = undefined
  }

  private runNeeds(): void {
    for (const person of this.livingPeople()) {
      adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger, HOURLY_HUNGER_INCREASE, this.contentPackRuntime.variables)
      adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.fatigue, HOURLY_FATIGUE_INCREASE, this.contentPackRuntime.variables)
      adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.socialConnection, HOURLY_SOCIAL_NEED_INCREASE, this.contentPackRuntime.variables)
    }
  }

  private runJourneys(pushEvent: (event: SimulationEvent) => void): string[] {
    const changedCellIds: string[] = []
    for (const person of this.livingPeople()) {
      const journey = advanceJourney(person, HOURLY_TRAVEL_BUDGET)
      if (!journey?.arrived) continue
      this.recordTravel(journey.travelCost)
      changedCellIds.push(journey.fromCellId, journey.targetCellId)
      if (journey.kind === 'explore') {
        this.recordCommunityExplorationArrival(journey.targetCellId)
        this.recordActivityDevelopment(person)
        this.recordKnowledgeDiscovery(person, pushEvent)
      }
      pushEvent(this.journeyEvent(person.id, journey))
    }
    return changedCellIds
  }

  private runActivitiesAndSchool(pushEvent: (event: SimulationEvent) => void): void {
    this.resolveActivities(pushEvent)
    this.resolveSchoolAttendance(pushEvent)
  }


  private runDecisionsAndActions(pushEvent: (event: SimulationEvent) => void): { decisions: { person: SimulationState['people'][number]; decision: ReturnType<typeof chooseAction> }[]; occupancy: ReadonlyMap<string, readonly string[]>; changedCellIds: string[] } {
    const occupantsByCell = this.buildOccupancy(true)
    const occupantsByActivityLocation = this.buildActivityOccupancy()
    const context: ActionContext = { tick: this.state.tick, movementCostMultiplierPermille: seasonAtTick(this.state.tick).movementCostMultiplierPermille, roadCellIds: this.roadCellIds, cellById: this.cellById, occupantsByCell, occupantsByActivityLocation, communityByCellId: this.communityByCellId, householdById: this.householdById, influenceRegistry: this.contentPackRuntime.influences, variableRegistry: this.contentPackRuntime.variables, baseWeightFor: (action, person) => this.packActionBaseWeight(action, person.variables) }
    const actionRng = this.random.stream('actions')
    const decisions = this.livingPeople().filter((person) => !person.journey && person.schoolAttendance === undefined).map((person) => ({ person, decision: chooseAction(person, context, actionRng) }))
    const changedCellIds: string[] = []
    for (const { person, decision } of decisions) {
      const outcome = resolveAction(person, decision, context)
      if (outcome.arrived) this.recordTravel(outcome.travelCost)
      if (outcome.arrived) changedCellIds.push(outcome.fromCellId, outcome.targetCellId ?? outcome.fromCellId)
      this.state.dailySpatialCounters.foodConsumed += outcome.foodConsumed
      this.economicCounters().foodConsumedFromHouseholds += outcome.foodConsumed
      this.economicCounters().foodProduced += outcome.foodProduced
      this.economicCounters().agriculturalFoodProduced += outcome.agriculturalFoodProduced
      if (decision.action === 'work') {
        const household = this.householdById.get(person.householdId)
        const eligible = household?.inventory !== undefined && household.inventory.tools > 0 && (person.knowledge?.['knowledge.foraging'] ?? 0) >= 500 && !person.techniques?.some((candidate) => candidate.id === 'technique.foraging.efficient-harvest')
        const technique = eligible && household?.inventory ? attemptPracticalExperiment(person, household.inventory, this.state.tick, this.random.stream(INNOVATION_STREAM)) : undefined
        if (technique) pushEvent(this.event('PERSON_KNOWLEDGE_DISCOVERED', { personId: person.id, techniqueId: technique.id, knowledgePermille: technique.knowledgePermille, toolCost: technique.toolCost, successRollPermille: technique.successRollPermille }))
        this.economicCounters().productiveHours += 1
      }
      if (outcome.failedMeal) this.state.dailySpatialCounters.failedMeals += 1
      this.recordCommunityAction(decision.action, outcome)
      if (decision.action === 'explore' && outcome.arrived) {
        this.recordActivityDevelopment(person)
        this.recordKnowledgeDiscovery(person, pushEvent)
        if (decision.targetCellId) this.recordCommunityExplorationArrival(decision.targetCellId)
      }
      pushEvent(this.actionEvent(person.id, decision, outcome))
    }
    this.resolveActivities(pushEvent)
    return { decisions, occupancy: this.buildActivityOccupancy(), changedCellIds }
  }

  private runEncountersAndMarkets(pushEvent: (event: SimulationEvent) => void, scratch: SimulationTickContext['scratch']): number {
    if (!scratch.decisions || !scratch.postActionActivityOccupancy) throw new Error('Encounter phase requires decision phase output')
    const occupancy = scratch.postActionActivityOccupancy
    const socializerIds = new Set(scratch.decisions.filter(({ decision }) => decision.action === 'socialize').map(({ person }) => person.id))
    const encounters = resolveEncounters({ peopleById: this.personById, occupantsByActivityLocation: occupancy, activityLocationsById: this.activityLocationById, socializerIds, relationshipsById: this.relationshipById }, this.random.stream('encounters'))
    for (const encounter of encounters) {
      const formed = this.applyEncounter(encounter, pushEvent)
      this.recordCommunityEncounter(encounter)
      if (formed) pushEvent(this.relationshipFormedEvent(encounter))
      pushEvent(this.encounterEvent(encounter))
    }
    if (encounters.length > 0) this.state.relationships = [...this.relationshipById.values()].sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0)
    this.resolveMarketExchanges(occupancy, pushEvent)
    return encounters.length
  }

  private runExposureEnvironmentAndHealth(pushEvent: (event: SimulationEvent) => void, scratch: SimulationTickContext['scratch']): void {
    if (!scratch.postActionActivityOccupancy) throw new Error('Exposure phase requires decision phase output')
    this.recordActivityPersonHours()
    this.recordEnvironmentalExposure()
    this.recordHealthExposure(scratch.postActionActivityOccupancy)
    for (const trace of transmitFictionalPathogens({ peopleById: this.personById, occupantsByActivity: scratch.postActionActivityOccupancy, pathogens: this.contentPackRuntime.pack.pathogens, tick: this.state.tick, nextPermille: () => this.random.stream(FICTIONAL_PATHOGEN_STREAM).nextInt(1000) })) {
      pushEvent(this.event('FICTIONAL_INFECTION_ACQUIRED', { personId: this.state.people.find((person) => person.lastInfectionTrace === trace)?.id ?? null, pathogenId: trace.pathogenId, sourcePersonId: trace.sourcePersonId ?? null, probabilityPermille: trace.probabilityPermille ?? 0, randomRollPermille: trace.randomRollPermille ?? 0 }))
    }
    this.recordCommunityPersonHours()
    this.recordCommunityDevelopmentExposure()
    this.accumulateDevelopmentExposure()
  }

  private runMonthlyProcessing(pushEvent: (event: SimulationEvent) => void, changeCategories: Set<AuthoritativeChangeSet['categories'][number]>, changedCellIds: Set<string>): void {
    for (const production of produceMonthlyGoods({ economy: this.state.economy, households: this.state.households, peopleById: this.personById, recipes: this.contentPackRuntime.pack.economy.recipes, tick: this.state.tick })) pushEvent(this.event('PERSON_WORKED', { householdId: production.householdId, recipeId: production.recipeId, laborHours: production.laborHours, outputUnits: Object.values(production.outputs).reduce((sum, value) => sum + value, 0) }))
    for (const trade of clearMarkets({ economy: this.state.economy, households: this.state.households, markets: this.state.markets, cellsById: this.cellById, tick: this.state.tick })) { this.economicCounters().exchangeCount += 1; pushEvent(this.event('HOUSEHOLDS_EXCHANGED_TOOLS', { marketId: trade.marketId, sellerHouseholdId: trade.sellerHouseholdId, buyerHouseholdId: trade.buyerHouseholdId, goodId: trade.goodId, quantity: trade.quantity, unitPriceUnits: trade.unitPriceUnits, transportCostUnits: trade.transportCostUnits, taxUnits: trade.taxUnits })) }
    for (const wage of distributeMarketWages({ economy: this.state.economy, households: this.state.households, peopleById: this.personById, tick: this.state.tick })) pushEvent(this.event('PERSON_WORKED', { householdId: wage.householdId, marketId: wage.marketId, wageUnits: wage.wageUnits, workerCount: wage.workerCount }))
    for (const allocation of allocateInfrastructureMaintenance(this.state.infrastructure, this.state.households, this.state.world.settlements)) pushEvent(this.event('INFRASTRUCTURE_UPDATED', { assetId: allocation.assetId, householdId: allocation.householdId, kind: 'maintenance-funded', units: allocation.units }))
    for (const asset of maintainInfrastructure(this.state.infrastructure, this.state.tick)) { const trace = asset.lastTrace; if (trace) pushEvent(this.event('INFRASTRUCTURE_UPDATED', { assetId: asset.id, kind: trace.kind, capacity: trace.capacity, conditionPermille: asset.conditionPermille, disruptionPermille: asset.disruptionPermille, reason: trace.reason })) }
    this.processDevelopment(pushEvent)
    this.processBroaderDevelopment(pushEvent)
    this.resolveMonthlyHouseholdRelocations(pushEvent)
    for (const transition of updateSettlementScales({ settlements: this.state.world.settlements, cells: this.state.world.grid.cells, people: this.state.people })) pushEvent(this.event('SETTLEMENT_SCALE_CHANGED', { settlementId: transition.settlementId, previousScale: transition.previousScale, nextScale: transition.nextScale, population: transition.evidence.population, densityPerHomeCell: Math.round(transition.evidence.densityPerHomeCell * 1000), resourceUnitsPerResident: Math.round(transition.evidence.resourceUnitsPerResident * 1000), accessPermille: transition.evidence.accessPermille }))
    const reconciliationInput = () => ({ settlements: this.state.world.settlements, cells: this.state.world.grid.cells, households: this.state.households, cohorts: this.state.cohorts, markets: this.state.markets, organizations: this.state.organizations, roads: this.state.world.roads ?? [], infrastructure: this.state.infrastructure, tick: this.state.tick })
    for (const transition of reconcileSettlementRegions(reconciliationInput())) pushEvent(this.event('SETTLEMENT_REGIONAL_TRANSITION', { settlementId: transition.settlementId, previousStatus: transition.previousStatus, nextStatus: transition.nextStatus, kind: transition.kind, reason: transition.reason }))
    for (const trace of migrateCohortsBetweenSettlements(this.state.cohorts, this.state.world.settlements, this.state.world.grid.cells, this.state.tick)) { changeCategories.add('people'); changedCellIds.add(trace.sourceCellId); changedCellIds.add(trace.destinationCellId); pushEvent(this.event('SETTLEMENT_REGIONAL_TRANSITION', { kind: 'cohort-migration', sourceSettlementId: trace.sourceSettlementId, destinationSettlementId: trace.destinationSettlementId, populationCount: trace.populationCount, reason: trace.reason })) }
    // The regional ledger must describe cohort allocations after migration.
    for (const transition of reconcileSettlementRegions(reconciliationInput())) pushEvent(this.event('SETTLEMENT_REGIONAL_TRANSITION', { settlementId: transition.settlementId, previousStatus: transition.previousStatus, nextStatus: transition.nextStatus, kind: transition.kind, reason: transition.reason }))
  }

  private runAnnualProcessing(pushEvent: (event: SimulationEvent) => void, changeCategories: Set<AuthoritativeChangeSet['categories'][number]>, changedCellIds: Set<string>): void {
    const populationBefore = cohortPopulationByCell(this.state.cohorts)
    this.resolveAnnualLifeCycle(pushEvent)
    advanceCohortsAnnual(this.state.cohorts)
    for (const trace of applyAnnualCohortInfectionMortality(this.state.cohorts, this.contentPackRuntime.pack.pathogens, this.state.tick)) pushEvent(this.event('COHORT_OUTBREAK_UPDATED', { pathogenId: trace.pathogenId, mortalityCount: trace.mortalityCount }))
    const populationAfter = cohortPopulationByCell(this.state.cohorts)
    let cohortPopulationChanged = false
    for (const cellId of new Set([...populationBefore.keys(), ...populationAfter.keys()])) if ((populationBefore.get(cellId) ?? 0) !== (populationAfter.get(cellId) ?? 0)) { changedCellIds.add(cellId); cohortPopulationChanged = true }
    if (cohortPopulationChanged) changeCategories.add('people')
  }

  private runDailyProcessing(pushEvent: (event: SimulationEvent) => void, statistics: StatisticSample[]): void {
    decayGoods(this.state.households, this.contentPackRuntime.pack.economy.goods)
    this.resolveDailyHealthStress(pushEvent)
    for (const trace of advanceCohortFictionalInfections(this.state.cohorts, this.contentPackRuntime.pack.pathogens, this.state.tick)) pushEvent(this.event('COHORT_OUTBREAK_UPDATED', { pathogenId: trace.pathogenId, susceptibleCount: trace.susceptibleCount, newIncubatingCount: trace.newIncubatingCount, becameInfectiousCount: trace.becameInfectiousCount, recoveredCount: trace.recoveredCount }))
    this.resolveDailyFoodSharing(pushEvent)
    this.aggregateCommunities(pushEvent)
    for (const governance of this.state.governance) { const community = this.state.communities.find((value) => value.catchment.id === governance.communityId); if (community) updateLegitimacy(governance, community, this.state.tick, infrastructureAccessAcrossCells(this.state.infrastructure, community.catchment.cellIds).servicePermille) }
    for (const contention of resolveCommunityContentions(this.disputeById.values(), new Map(this.state.governance.map((governance) => [governance.communityId, governance.legitimacy])))) pushEvent(this.event('COMMUNITY_CONTENTION_RESOLVED', { ...contention }))
    this.regenerateFood()
    advanceCohortsDaily(this.state.cohorts, this.state.world.grid.cells)
    statistics.push(...this.sampleDailyStatistics())
    this.decayRelationshipFrequencies()
    this.state.dailySpatialCounters = { travelCost: 0, completedMoves: 0, foodConsumed: 0, failedMeals: 0 }
    this.state.dailySocialCounters = { encounters: 0, positiveEncounters: 0, neutralEncounters: 0, tenseEncounters: 0, relationshipsFormed: 0 }
    this.state.dailyActivityCounters = { homePersonHours: 0, commonsPersonHours: 0, travelPersonHours: 0 }
    this.state.dailyDevelopmentCounters = { parentChildCoExposureSourceHours: 0, developmentExperiences: 0, developmentChanges: 0, absoluteCuriosityChange: 0, broaderDevelopmentExperiences: 0, broaderDevelopmentChanges: 0 }
    this.state.dailyLifeCycleCounters = { births: 0, deaths: 0, partnershipsFormed: 0, householdMoves: 0, lifeStageTransitions: 0 }
    this.state.dailyEconomicCounters = { productiveHours: 0, foodProduced: 0, agriculturalFoodProduced: 0, foodConsumedFromHouseholds: 0, foodShared: 0, exchangeCount: 0 }
    this.state.dailyEnvironmentalCounters = { foodRegenerated: 0 }
    this.resetCommunityCounters(this.state.tick + 1)
  }

  /** Formula evaluation is deliberately owned by the engine: declared streams
   * are restored with the run and cannot observe ambient process state. */
  private packActionBaseWeight(action: ActionName, variables: Readonly<Record<string, number>>): ActionBaseWeight {
    const fallback = ACTION_BASE_WEIGHT[action]
    const formula = this.contentPackRuntime.pack.formulas?.[`decision.${action}.base`]
    if (!formula) return { value: fallback, factor: 'base' }
    const value = evaluateExpression(formula, variables, {
      nextPermille: (stream) => this.random.stream(`content-pack.${this.contentPackRuntime.pack.manifest.id}.${stream}`).nextInt(1000),
    })
    if (!Number.isSafeInteger(value) || value < ACTION_WEIGHT_MINIMUM || value > ACTION_WEIGHT_MAXIMUM) {
      throw new Error(`Content formula decision.${action}.base must resolve to an integer action weight`)
    }
    return { value, factor: `content formula decision.${action}.base` }
  }

  completeAdvanceBatch(hours: number): SimulationEvent {
    if (!Number.isSafeInteger(hours) || hours < 1) throw new RangeError('Completed batch hours must be a positive safe integer')
    return this.event('CLOCK_ADVANCED', { hours, currentTick: this.state.tick })
  }

  /** Explicit fidelity command. It is independent of the viewport and consumes
   * no ambient timing; retained evidence makes the resulting people auditable. */
  materializeCohort(cohortId: string, requestedPopulationCount: number): FidelityCommandResult {
    const cohort = this.state.cohorts.find((candidate) => candidate.id === cohortId)
    if (!cohort) throw new Error(`Unknown cohort: ${cohortId}`)
    const plan = planCohortMaterialization(cohort, requestedPopulationCount)
    if (plan.status !== 'ready') throw new Error(`Cohort ${cohortId} cannot materialize: ${plan.status}`)
    const sourceZone = this.state.config.worldCreation.populationZones.find((zone) => zone.id === cohort.sourceZoneId)
    if (!sourceZone) throw new Error(`Cohort ${cohortId} has no source zone`)
    const sequence = this.state.populationFidelity.nextTransitionSequence
    const generated = materializeCohortPeople({ cohortId, transitionSequence: sequence, seed: this.state.config.seed, cells: this.state.world.grid.cells, sourceZone, populationCount: plan.materializablePopulationCount })
    const allIds = new Set(this.state.people.map((person) => person.id))
    if (generated.people.some((person) => allIds.has(person.id))) throw new Error(`Cohort ${cohortId} generated a duplicate person ID`)
    this.state.cohorts = this.state.cohorts.map((candidate) => candidate.id === cohortId ? applyCohortMaterialization(candidate, plan) : candidate)
    this.state.people = [...this.state.people, ...generated.people].sort((first, second) => compareIds(first.id, second.id))
    this.state.households = [...this.state.households, ...generated.households].sort((first, second) => compareIds(first.id, second.id))
    this.state.parentChildLinks = [...this.state.parentChildLinks, ...generated.parentChildLinks].sort((first, second) => compareIds(first.id, second.id))
    this.state.activityLocations = [...this.state.activityLocations, ...generated.activityLocations].sort((first, second) => compareIds(first.id, second.id))
    for (const person of generated.people) this.personById.set(person.id, person)
    for (const household of generated.households) this.householdById.set(household.id, household)
    for (const location of generated.activityLocations) this.activityLocationById.set(location.id, location)
    for (const link of generated.parentChildLinks) this.parentIdsByChildId.set(link.childId, [link.parentId, ...(this.parentIdsByChildId.get(link.childId) ?? [])].sort(compareIds))
    const transitionId = `fidelity:${String(sequence).padStart(8, '0')}`
    const stream = materializationStreamName(cohortId, sequence)
    this.state.populationFidelity.transitions.push({ version: 1, id: transitionId, tick: this.state.tick, kind: 'materialized', cohortId, personIds: generated.people.map((person) => person.id), protectedPersonIds: [], populationCount: generated.people.length, rngStream: stream })
    this.state.populationFidelity.nextTransitionSequence += 1
    this.livingPersonCache = undefined
    this.assertInvariants()
    return this.fidelityEvent('COHORT_MATERIALIZED', { cohortId, transitionId, populationCount: generated.people.length, residualPopulationCount: plan.residualPopulationCount }, [
      ...generated.people.map((person) => person.locationCellId),
      ...generated.households.map((household) => household.homeCellId),
      ...generated.activityLocations.map((location) => location.cellId),
    ])
  }

  /** Protection is authoritative conversion policy, never a UI-only hook. */
  protectDetailedPeople(personIds: readonly string[]): void {
    const valid = new Set(this.state.people.map((person) => person.id))
    const normalized = [...new Set(personIds)].sort(compareIds)
    if (normalized.some((id) => !valid.has(id))) throw new Error('Protected person does not exist')
    this.state.populationFidelity.protectedPersonIds = normalized
    this.assertInvariants()
  }

  dematerializePeople(personIds: readonly string[]): FidelityCommandResult {
    const selected = [...new Set(personIds)].sort(compareIds)
    if (selected.length === 0) throw new RangeError('Dematerialization requires at least one person')
    const protectedIds = new Set(this.state.populationFidelity.protectedPersonIds)
    if (selected.some((id) => protectedIds.has(id))) throw new Error('Protected people cannot be dematerialized')
    const latestMaterialization = new Map<string, string>()
    for (const transition of this.state.populationFidelity.transitions) if (transition.kind === 'materialized') for (const id of transition.personIds) latestMaterialization.set(id, transition.cohortId)
    const selectedPeople = selected.map((id) => this.personById.get(id))
    if (selectedPeople.some((person) => !person || !latestMaterialization.has(person.id))) throw new Error('Only materialized people can be dematerialized')
    const cohortIds = new Set(selected.map((id) => latestMaterialization.get(id)))
    if (cohortIds.size !== 1) throw new Error('Dematerialization must select one cohort at a time')
    const cohortId = [...cohortIds][0] as string
    const selectedSet = new Set(selected)
    if (this.state.relationships.some((relationship) => selectedSet.has(relationship.personAId) || selectedSet.has(relationship.personBId)) || this.state.parentChildLinks.some((link) => selectedSet.has(link.parentId) !== selectedSet.has(link.childId))) throw new Error('People with retained relationship or split family history cannot be dematerialized')
    const selectedHouseholds = new Set(selectedPeople.map((person) => person!.householdId))
    if (this.state.households.some((household) => selectedHouseholds.has(household.id) && household.memberIds.some((id) => !selectedSet.has(id)))) throw new Error('Dematerialization must retain whole households')
    const cohort = this.state.cohorts.find((candidate) => candidate.id === cohortId)
    if (!cohort) throw new Error(`Unknown cohort: ${cohortId}`)
    const byCell = new Map(cohort.cellAllocations.map((allocation) => [allocation.cellId, allocation.populationCount]))
    for (const person of selectedPeople) byCell.set(person!.homeCellId, (byCell.get(person!.homeCellId) ?? 0) + 1)
    const populationCount = cohort.populationCount + selected.length
    const children = cohort.ageBands.children + selectedPeople.filter((person) => person!.ageYears < 16).length
    const elders = cohort.ageBands.elders + selectedPeople.filter((person) => person!.ageYears >= 65).length
    this.state.cohorts = this.state.cohorts.map((candidate) => candidate.id !== cohortId ? candidate : { ...candidate, populationCount, householdCount: Math.ceil(populationCount / 3), cellAllocations: [...byCell.entries()].map(([cellId, populationCount]) => ({ cellId, populationCount })).sort((first, second) => compareIds(first.cellId, second.cellId)), ageBands: { children, elders, adults: populationCount - children - elders } })
    this.state.people = this.state.people.filter((person) => !selectedSet.has(person.id))
    this.state.households = this.state.households.filter((household) => !selectedHouseholds.has(household.id))
    this.state.parentChildLinks = this.state.parentChildLinks.filter((link) => !selectedSet.has(link.parentId))
    this.state.activityLocations = this.state.activityLocations.filter((location) => !selectedHouseholds.has(location.householdId ?? ''))
    for (const id of selected) this.personById.delete(id)
    for (const id of selectedHouseholds) { const household = this.householdById.get(id); if (household) this.activityLocationById.delete(household.homeActivityLocationId); this.householdById.delete(id) }
    for (const id of selected) this.parentIdsByChildId.delete(id)
    const sequence = this.state.populationFidelity.nextTransitionSequence++
    const transitionId = `fidelity:${String(sequence).padStart(8, '0')}`
    this.state.populationFidelity.transitions.push({ version: 1, id: transitionId, tick: this.state.tick, kind: 'dematerialized', cohortId, personIds: selected, protectedPersonIds: [...protectedIds].sort(compareIds), populationCount: selected.length, rngStream: 'cohort.dematerialization.none' })
    this.livingPersonCache = undefined
    this.assertInvariants()
    return this.fidelityEvent('PEOPLE_DEMATERIALIZED', { cohortId, transitionId, populationCount: selected.length, residualPopulationCount: populationCount }, selectedPeople.flatMap((person) => person ? [person.locationCellId, person.homeCellId] : []))
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
      cohorts: this.state.cohorts,
      populationFidelity: this.state.populationFidelity,
      households: this.state.households,
      markets: this.state.markets,
      economy: this.state.economy,
      organizations: this.state.organizations,
      infrastructure: this.state.infrastructure,
      governance: this.state.governance,
      disputes: this.state.disputes,
      parentChildLinks: this.state.parentChildLinks,
      activityLocations: this.state.activityLocations,
      communities: this.state.communities,
      relationships: this.state.relationships,
      variableDefinitions: this.contentPackRuntime.variableDefinitions,
      communityVariableDefinitions: COMMUNITY_VARIABLE_DEFINITIONS,
      communityFeedbackDefinitions: COMMUNITY_FEEDBACK_DEFINITIONS,
      digest,
    }
  }

  async snapshot(): Promise<SnapshotEnvelope> {
    this.state.randomStreams = this.random.snapshot()
    this.syncCommunityCounterState()
    this.assertInvariants()
    const snapshot = await createSnapshot(this.state)
    return this.migrationProvenance === undefined ? snapshot : { ...snapshot, migrationProvenance: structuredClone(this.migrationProvenance) }
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

  private fidelityEvent(type: 'COHORT_MATERIALIZED' | 'PEOPLE_DEMATERIALIZED', payload: SimulationEvent['payload'], cellIds: readonly string[]): FidelityCommandResult {
    const event = this.event(type, payload)
    return { event, changeSet: changeSetFromEvents([event], [], cellIds) }
  }

  /** Non-authoritative instrumentation for scale benchmarks and diagnostics. */
  performanceDiagnostics(): Readonly<{ livingPersonIndexBuilds: number }> {
    return { livingPersonIndexBuilds: this.livingPersonIndexBuilds }
  }

  private sampleDailyStatistics(): StatisticSample[] {
    const cells = this.state.world.grid.cells
    const livingPeople = this.livingPeople()
    const detailedPopulation = livingPeople.length
    const cohortPopulation = this.state.cohorts.reduce((sum, cohort) => sum + cohort.populationCount, 0)
    const population = detailedPopulation + cohortPopulation
    const relationshipCount = this.state.relationships.length
    const possibleRelationships = detailedPopulation > 1 ? detailedPopulation * (detailedPopulation - 1) / 2 : 0
    const averageFamiliarity = relationshipCount > 0
      ? Math.round(this.state.relationships.reduce((sum, relationship) => sum + relationship.familiarity, 0) / relationshipCount)
      : 0
    const base = { runId: this.state.runId, tick: this.state.tick, metricVersion: 1 as const, scope: 'world' as const }
    const worldSamples: StatisticSample[] = [
      { ...base, metricId: 'world.cellCount', value: cells.length },
      { ...base, metricId: 'world.habitableCells', value: cells.filter((cell) => cell.habitability > 0).length },
      { ...base, metricId: 'engine.simulatedDays', value: this.state.tick / 24 },
      { ...base, metricId: 'population.count', value: this.state.people.length + this.state.cohorts.reduce((sum, cohort) => sum + cohort.populationCount, 0) },
      { ...base, metricId: 'population.aliveCount', value: population },
      { ...base, metricId: 'population.averageHunger', value: detailedPopulation === 0 ? 0 : Math.round(livingPeople.reduce((sum, person) => sum + getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger), 0) / detailedPopulation) },
      { ...base, metricId: 'lifecycle.births', value: this.state.dailyLifeCycleCounters.births },
      { ...base, metricId: 'lifecycle.deaths', value: this.state.dailyLifeCycleCounters.deaths },
      { ...base, metricId: 'lifecycle.partnershipsFormed', value: this.state.dailyLifeCycleCounters.partnershipsFormed },
      { ...base, metricId: 'spatial.occupiedCells', value: this.buildOccupancy().size },
      { ...base, metricId: 'spatial.averageTravelCost', value: detailedPopulation === 0 ? 0 : Math.round(this.state.dailySpatialCounters.travelCost / detailedPopulation) },
      { ...base, metricId: 'resources.totalFood', value: cells.reduce((sum, cell) => sum + cell.foodAmount, 0) },
      { ...base, metricId: 'resources.foodRegenerated', value: this.environmentalCounters().foodRegenerated },
      { ...base, metricId: 'resources.foodConsumed', value: this.state.dailySpatialCounters.foodConsumed },
      { ...base, metricId: 'resources.failedMeals', value: this.state.dailySpatialCounters.failedMeals },
      { ...base, metricId: 'economy.householdFood', value: this.state.households.reduce((sum, household) => sum + (household.inventory?.food ?? 0), 0) },
      { ...base, metricId: 'economy.productiveHours', value: this.economicCounters().productiveHours },
      { ...base, metricId: 'economy.foodProduced', value: this.economicCounters().foodProduced },
      { ...base, metricId: 'economy.agriculturalFoodProduced', value: this.economicCounters().agriculturalFoodProduced },
      { ...base, metricId: 'economy.foodShared', value: this.economicCounters().foodShared },
      { ...base, metricId: 'economy.exchangeCount', value: this.economicCounters().exchangeCount },
      { ...base, metricId: 'social.encounters', value: this.state.dailySocialCounters.encounters },
      { ...base, metricId: 'social.encountersPer1000People', value: detailedPopulation > 0 ? Math.round(this.state.dailySocialCounters.encounters * 1000 / detailedPopulation) : 0 },
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
      { ...base, metricId: 'development.broaderExperiences', value: this.state.dailyDevelopmentCounters.broaderDevelopmentExperiences },
      { ...base, metricId: 'development.broaderChanges', value: this.state.dailyDevelopmentCounters.broaderDevelopmentChanges },
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
    const populationByCellId = new Map<string, number>()
    for (const person of this.livingPeople()) populationByCellId.set(person.locationCellId, (populationByCellId.get(person.locationCellId) ?? 0) + 1)
    for (const cohort of this.state.cohorts) for (const allocation of cohort.cellAllocations) populationByCellId.set(allocation.cellId, (populationByCellId.get(allocation.cellId) ?? 0) + allocation.populationCount)
    for (const cell of this.state.world.grid.cells) {
      const prior = cell.foodAmount
      const localPeople = populationByCellId.get(cell.id) ?? 0
      const humanPressurePermille = cell.resourceCapacity === 0 ? (localPeople === 0 ? 0 : 1000) : Math.min(1000, Math.floor(localPeople * 1000 / cell.resourceCapacity))
      const ecologicalProductivityPermille = cell.terrain === 'water' ? 0 : cell.terrain === 'hill' ? 780 : 1000
      const humanFeedbackPermille = Math.max(500, 1000 - Math.floor(humanPressurePermille / 2))
      const regeneration = Math.floor(regeneratedFoodAmount(cell, this.state.tick) * ecologicalProductivityPermille * humanFeedbackPermille / 1_000_000)
      cell.foodAmount = Math.min(cell.resourceCapacity, cell.foodAmount + regeneration)
      this.environmentalCounters().foodRegenerated += cell.foodAmount - prior
    }
  }

  /** Records environmental conditions from each person's actual current cell. */
  private recordEnvironmentalExposure(): void {
    const season = seasonAtTick(this.state.tick)
    for (const person of this.livingPeople()) {
      const cell = this.cellById.get(person.locationCellId)
      if (!cell) throw new Error(`Person ${person.id} occupies a missing exposure cell`)
      const exposure = person.environmentalExposure ?? (person.environmentalExposure = { observedHours: 0, foodAccessibleHours: 0, difficultTerrainHours: 0, thermalLoadPermilleHours: 0, waterAvailabilityPermilleHours: 0 })
      exposure.observedHours += 1
      if (cell.foodAmount > 0) exposure.foodAccessibleHours += 1
      if (cell.movementCost > 1000) exposure.difficultTerrainHours += 1
      exposure.thermalLoadPermilleHours += season.thermalExposurePermille
      exposure.waterAvailabilityPermilleHours += climateConditionsAt(cell, this.state.tick).waterAvailabilityPermille
    }
  }

  private recordHealthExposure(occupantsByActivity: ReadonlyMap<string, readonly string[]>): void {
    const occupancy = this.buildOccupancy(true)
    for (const person of this.livingPeople()) {
      const cell = this.cellById.get(person.locationCellId)
      if (!cell) throw new Error(`Person ${person.id} occupies a missing health-exposure cell`)
      const exposure = person.healthExposure ?? (person.healthExposure = emptyHealthExposure())
      const peopleHere = occupancy.get(cell.id)?.length ?? 1
      const activityPeople = person.currentActivity.locationId === null ? 1 : occupantsByActivity.get(person.currentActivity.locationId)?.length ?? 1
      exposure.observedHours += 1
      exposure.crowdingPersonHours += peopleHere
      exposure.coPresenceHours += Math.max(0, activityPeople - 1)
      exposure.waterAvailabilityPermilleHours += climateConditionsAt(cell, this.state.tick).waterAvailabilityPermille
    }
  }

  private resolveDailyHealthStress(pushEvent: (event: SimulationEvent) => void): void {
    for (const trace of progressFictionalInfections(this.livingPeople(), this.contentPackRuntime.pack.pathogens, this.state.tick)) pushEvent(this.event('FICTIONAL_INFECTION_PROGRESS', { pathogenId: trace.pathogenId, kind: trace.kind, sourcePersonId: trace.sourcePersonId ?? null }))
    const pathogens = new Map(this.contentPackRuntime.pack.pathogens.map((pathogen) => [pathogen.id, pathogen]))
    for (const person of this.livingPeople()) {
      const infection = person.fictionalInfection
      const household = this.householdById.get(person.householdId)
      const householdCareCapacity = household?.memberIds.filter((id) => id !== person.id && this.personById.get(id)?.lifeStatus !== 'dead' && !this.personById.get(id)?.fictionalInfection).length ?? 0
      const careCapacityCount = householdCareCapacity + (infrastructureAccessAtCell(this.state.infrastructure, person.locationCellId).servicePermille >= 500 ? 1 : 0)
      const selfIsolating = infection?.phase === 'infectious' && careCapacityCount === 0
      const stressReductionPermille = infection?.phase === 'immune' || !infection ? 0 : Math.min(30, careCapacityCount * 15)
      const displacementPressurePermille = infection?.phase === 'infectious' ? 250 : infection?.phase === 'incubating' ? 100 : 0
      if (infection) person.lastHealthIntervention = { tick: this.state.tick, kind: selfIsolating ? 'self-isolation' : 'household-care', careCapacityCount, stressReductionPermille, displacementPressurePermille }
      const infectionDelta = infection?.phase === 'immune' ? 0 : Math.max(0, (pathogens.get(infection?.pathogenId ?? '')?.dailyHealthStressPermille ?? 0) - stressReductionPermille)
      resolveDailyHealthStress(person, this.state.tick, infectionDelta)
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
    for (const person of this.livingPeople()) {
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
    for (const person of this.livingPeople()) {
      if (excludeTravelers && person.journey) continue
      const occupants = occupancy.get(person.locationCellId)
      if (occupants) occupants.push(person.id)
      else occupancy.set(person.locationCellId, [person.id])
    }
    return occupancy
  }

  private buildActivityOccupancy(): Map<string, string[]> {
    const occupancy = new Map<string, string[]>()
    for (const person of this.livingPeople()) {
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
    for (const person of this.livingPeople()) {
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

  /** Resolves a bounded, place-based school service window; no settlement membership is consulted. */
  private resolveSchoolAttendance(pushEvent: (event: SimulationEvent) => void): void {
    for (const person of this.livingPeople()) {
      if (!person.schoolAttendance || this.state.tick < person.schoolAttendance.returnTick) continue
      const household = this.householdById.get(person.householdId)
      if (!household) throw new Error(`School attendee ${person.id} belongs to a missing household`)
      person.locationCellId = household.homeCellId
      person.currentActivity = { kind: 'home', locationId: household.homeActivityLocationId, sinceTick: this.state.tick }
      person.schoolAttendance = undefined
    }
    if (this.state.tick % 24 !== SCHOOL_ATTENDANCE.startHour) return
    if (this.state.organizations.length === 0) return
    const roadCellIds = new Set((this.state.world.roads ?? []).flatMap((road) => road.cellIds))
    const stream = this.random.stream(SCHOOL_ATTENDANCE_STREAM)
    for (const school of [...this.state.organizations].sort((first, second) => compareIds(first.id, second.id))) {
      let occupiedSeats = 0
      const learners = school.members.map((member) => this.personById.get(member.personId))
        .filter((person): person is SimulationState['people'][number] => person !== undefined && person.lifeStatus !== 'dead')
        .sort((first, second) => compareIds(first.id, second.id))
      for (const person of learners) {
        const roll = stream.nextInt(1000)
        const household = this.householdById.get(person.householdId)
        if (person.journey) {
          person.lastSchoolAttendance = { tick: this.state.tick, schoolId: school.id, schoolCellId: school.locationCellId, travelCost: null, householdCapacityPermille: 0, curiosityPermille: getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity), persistencePermille: getPersonVariable(person.variables, PERSON_VARIABLE_ID.persistence), probabilityPermille: 0, randomRollPermille: roll, attended: false, reason: 'traveling' }
          pushEvent(this.event('PERSON_MISSED_SCHOOL', { personId: person.id, schoolId: school.id, reason: 'traveling', randomRollPermille: roll }))
          continue
        }
        const evaluation = evaluateSchoolAttendance({ school, person, household, peopleById: this.personById, cells: this.state.world.grid.cells, roadCellIds, travelCost: this.cachedSchoolTravelCost(person.homeCellId, school.id, school.locationCellId, roadCellIds) })
        const attended = evaluation.reason === 'available' && occupiedSeats < school.serviceCapacity && roll < evaluation.probabilityPermille
        const reason = attended ? 'available' : evaluation.reason === 'available' && occupiedSeats >= school.serviceCapacity ? 'capacity' : evaluation.reason === 'available' ? 'declined' : evaluation.reason
        const trace = schoolAttendanceTrace(evaluation, this.state.tick, roll, attended, reason)
        person.lastSchoolAttendance = trace
        if (!attended) {
          pushEvent(this.event('PERSON_MISSED_SCHOOL', { personId: person.id, schoolId: school.id, reason, travelCost: trace.travelCost, probabilityPermille: trace.probabilityPermille, randomRollPermille: roll }))
          continue
        }
        occupiedSeats += 1
        person.locationCellId = school.locationCellId
        person.currentActivity = { kind: 'commons', locationId: school.activityLocationId, sinceTick: this.state.tick }
        person.schoolAttendance = { schoolId: school.id, returnTick: this.state.tick + SCHOOL_ATTENDANCE.durationHours }
        person.schoolLearningHours = (person.schoolLearningHours ?? 0) + SCHOOL_ATTENDANCE.durationHours
        if (trace.travelCost !== null) this.recordTravel(trace.travelCost * 2)
        pushEvent(this.event('PERSON_ATTENDED_SCHOOL', { personId: person.id, schoolId: school.id, schoolCellId: school.locationCellId, travelCost: trace.travelCost, probabilityPermille: trace.probabilityPermille, randomRollPermille: roll, learningHours: SCHOOL_ATTENDANCE.durationHours }))
      }
    }
  }

  private cachedSchoolTravelCost(homeCellId: string, schoolId: string, schoolCellId: string, roadCellIds: ReadonlySet<string>): number | null {
    const key = `${homeCellId}|${schoolId}`
    const cached = this.schoolTravelCosts.get(key)
    if (cached !== undefined || this.schoolTravelCosts.has(key)) return cached ?? null
    const travelCost = schoolTravelCost(homeCellId, schoolCellId, this.state.world.grid.cells, roadCellIds)
    this.schoolTravelCosts.set(key, travelCost)
    return travelCost
  }

  private recordActivityPersonHours(): void {
    for (const person of this.livingPeople()) {
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
        if (parent.lifeStatus === 'dead') return []
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
    for (const person of this.livingPeople()) {
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
      setPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity, developed.currentValuePermille, this.contentPackRuntime.variables)
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

  private advanceAges(pushEvent: (event: SimulationEvent) => void): boolean {
    let personDied = false
    for (const person of this.livingPeople()) {
      person.ageHoursIntoYear += BASE_TICK_HOURS
      if (person.ageHoursIntoYear < 8760) continue
      person.ageHoursIntoYear -= 8760
      person.ageYears += 1
      const previousLifeStage = person.lifeStage ?? lifeStageForAge(person.ageYears - 1)
      const nextLifeStage = lifeStageForAge(person.ageYears)
      person.lifeStage = nextLifeStage
      person.activityScheduleId = scheduleForAge(person.ageYears)
      pushEvent(this.event('PERSON_AGED', {
        personId: person.id,
        ageYears: person.ageYears,
      }))
      if (previousLifeStage !== nextLifeStage) {
        this.state.dailyLifeCycleCounters.lifeStageTransitions += 1
        pushEvent(this.event('PERSON_LIFE_STAGE_CHANGED', { personId: person.id, previousLifeStage, nextLifeStage, ageYears: person.ageYears }))
      }
      const baseMortalityPermille = annualMortalityPermille(person.ageYears)
      // Preserve the existing lifecycle stream contract for people below the
      // established age-risk threshold. Health stress modifies an already
      // evaluated mortality opportunity; it does not create a new one.
      const healthMortalityRiskPermille = baseMortalityPermille > 0
        ? healthStressMortalityRiskPermille(getPersonVariable(person.variables, PERSON_VARIABLE_ID.healthStress))
        : 0
      const diseaseMortalityPermille = person.fictionalInfection?.phase === 'infectious'
        ? this.contentPackRuntime.pack.pathogens.find((pathogen) => pathogen.id === person.fictionalInfection?.pathogenId)?.annualMortalityPermille ?? 0
        : 0
      const mortalityPermille = Math.min(1000, baseMortalityPermille + healthMortalityRiskPermille + diseaseMortalityPermille)
      if (mortalityPermille > 0 && this.random.stream(LIFE_CYCLE_STREAM.mortality).nextInt(1000) < mortalityPermille) {
        person.lifeStatus = 'dead'
        personDied = true
        person.deathTick = this.state.tick
        if (person.journey) {
          person.locationCellId = person.homeCellId
          const household = this.householdById.get(person.householdId)
          person.currentActivity = { kind: 'home', locationId: household?.homeActivityLocationId ?? null, sinceTick: this.state.tick }
        }
        person.journey = undefined
        if (person.partnerId) {
          const partner = this.personById.get(person.partnerId)
          if (partner?.partnerId === person.id) partner.partnerId = undefined
          person.partnerId = undefined
        }
        this.state.dailyLifeCycleCounters.deaths += 1
        pushEvent(this.event('PERSON_DIED', { personId: person.id, ageYears: person.ageYears, mortalityPermille, baseMortalityPermille, healthMortalityRiskPermille, diseaseMortalityPermille }))
      }
    }
    return personDied
  }

  /** Scheduled after hourly behavior, so sharing is based on real household stores and existing relationships. */
  private resolveDailyFoodSharing(pushEvent: (event: SimulationEvent) => void): void {
    const shares = resolveFoodShares(this.state.households, this.cellById, this.state.relationships, this.personById)
    for (const share of shares) {
      this.economicCounters().foodShared += share.amount
      this.economicCounters().exchangeCount += 1
      pushEvent(this.event('HOUSEHOLDS_SHARED_FOOD', {
        donorHouseholdId: share.donorHouseholdId,
        recipientHouseholdId: share.recipientHouseholdId,
        foodAmount: share.amount,
      }))
    }
  }

  private resolveMarketExchanges(occupantsByActivity: ReadonlyMap<string, readonly string[]>, pushEvent: (event: SimulationEvent) => void): void {
    const storageAccessPermilleByMarketId = new Map(this.state.markets.map((market) => [market.id, infrastructureAccessAtCell(this.state.infrastructure, market.cellId).storagePermille]))
    for (const exchange of resolveToolExchanges(this.state.households, this.state.markets, occupantsByActivity, this.personById, storageAccessPermilleByMarketId)) {
      this.economicCounters().exchangeCount += 1
      pushEvent(this.event('HOUSEHOLDS_EXCHANGED_TOOLS', { marketId: exchange.marketId, donorHouseholdId: exchange.donorHouseholdId, recipientHouseholdId: exchange.recipientHouseholdId, toolAmount: exchange.amount }))
    }
  }

  private processBroaderDevelopment(pushEvent: (event: SimulationEvent) => void): void {
    const nextWindowStartTick = this.state.tick + 1
    for (const person of this.livingPeople()) {
      const broader = person.development.broader ?? (person.development.broader = createBroaderDevelopmentState(Math.floor((this.state.tick - 1) / 720) * 720 + 1))
      for (const definition of BROADER_DEVELOPMENT_DEFINITIONS) {
        const accumulator = broader.exposures.find((candidate) => candidate.channelId === definition.channelId && candidate.targetId === definition.targetId)
        if (!accumulator) throw new Error(`Person ${person.id} is missing broader exposure ${definition.edgeId}`)
        const completed = completeBroaderExposure(accumulator, nextWindowStartTick)
        this.replaceBroaderExposure(person, completed.accumulator)
        if (!completed.experience) continue
        const experienceId = `${person.id}:${accumulator.windowStartTick}-${this.state.tick}:${definition.type}:${definition.targetId}`
        const experience = {
          id: experienceId,
          type: definition.type,
          channelId: definition.channelId,
          personId: person.id,
          targetId: definition.targetId,
          startTick: accumulator.windowStartTick,
          endTick: this.state.tick,
          recipientHours: accumulator.recipientHours,
          sourceHours: accumulator.sourceHours,
          sourceMeanPermille: completed.experience.sourceMeanPermille,
          exposureStrengthPermille: completed.experience.exposureStrengthPermille,
          sourcePersonIds: [...accumulator.sourcePersonIds],
          sourceContextId: accumulator.sourceContextId,
        }
        broader.lastExperience = experience
        this.state.dailyDevelopmentCounters.broaderDevelopmentExperiences += 1
        const eventType = definition.type === 'experience.peer.relationship-modeling'
          ? 'PERSON_EXPERIENCED_PEER_MODELING' as const
          : definition.type === 'experience.activity.exploration-practice'
            ? 'PERSON_EXPERIENCED_ACTIVITY_PRACTICE' as const
            : 'PERSON_EXPERIENCED_COMMUNITY_EXPOSURE' as const
        pushEvent(this.event(eventType, { personId: person.id, experienceId, targetId: definition.targetId, sourceHours: experience.sourceHours, sourceMeanPermille: experience.sourceMeanPermille, exposureStrengthPermille: experience.exposureStrengthPermille, sourceContextId: experience.sourceContextId ?? null }))
        const developed = applyBroaderDevelopment({
          currentValuePermille: getPersonVariable(person.variables, definition.targetId),
          ageYears: person.ageYears,
          sourceValuePermille: experience.sourceMeanPermille,
          exposureStrengthPermille: experience.exposureStrengthPermille,
          edgeId: definition.edgeId,
          basePlasticityPermille: definition.plasticityPermille,
        })
        setPersonVariable(person.variables, definition.targetId, developed.currentValuePermille, this.contentPackRuntime.variables)
        if (developed.appliedDeltaPermille === 0) continue
        const trace = {
          edgeId: definition.edgeId,
          targetId: definition.targetId,
          experienceId,
          previousValue: getPersonVariable(person.variables, definition.targetId) - developed.appliedDeltaPermille,
          sourceValuePermille: experience.sourceMeanPermille,
          gapPermille: developed.gapPermille,
          exposureStrengthPermille: experience.exposureStrengthPermille,
          ageBand: developed.ageBand,
          plasticityPermille: developed.plasticityPermille,
          resolution: 'deterministic' as const,
          applicationProbabilityPermille: 1000 as const,
          requestedDelta: developed.requestedDeltaPermille,
          appliedDelta: developed.appliedDeltaPermille,
          currentValue: developed.currentValuePermille,
        }
        broader.lastChange = trace
        this.state.dailyDevelopmentCounters.broaderDevelopmentChanges += 1
        pushEvent(this.event('PERSON_VARIABLE_DEVELOPED', { personId: person.id, experienceId, edgeId: trace.edgeId, targetId: trace.targetId, previousValue: trace.previousValue, sourceValuePermille: trace.sourceValuePermille, gapPermille: trace.gapPermille, exposureStrengthPermille: trace.exposureStrengthPermille, ageBand: trace.ageBand, plasticityPermille: trace.plasticityPermille, applicationProbabilityPermille: trace.applicationProbabilityPermille, requestedDelta: trace.requestedDelta, appliedDelta: trace.appliedDelta, currentValue: trace.currentValue }))
      }
    }
  }

  /** Records actual location-time against the measures that were observable in that catchment this hour. */
  private recordCommunityDevelopmentExposure(): void {
    const sourceByTarget = [
      [PERSON_VARIABLE_ID.trustPropensity, 'community.emergent.socialTrust' as const],
      [PERSON_VARIABLE_ID.conformity, 'community.emergent.cohesion' as const],
      [PERSON_VARIABLE_ID.curiosity, 'community.emergent.innovationClimate' as const],
    ] as const
    for (const person of this.livingPeople()) {
      // The first community-development slice begins at adolescence so it does not
      // blur the already-isolated parent/child childhood mechanism.
      if (person.ageYears < 13) continue
      const community = this.communityByCellId.get(person.locationCellId)
      if (!community) throw new Error(`Person ${person.id} occupies a cell with no community catchment`)
      for (const [targetId, sourceId] of sourceByTarget) {
        const accumulator = broaderExposure(person, 'exposure.community.catchment', targetId)
        const updated = accumulateBroaderExposure({ accumulator, tick: this.state.tick, sourceValuePermille: community.emergent[sourceId], sourceContextId: community.catchment.id })
        this.replaceBroaderExposure(person, updated)
      }
    }
  }

  /** Completed exploration is the deliberately small first activity-practice signal. */
  private recordActivityDevelopment(person: SimulationState['people'][number]): void {
    const accumulator = broaderExposure(person, 'exposure.activity.exploration-practice', PERSON_VARIABLE_ID.persistence)
    // A carried journey can arrive before a new immediate explore selection in
    // the same one-hour interval. That is one practice interval, not two.
    if (accumulator.lastExposureTick === this.state.tick) return
    this.replaceBroaderExposure(person, accumulateBroaderExposure({ accumulator, tick: this.state.tick, sourceValuePermille: 1000, sourceContextId: 'action.explore' }))
  }

  private recordKnowledgeDiscovery(person: SimulationState['people'][number], pushEvent: (event: SimulationEvent) => void): void {
    const trace = discoverLocalTerrain(person, getPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity), this.state.tick)
    if (trace.gain > 0) pushEvent(this.event('PERSON_KNOWLEDGE_DISCOVERED', { personId: person.id, knowledgeId: trace.knowledgeId, source: trace.source, previousValue: trace.previousValue, gain: trace.gain, currentValue: trace.currentValue }))
  }

  private recordKnowledgeTransmission(source: SimulationState['people'][number], recipient: SimulationState['people'][number], relationshipTrust: number, pushEvent: (event: SimulationEvent) => void): void {
    for (const knowledgeId of ['knowledge.foraging', 'knowledge.localTerrain'] as const) {
      const trace = transmitKnowledge(source, recipient, knowledgeId, relationshipTrust, this.state.tick)
      if (trace) pushEvent(this.event('PERSON_KNOWLEDGE_SHARED', { personId: recipient.id, sourcePersonId: source.id, knowledgeId, previousValue: trace.previousValue, sourceValue: trace.sourceValue ?? 0, relationshipTrust, gain: trace.gain, currentValue: trace.currentValue }))
    }
  }

  private replaceBroaderExposure(person: SimulationState['people'][number], updated: NonNullable<SimulationState['people'][number]['development']['broader']>['exposures'][number]): void {
    const broader = person.development.broader
    if (!broader) throw new Error(`Person ${person.id} is missing broader development state`)
    broader.exposures = broader.exposures.map((existing) => existing.channelId === updated.channelId && existing.targetId === updated.targetId ? updated : existing)
  }

  /** Annual social and demographic updates; all candidates come from actual relationships. */
  private resolveAnnualLifeCycle(pushEvent: (event: SimulationEvent) => void): void {
    const living = this.livingPeople()
    for (const relationship of [...this.state.relationships].sort((a, b) => compareIds(a.id, b.id))) {
      const first = this.personById.get(relationship.personAId)
      const second = this.personById.get(relationship.personBId)
      if (!first || !second || !partnershipEligible(first, second, relationship)) continue
      if (this.random.stream(LIFE_CYCLE_STREAM.partnership).nextInt(1000) >= 180) continue
      this.formPartnership(first, second, pushEvent)
    }
    for (const first of living.sort((a, b) => compareIds(a.id, b.id))) {
      const second = first.partnerId ? this.personById.get(first.partnerId) : undefined
      if (!second || first.id > second.id || !birthEligible(first, second)) continue
      if (this.random.stream(LIFE_CYCLE_STREAM.birth).nextInt(1000) < 140) this.birthChild(first, second, pushEvent)
    }
    // Newborns are living authoritative people. Later daily sampling and
    // invariants in the same tick must observe them without waiting a tick.
    this.livingPersonCache = undefined
  }

  /**
   * A bounded monthly home-choice pass. It changes homes only after a concrete
   * geographic candidate has been evaluated and a named stochastic roll accepts it.
   */
  private resolveMonthlyHouseholdRelocations(pushEvent: (event: SimulationEvent) => void): void {
    if (this.state.tick % HOUSEHOLD_RELOCATION.intervalHours !== 0) return
    const roadCellIds = new Set((this.state.world.roads ?? []).flatMap((road) => road.cellIds))
    const relocationRng = this.random.stream(HOUSEHOLD_RELOCATION_STREAM)
    for (const household of [...this.state.households].sort((first, second) => compareIds(first.id, second.id))) {
      const evaluation = evaluateHouseholdRelocation({
        household,
        peopleById: this.personById,
        households: this.state.households,
        relationships: this.state.relationships,
        cells: this.state.world.grid.cells,
        roadCellIds,
        settlements: this.state.world.settlements,
        healthDisplacementPermille: Math.floor(household.memberIds.filter((id) => this.personById.get(id)?.fictionalInfection?.phase === 'infectious').length * 250 / Math.max(1, household.memberIds.length)),
      })
      if (!evaluation.candidate || evaluation.probabilityPermille === 0) continue
      const trace = relocationTrace(evaluation, this.state.tick, relocationRng.nextInt(1000))
      if (!trace) continue
      trace.settlementMigration = settlementMigrationTrace(this.state.world.settlements, trace.sourceCellId, trace.destinationCellId, trace.householdTiePermille, trace.foodAccessDeltaPermille, trace.travelCost)
      const homeActivity = this.activityLocationById.get(household.homeActivityLocationId)
      if (!homeActivity || homeActivity.kind !== 'home') throw new Error(`Household ${household.id} has no valid home activity`)
      household.homeCellId = trace.destinationCellId
      household.lastRelocation = trace
      homeActivity.cellId = trace.destinationCellId
      for (const personId of household.memberIds) {
        const person = this.personById.get(personId)
        if (!person) throw new Error(`Household ${household.id} relocation references missing person ${personId}`)
        // Creation-zone accounting must retain a stable origin even when a
        // legacy initial person did not serialize it explicitly.
        person.initialHomeCellId ??= person.homeCellId
        person.homeCellId = trace.destinationCellId
        person.knownCellIds = [...new Set([...person.knownCellIds, trace.destinationCellId])].sort(compareIds)
        if (person.currentActivity.kind === 'home') {
          person.locationCellId = trace.destinationCellId
          person.currentActivity = { kind: 'home', locationId: household.homeActivityLocationId, sinceTick: this.state.tick }
        }
      }
      this.state.dailyLifeCycleCounters.householdMoves += 1
      pushEvent(this.event('HOUSEHOLD_RELOCATED', {
        householdId: household.id,
        sourceCellId: trace.sourceCellId,
        destinationCellId: trace.destinationCellId,
        foodAccessDeltaPermille: trace.foodAccessDeltaPermille,
        travelCost: trace.travelCost,
        householdTiePermille: trace.householdTiePermille,
        crowdingDelta: trace.crowdingDelta,
        destinationSettlementId: trace.settlementMigration.destinationSettlementId ?? null,
        sourceSettlementId: trace.settlementMigration.sourceSettlementId ?? null,
        servicesPermille: trace.settlementMigration.servicesPermille,
        infrastructurePermille: trace.settlementMigration.infrastructurePermille,
        riskCostPermille: trace.riskCostPermille,
        utilityPermille: trace.utilityPermille,
        probabilityPermille: trace.probabilityPermille,
        randomRollPermille: trace.randomRollPermille,
      }))
    }
  }

  private formPartnership(first: SimulationState['people'][number], second: SimulationState['people'][number], pushEvent: (event: SimulationEvent) => void): void {
    const destination = this.householdById.get(first.householdId)
    const source = this.householdById.get(second.householdId)
    if (!destination || !source || source.memberIds.length !== 1 || second.journey) return
    first.partnerId = second.id
    second.partnerId = first.id
    if (source.id !== destination.id) {
      destination.memberIds = [...destination.memberIds, second.id].sort(compareIds)
      source.memberIds = []
      second.initialHomeCellId ??= second.homeCellId
      second.householdId = destination.id
      second.homeCellId = destination.homeCellId
      second.locationCellId = destination.homeCellId
      second.currentActivity = { kind: 'home', locationId: destination.homeActivityLocationId, sinceTick: this.state.tick }
      this.state.households = this.state.households.filter((household) => household.id !== source.id)
      this.state.activityLocations = this.state.activityLocations.filter((location) => location.id !== source.homeActivityLocationId)
      this.householdById.delete(source.id)
      this.activityLocationById.delete(source.homeActivityLocationId)
      this.state.dailyLifeCycleCounters.householdMoves += 1
      pushEvent(this.event('PERSON_MOVED_HOUSEHOLD', { personId: second.id, previousHouseholdId: source.id, householdId: destination.id, homeCellId: destination.homeCellId }))
    }
    this.state.dailyLifeCycleCounters.partnershipsFormed += 1
    pushEvent(this.event('PARTNERSHIP_FORMED', { firstPersonId: first.id, secondPersonId: second.id, householdId: destination.id }))
  }

  private birthChild(firstParent: SimulationState['people'][number], secondParent: SimulationState['people'][number], pushEvent: (event: SimulationEvent) => void): void {
    const household = this.householdById.get(firstParent.householdId)
    if (!household || household.id !== secondParent.householdId) return
    const ordinal = this.state.people.reduce((maximum, person) => Math.max(maximum, Number(/^person-(\d+)$/.exec(person.id)?.[1] ?? 0)), 0) + 1
    const id = `person-${ordinal.toString().padStart(4, '0')}`
    const variables = createDefaultPersonVariableValues({}, this.contentPackRuntime.variables)
    for (const definition of this.contentPackRuntime.variableDefinitions) {
      const firstValue = getPersonVariable(firstParent.variables, definition.id)
      const secondValue = getPersonVariable(secondParent.variables, definition.id)
      setPersonVariable(variables, definition.id, Math.round((firstValue + secondValue) / 2), this.contentPackRuntime.variables)
    }
    const inheritance = calculateCuriosityInheritance({
      parentIds: [firstParent.id, secondParent.id].sort(compareIds) as [string, string],
      parentValuesPermille: [getPersonVariable(firstParent.variables, PERSON_VARIABLE_ID.curiosity), getPersonVariable(secondParent.variables, PERSON_VARIABLE_ID.curiosity)],
      randomVariationPermille: this.random.stream(LIFE_CYCLE_STREAM.inheritance).nextInt(1001),
    })
    setPersonVariable(variables, PERSON_VARIABLE_ID.curiosity, inheritance.valuePermille, this.contentPackRuntime.variables)
    const child: SimulationState['people'][number] = {
      id, ageYears: 0, ageHoursIntoYear: 0, lifeStage: 'infant', lifeStatus: 'alive', birthTick: this.state.tick,
      locationCellId: household.homeCellId, homeCellId: household.homeCellId, householdId: household.id,
      occupation: 'dependent',
      culture: createCulturalState(),
      language: initialLanguage(this.cellById.get(household.homeCellId)?.q ?? 0),
      knowledge: initialKnowledge(0, 'dependent'),
      schoolLearningHours: 0,
      activityScheduleId: scheduleForAge(0), currentActivity: { kind: 'home', locationId: household.homeActivityLocationId, sinceTick: this.state.tick },
      originTraces: [inheritance.trace], development: { exposures: [{ ...createParentCuriosityExposureAccumulator(Math.floor(this.state.tick / 720) * 720 + 1), sourcePersonIds: [] }], broader: createBroaderDevelopmentState(Math.floor(this.state.tick / 720) * 720 + 1) },
      environmentalExposure: { observedHours: 0, foodAccessibleHours: 0, difficultTerrainHours: 0, thermalLoadPermilleHours: 0, waterAvailabilityPermilleHours: 0 }, healthExposure: emptyHealthExposure(), variables, knownCellIds: [household.homeCellId],
    }
    this.state.people = [...this.state.people, child].sort((a, b) => compareIds(a.id, b.id))
    this.personById.set(child.id, child)
    household.memberIds = [...household.memberIds, child.id].sort(compareIds)
    this.state.parentChildLinks = [...this.state.parentChildLinks,
      { id: `${firstParent.id}|${id}`, householdId: household.id, parentId: firstParent.id, childId: id },
      { id: `${secondParent.id}|${id}`, householdId: household.id, parentId: secondParent.id, childId: id },
    ].sort((a, b) => compareIds(a.id, b.id))
    this.parentIdsByChildId.set(id, [firstParent.id, secondParent.id].sort(compareIds))
    this.state.dailyLifeCycleCounters.births += 1
    pushEvent(this.event('PERSON_BORN', { personId: id, householdId: household.id, parentIds: [firstParent.id, secondParent.id].sort(compareIds).join(',') }))
  }

  private livingPeople(): SimulationState['people'][number][] {
    if (this.livingPersonCache === undefined) {
      this.livingPersonCache = this.state.people.filter((person) => person.lifeStatus !== 'dead')
      this.livingPersonIndexBuilds += 1
    }
    return this.livingPersonCache
  }

  private applyEncounter(encounter: ResolvedEncounter, pushEvent: (event: SimulationEvent) => void): boolean {
    const id = relationshipId(encounter.initiatorId, encounter.participantId)
    const existing = this.relationshipById.get(id)
    const updated = applyEncounter(existing ?? createRelationship(encounter.initiatorId, encounter.participantId), encounter.outcome, this.state.tick)
    this.relationshipById.set(id, updated)
    const familiarityAfter = updated.familiarity
    const initiator = this.personById.get(encounter.initiatorId)
    const participant = this.personById.get(encounter.participantId)
    if (!initiator || !participant) throw new Error('Resolved encounter contains a missing person')
    adjustPersonVariable(initiator.variables, PERSON_VARIABLE_ID.socialConnection, -ENCOUNTER_SOCIAL_NEED_RECOVERY, this.contentPackRuntime.variables)
    adjustPersonVariable(participant.variables, PERSON_VARIABLE_ID.socialConnection, -ENCOUNTER_SOCIAL_NEED_RECOVERY, this.contentPackRuntime.variables)
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
    const communityId = this.communityByCellId.get(encounter.cellId)?.catchment.id ?? 'unassigned'
    const nextDispute = applyDispute(this.disputeById.get(disputeId(initiator.id, participant.id)), initiator.id, participant.id, encounter.outcome, communityId, this.state.tick)
    if (nextDispute) this.disputeById.set(nextDispute.id, nextDispute)
    if (encounter.outcome === 'positive') {
      transmitCulture(initiator, participant, updated, this.state.tick)
      transmitCulture(participant, initiator, updated, this.state.tick)
      acquireLanguage(initiator, participant, this.state.tick)
      acquireLanguage(participant, initiator, this.state.tick)
      this.recordKnowledgeTransmission(initiator, participant, updated.aToB.trust, pushEvent)
      this.recordKnowledgeTransmission(participant, initiator, updated.bToA.trust, pushEvent)
    }
    this.recordPeerDevelopmentExposure(initiator, participant, updated)
    return !existing
  }

  /** Peer modeling requires an actual resolved encounter and uses the post-encounter relationship strength as evidence. */
  private recordPeerDevelopmentExposure(first: SimulationState['people'][number], second: SimulationState['people'][number], relationship: SimulationState['relationships'][number]): void {
    const sources = [
      [PERSON_VARIABLE_ID.trustPropensity, PERSON_VARIABLE_ID.trustPropensity],
      [PERSON_VARIABLE_ID.sociability, PERSON_VARIABLE_ID.sociability],
      [PERSON_VARIABLE_ID.conformity, PERSON_VARIABLE_ID.conformity],
    ] as const
    const record = (recipient: SimulationState['people'][number], source: SimulationState['people'][number], relationshipTrust: number) => {
      for (const [targetId, sourceId] of sources) {
        const accumulator = broaderExposure(recipient, 'exposure.peer.relationship-modeling', targetId)
        const recipientValue = getPersonVariable(recipient.variables, targetId)
        const sourceValue = getPersonVariable(source.variables, sourceId)
        // Relationship trust attenuates a peer's modeled value; unfamiliar/weak ties cannot exert a full-strength pull.
        const interpretedSource = recipientValue + symmetricRoundDivision((sourceValue - recipientValue) * relationshipTrust, 1000)
        const updated = accumulateBroaderExposure({ accumulator, tick: this.state.tick, sourceValuePermille: interpretedSource, sourcePersonId: source.id })
        this.replaceBroaderExposure(recipient, updated)
      }
    }
    record(first, second, relationship.personAId === first.id ? relationship.aToB.trust : relationship.bToA.trust)
    record(second, first, relationship.personAId === second.id ? relationship.aToB.trust : relationship.bToA.trust)
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
        : decision.action === 'rest' ? 'PERSON_RESTED' : decision.action === 'work' ? 'PERSON_WORKED' : 'PERSON_SOCIALIZED'
    return this.event(type, {
      personId,
      fromCellId: outcome.fromCellId,
      targetCellId: decision.targetCellId ?? null,
      actionWeight: decision.weight,
      probabilityPermille: decision.probabilityPermille,
      foodConsumed: outcome.foodConsumed,
      foodProduced: outcome.foodProduced,
      agriculturalFoodProduced: outcome.agriculturalFoodProduced,
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
    validateCanonicalSimulationState(this.state, this.contentPackRuntime)
  }

  private economicCounters(): NonNullable<SimulationState['dailyEconomicCounters']> {
    if (!this.state.dailyEconomicCounters) this.state.dailyEconomicCounters = { productiveHours: 0, foodProduced: 0, agriculturalFoodProduced: 0, foodConsumedFromHouseholds: 0, foodShared: 0, exchangeCount: 0 }
    return this.state.dailyEconomicCounters
  }

  private environmentalCounters(): NonNullable<SimulationState['dailyEnvironmentalCounters']> {
    if (!this.state.dailyEnvironmentalCounters) this.state.dailyEnvironmentalCounters = { foodRegenerated: 0 }
    return this.state.dailyEnvironmentalCounters
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

interface EngineTickRuntime {
  readonly pushEvent: (event: SimulationEvent) => void
  readonly statistics: StatisticSample[]
  readonly changeCategories: Set<AuthoritativeChangeSet['categories'][number]>
  readonly changedCellIds: Set<string>
  readonly phaseCounts: Record<string, number>
  readonly invalidate: (categories: readonly AuthoritativeChangeSet['categories'][number][], cellIds?: readonly string[]) => void
}

function changeSetFromEvents(events: readonly SimulationEvent[], categoryHints: ReadonlySet<AuthoritativeChangeSet['categories'][number]> | readonly AuthoritativeChangeSet['categories'][number][] = [], cellIdHints: ReadonlySet<string> | readonly string[] = []): AuthoritativeChangeSet {
  const cellIds = new Set(cellIdHints)
  const categories = new Set<AuthoritativeChangeSet['categories'][number]>(categoryHints)
  for (const event of events) {
    collectEventChanges(event, categories, cellIds)
  }
  return { categories: [...categories].sort(), cellIds: [...cellIds].sort(compareIds) }
}

function collectEventChanges(event: SimulationEvent, categories: Set<AuthoritativeChangeSet['categories'][number]>, cellIds: Set<string>): void {
  if (event.type === 'HOUSEHOLD_RELOCATED' || event.type === 'PERSON_MOVED' || event.type === 'PERSON_STARTED_TRAVEL' || event.type === 'PERSON_MOVED_HOUSEHOLD' || event.type === 'COHORT_MATERIALIZED' || event.type === 'PEOPLE_DEMATERIALIZED' || event.type === 'PERSON_BORN' || event.type === 'PERSON_DIED') { categories.add('people'); categories.add('locations') }
  if (event.type === 'RELATIONSHIP_FORMED' || event.type === 'PARTNERSHIP_FORMED' || event.type === 'PERSON_DIED' || event.type === 'PERSON_BORN') categories.add('relationships')
  if (event.type === 'COMMUNITY_MEASURES_UPDATED' || event.type === 'COMMUNITY_CONTENTION_RESOLVED' || event.type === 'SETTLEMENT_SCALE_CHANGED' || event.type === 'INFRASTRUCTURE_UPDATED') categories.add('communities')
  if (event.type === 'HOUSEHOLD_RELOCATED') {
    if (typeof event.payload.sourceCellId === 'string') cellIds.add(event.payload.sourceCellId)
    if (typeof event.payload.destinationCellId === 'string') cellIds.add(event.payload.destinationCellId)
  }
}
