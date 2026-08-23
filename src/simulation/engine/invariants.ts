import { scheduleForAge } from '../activities/config'
import { commonsActivityId, householdHomeActivityId } from '../activities/model'
import type { CuriosityInheritanceTrace, SimulationState } from '../domain/types'
import { PARENT_CURIOSITY_EXPOSURE_CHANNEL, PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS, PARENT_CURIOSITY_EXPERIENCE_TYPE } from '../exposure/model'
import { DEVELOPMENT_PARENT_CURIOSITY_EDGE_ID, DEVELOPMENT_PLASTICITY_REGISTRY } from '../development/model'
import { BROADER_DEVELOPMENT_DEFINITIONS, BROADER_DEVELOPMENT_WINDOW_TICKS } from '../development/broader'

export function validateHouseholdActivityState(state: SimulationState): void {
  if (!Array.isArray(state.households)) throw new Error('Simulation contains invalid households')
  if (!Array.isArray(state.parentChildLinks)) throw new Error('Simulation contains invalid parent-child links')
  if (!Array.isArray(state.activityLocations)) throw new Error('Simulation contains invalid activity locations')

  assertCanonicalUniqueIds(state.households, 'Households')
  assertCanonicalUniqueIds(state.parentChildLinks, 'Parent-child links')
  assertCanonicalUniqueIds(state.activityLocations, 'Activity locations')

  const cellsById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
  const peopleById = new Map(state.people.map((person) => [person.id, person]))
  const householdsById = new Map(state.households.map((household) => [household.id, household]))
  const locationsById = new Map(state.activityLocations.map((location) => [location.id, location]))
  const memberships = new Map<string, string>()

  for (const household of state.households) {
    const homeCell = cellsById.get(household.homeCellId)
    if (!homeCell?.movementCost) throw new Error(`Household ${household.id} has an invalid home cell`)
    if (household.homeActivityLocationId !== householdHomeActivityId(household.id)) throw new Error(`Household ${household.id} has a non-canonical home activity ID`)
    if (!isSortedUnique(household.memberIds) || household.memberIds.length === 0) throw new Error(`Household ${household.id} has invalid members`)
    for (const personId of household.memberIds) {
      if (!peopleById.has(personId)) throw new Error(`Household ${household.id} contains missing person ${personId}`)
      if (memberships.has(personId)) throw new Error(`Person ${personId} belongs to multiple households`)
      memberships.set(personId, household.id)
    }
    const homeActivity = locationsById.get(household.homeActivityLocationId)
    if (homeActivity?.kind !== 'home' || homeActivity.cellId !== household.homeCellId || homeActivity.householdId !== household.id) {
      throw new Error(`Household ${household.id} has an invalid home activity location`)
    }
  }

  const passableCellIds = state.world.grid.cells.filter((cell) => cell.movementCost > 0).map((cell) => cell.id).sort()
  const commonsCellIds: string[] = []
  const homeHouseholdIds: string[] = []
  for (const location of state.activityLocations) {
    const cell = cellsById.get(location.cellId)
    if (!cell?.movementCost) throw new Error(`Activity location ${location.id} occupies an invalid cell`)
    if (location.kind === 'commons') {
      if (location.householdId !== undefined || location.id !== commonsActivityId(location.cellId)) throw new Error(`Commons ${location.id} is invalid`)
      commonsCellIds.push(location.cellId)
    } else {
      if (!location.householdId || location.id !== householdHomeActivityId(location.householdId) || !householdsById.has(location.householdId)) {
        throw new Error(`Home activity ${location.id} is invalid`)
      }
      homeHouseholdIds.push(location.householdId)
    }
  }
  if (!sameStrings(commonsCellIds.sort(), passableCellIds)) throw new Error('Commons activities do not match passable cells')
  if (!sameStrings(homeHouseholdIds.sort(), state.households.map(({ id }) => id).sort())) throw new Error('Home activities do not match households')

  const parentIdsByChildId = new Map<string, string[]>()
  for (const link of state.parentChildLinks) {
    if (link.parentId === link.childId || link.id !== `${link.parentId}|${link.childId}`) throw new Error(`Parent-child link ${link.id} is not canonical`)
    const parent = peopleById.get(link.parentId)
    const child = peopleById.get(link.childId)
    if (!parent || !child) throw new Error(`Parent-child link ${link.id} contains a missing person`)
    if (parent.householdId !== link.householdId || child.householdId !== link.householdId) throw new Error(`Parent-child link ${link.id} crosses households`)
    const ageGapHours = (parent.ageYears - child.ageYears) * 8760 + parent.ageHoursIntoYear - child.ageHoursIntoYear
    if (ageGapHours < 18 * 8760) throw new Error(`Parent-child link ${link.id} has an invalid age gap`)
    const parentIds = parentIdsByChildId.get(child.id)
    if (parentIds) parentIds.push(parent.id)
    else parentIdsByChildId.set(child.id, [parent.id])
  }
  for (const parentIds of parentIdsByChildId.values()) parentIds.sort()

  for (const person of state.people) {
    const household = householdsById.get(person.householdId)
    if (!household || memberships.get(person.id) !== household.id) throw new Error(`Person ${person.id} has inconsistent household membership`)
    if (person.homeCellId !== household.homeCellId) throw new Error(`Person ${person.id} has a home outside their household`)
    if (!Number.isSafeInteger(person.ageYears) || person.ageYears < 0) throw new Error(`Person ${person.id} has an invalid age`)
    if (!Number.isSafeInteger(person.ageHoursIntoYear) || person.ageHoursIntoYear < 0 || person.ageHoursIntoYear >= 8760) throw new Error(`Person ${person.id} has invalid age-hour progress`)
    if (person.activityScheduleId !== scheduleForAge(person.ageYears)) throw new Error(`Person ${person.id} has an invalid activity schedule`)
    if (!Number.isSafeInteger(person.currentActivity.sinceTick) || person.currentActivity.sinceTick < 0 || person.currentActivity.sinceTick > state.tick) throw new Error(`Person ${person.id} has an invalid activity start tick`)
    if (person.journey) {
      if (person.currentActivity.kind !== 'travel' || person.currentActivity.locationId !== null) throw new Error(`Traveler ${person.id} occupies an activity location`)
    } else {
      const locationId = person.currentActivity.locationId
      const location = locationId === null ? undefined : locationsById.get(locationId)
      if (!location || person.currentActivity.kind === 'travel' || location.kind !== person.currentActivity.kind || location.cellId !== person.locationCellId) {
        throw new Error(`Person ${person.id} occupies an invalid activity location`)
      }
      if (location.kind === 'home' && location.householdId !== person.householdId) throw new Error(`Person ${person.id} occupies another household's home activity`)
    }
    if (!Array.isArray(person.originTraces)) throw new Error(`Person ${person.id} has invalid origin traces`)
    const expectedParentIds = parentIdsByChildId.get(person.id)
    if (expectedParentIds) {
      if (expectedParentIds.length !== 2 || person.originTraces.length !== 1) throw new Error(`Child ${person.id} must have two parent links and one inheritance trace`)
      validateInheritanceTrace(person.id, person.originTraces[0] as CuriosityInheritanceTrace, expectedParentIds, peopleById)
    } else if (person.originTraces.length !== 0) {
      throw new Error(`Non-child ${person.id} has an inheritance trace`)
    }
    if (person.lifeStatus !== 'dead') validateDevelopmentState(person, state, expectedParentIds ?? [], peopleById, household)
    const environmentalExposure = person.environmentalExposure
    if (!environmentalExposure || Object.values(environmentalExposure).some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`Person ${person.id} has invalid environmental exposure`)
    }
    if (environmentalExposure.observedHours > state.tick || environmentalExposure.foodAccessibleHours > environmentalExposure.observedHours || environmentalExposure.difficultTerrainHours > environmentalExposure.observedHours) {
      throw new Error(`Person ${person.id} has inconsistent environmental exposure`)
    }
  }
  if (memberships.size !== state.people.length) throw new Error('Not every person belongs to exactly one household')
  validateInitialPopulationPlacement(state)

  const activityCounters = state.dailyActivityCounters
  if (!activityCounters || Object.values(activityCounters).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('Daily activity counters are invalid')
  const maximumPersonHours = state.people.length * (state.tick % 24)
  if (activityCounters.homePersonHours + activityCounters.commonsPersonHours + activityCounters.travelPersonHours > maximumPersonHours) {
    throw new Error('Daily activity counters exceed elapsed living person-hours')
  }
  const developmentCounters = state.dailyDevelopmentCounters
  if (!developmentCounters || Object.values(developmentCounters).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('Daily development counters are invalid')
  const lifeCycleCounters = state.dailyLifeCycleCounters
  if (!lifeCycleCounters || Object.values(lifeCycleCounters).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('Daily life-cycle counters are invalid')
}

/** Starting homes retain authored zone totals after later household moves. */
function validateInitialPopulationPlacement(state: SimulationState): void {
  const creation = state.config.worldCreation
  if (!creation || state.people.length < creation.initialPopulationCount) throw new Error('Population is smaller than the world creation request')
  const zoneByCellId = new Map<string, string>()
  const expected = new Map<string, number>()
  for (const zone of creation.populationZones) {
    expected.set(zone.id, zone.populationCount)
    for (const cellId of zone.cellIds) {
      if (zoneByCellId.has(cellId)) throw new Error(`Population creation zones overlap at ${cellId}`)
      zoneByCellId.set(cellId, zone.id)
    }
  }
  const actual = new Map<string, number>()
  for (const person of state.people.filter((person) => person.birthTick === undefined)) {
    const zoneId = zoneByCellId.get(person.initialHomeCellId ?? person.homeCellId)
    if (!zoneId) throw new Error(`Person ${person.id} home is outside all population creation zones`)
    actual.set(zoneId, (actual.get(zoneId) ?? 0) + 1)
  }
  for (const [zoneId, populationCount] of expected) if ((actual.get(zoneId) ?? 0) !== populationCount) throw new Error(`Population zone ${zoneId} does not match its requested allocation`)
}

function validateDevelopmentState(
  person: SimulationState['people'][number],
  state: SimulationState,
  expectedParentIds: readonly string[],
  peopleById: ReadonlyMap<string, unknown>,
  household: SimulationState['households'][number],
): void {
  if (!person.development || !Array.isArray(person.development.exposures) || person.development.exposures.length !== 1) throw new Error(`Person ${person.id} has invalid development state`)
  const accumulator = person.development.exposures[0]
  if (!accumulator || accumulator.channelId !== PARENT_CURIOSITY_EXPOSURE_CHANNEL) throw new Error(`Person ${person.id} has an unknown development exposure channel`)
  const expectedWindowStartTick = Math.floor(state.tick / PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS) * PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS + 1
  if (accumulator.windowStartTick !== expectedWindowStartTick) throw new Error(`Person ${person.id} has an invalid exposure window start`)
  const accumulatorIntegers = [accumulator.recipientHours, accumulator.sourceHours, accumulator.weightedSourceValueHours]
  if (accumulatorIntegers.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error(`Person ${person.id} has invalid exposure totals`)
  if (accumulator.recipientHours > PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS || accumulator.sourceHours > accumulator.recipientHours * 2 || accumulator.weightedSourceValueHours > accumulator.sourceHours * 1000) {
    throw new Error(`Person ${person.id} has out-of-range exposure totals`)
  }
  validateCanonicalSources(person.id, accumulator.sourcePersonIds, expectedParentIds, peopleById)
  if (accumulator.sourceHours === 0 && (accumulator.recipientHours !== 0 || accumulator.weightedSourceValueHours !== 0 || accumulator.sourcePersonIds.length !== 0 || accumulator.lastExposureTick !== undefined)) {
    throw new Error(`Person ${person.id} has inconsistent empty exposure state`)
  }
  if (accumulator.sourceHours > 0) {
    if (accumulator.sourcePersonIds.length === 0) throw new Error(`Person ${person.id} has exposure without sources`)
    if (!Number.isSafeInteger(accumulator.lastExposureTick) || (accumulator.lastExposureTick as number) < accumulator.windowStartTick || (accumulator.lastExposureTick as number) > state.tick) {
      throw new Error(`Person ${person.id} has an invalid last exposure tick`)
    }
  }
  if (expectedParentIds.length === 0 && accumulator.sourceHours !== 0) throw new Error(`Non-child ${person.id} has parent exposure`)

  const experience = person.development.lastExperience
  if (experience) {
    if (experience.type !== PARENT_CURIOSITY_EXPERIENCE_TYPE || experience.personId !== person.id || experience.householdId !== household.id || experience.activityLocationId !== household.homeActivityLocationId) {
      throw new Error(`Person ${person.id} has invalid last development experience context`)
    }
    if (!Number.isSafeInteger(experience.startTick) || !Number.isSafeInteger(experience.endTick) || experience.endTick - experience.startTick + 1 !== PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS || experience.endTick > state.tick) {
      throw new Error(`Person ${person.id} has invalid last development experience window`)
    }
    const expectedId = `${person.id}:${experience.startTick}-${experience.endTick}:${experience.type}`
    if (experience.id !== expectedId) throw new Error(`Person ${person.id} has a non-canonical experience ID`)
    if (!Number.isSafeInteger(experience.recipientHours) || !Number.isSafeInteger(experience.sourceHours) || experience.recipientHours <= 0 || experience.recipientHours > PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS || experience.sourceHours <= 0 || experience.sourceHours > experience.recipientHours * 2) {
      throw new Error(`Person ${person.id} has invalid last development experience exposure`)
    }
    validateCanonicalSources(person.id, experience.sourcePersonIds, expectedParentIds, peopleById)
    if (experience.sourcePersonIds.length === 0) throw new Error(`Person ${person.id} has an experience without sources`)
    if (!Number.isSafeInteger(experience.sourceMeanPermille) || experience.sourceMeanPermille < 0 || experience.sourceMeanPermille > 1000) throw new Error(`Person ${person.id} has invalid experience source mean`)
    const expectedStrength = Math.min(1000, Math.floor(experience.sourceHours * 1000 / PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS))
    if (experience.exposureStrengthPermille !== expectedStrength) throw new Error(`Person ${person.id} has invalid experience exposure strength`)
  } else if (expectedParentIds.length === 0 && person.development.lastChange) {
    throw new Error(`Non-child ${person.id} has a development change`)
  }

  const change = person.development.lastChange
  if (change) {
    if (change.edgeId !== DEVELOPMENT_PARENT_CURIOSITY_EDGE_ID || change.targetId !== 'person.trait.curiosity' || !change.experienceId.startsWith(`${person.id}:`) || change.resolution !== 'deterministic' || change.applicationProbabilityPermille !== 1000) {
      throw new Error(`Person ${person.id} has invalid last development change context`)
    }
    const bounded = [change.previousValue, change.sourceValuePermille, change.exposureStrengthPermille, change.currentValue]
    if (bounded.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000)) throw new Error(`Person ${person.id} has invalid development change values`)
    const signed = [change.gapPermille, change.requestedDelta, change.appliedDelta]
    if (signed.some((value) => !Number.isSafeInteger(value) || value < -1000 || value > 1000)) throw new Error(`Person ${person.id} has invalid signed development change values`)
    if (change.gapPermille !== change.sourceValuePermille - change.previousValue || change.currentValue !== change.previousValue + change.appliedDelta || change.appliedDelta === 0) {
      throw new Error(`Person ${person.id} has an inconsistent development change`)
    }
    const plasticity = DEVELOPMENT_PLASTICITY_REGISTRY.find(({ ageBand }) => ageBand === change.ageBand)?.curiosityPlasticityPermillePerMonth
    if (change.plasticityPermille !== plasticity) throw new Error(`Person ${person.id} has invalid development plasticity`)
  }
  validateBroaderDevelopmentState(person, state, peopleById)
}

function validateBroaderDevelopmentState(person: SimulationState['people'][number], state: SimulationState, peopleById: ReadonlyMap<string, unknown>): void {
  const broader = person.development.broader
  if (!broader) return // Kept only for pre-M11 in-memory test fixtures; snapshots use schema 15.
  if (!Array.isArray(broader.exposures) || broader.exposures.length !== BROADER_DEVELOPMENT_DEFINITIONS.length) throw new Error(`Person ${person.id} has invalid broader development exposures`)
  for (const definition of BROADER_DEVELOPMENT_DEFINITIONS) {
    const exposure = broader.exposures.find((value) => value.channelId === definition.channelId && value.targetId === definition.targetId)
    if (!exposure || exposure.windowStartTick !== Math.floor(state.tick / BROADER_DEVELOPMENT_WINDOW_TICKS) * BROADER_DEVELOPMENT_WINDOW_TICKS + 1) throw new Error(`Person ${person.id} has invalid broader exposure window`)
    const numeric = [exposure.recipientHours, exposure.sourceHours, exposure.weightedSourceValueHours]
    if (numeric.some((value) => !Number.isSafeInteger(value) || value < 0) || exposure.sourceHours > BROADER_DEVELOPMENT_WINDOW_TICKS || exposure.weightedSourceValueHours > exposure.sourceHours * 1000) throw new Error(`Person ${person.id} has invalid broader exposure totals`)
    if (!isSortedUnique(exposure.sourcePersonIds) || exposure.sourcePersonIds.some((id) => id === person.id || !peopleById.has(id))) throw new Error(`Person ${person.id} has invalid broader exposure sources`)
  }
  const experience = broader.lastExperience
  if (experience && (!experience.id.startsWith(`${person.id}:`) || experience.personId !== person.id || experience.endTick > state.tick || experience.endTick - experience.startTick + 1 !== BROADER_DEVELOPMENT_WINDOW_TICKS || experience.sourceHours < 1 || experience.sourceHours > BROADER_DEVELOPMENT_WINDOW_TICKS)) throw new Error(`Person ${person.id} has invalid broader development experience`)
  const change = broader.lastChange
  if (change && (change.currentValue !== change.previousValue + change.appliedDelta || change.appliedDelta === 0 || change.resolution !== 'deterministic' || change.applicationProbabilityPermille !== 1000)) throw new Error(`Person ${person.id} has invalid broader development change`)
}

function validateCanonicalSources(personId: string, sourcePersonIds: readonly string[], expectedParentIds: readonly string[], peopleById: ReadonlyMap<string, unknown>): void {
  if (!isSortedUnique(sourcePersonIds) || sourcePersonIds.some((sourceId) => sourceId === personId || !peopleById.has(sourceId) || !expectedParentIds.includes(sourceId))) {
    throw new Error(`Person ${personId} has invalid development sources`)
  }
}

function validateInheritanceTrace(personId: string, trace: CuriosityInheritanceTrace, expectedParentIds: readonly string[], peopleById: ReadonlyMap<string, unknown>): void {
  if (trace.modelId !== 'inheritance.parental-baseline-variation.v1' || trace.targetId !== 'person.trait.curiosity') throw new Error(`Person ${personId} has an unknown inheritance trace`)
  if (!isSortedUnique(trace.parentIds) || trace.parentIds.length !== 2) throw new Error(`Person ${personId} has invalid inheritance parents`)
  if (trace.parentIds.some((parentId) => parentId === personId || !peopleById.has(parentId)) || !sameStrings(trace.parentIds, expectedParentIds)) {
    throw new Error(`Person ${personId} inheritance parents do not match parent-child links`)
  }
  const bounded = [trace.parentalMeanPermille, trace.populationBaselinePermille, trace.randomVariationPermille, trace.parentalWeightPermille, trace.baselineWeightPermille, trace.variationWeightPermille, trace.finalValue]
  if (bounded.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000)) throw new Error(`Person ${personId} has invalid inheritance values`)
  if (trace.parentalWeightPermille + trace.baselineWeightPermille + trace.variationWeightPermille !== 1000) throw new Error(`Person ${personId} has invalid inheritance weights`)
  const expectedFinal = Math.max(0, Math.min(1000, Math.round((
    trace.parentalMeanPermille * trace.parentalWeightPermille
      + trace.populationBaselinePermille * trace.baselineWeightPermille
      + trace.randomVariationPermille * trace.variationWeightPermille
  ) / 1000)))
  if (trace.finalValue !== expectedFinal) throw new Error(`Person ${personId} has an inconsistent inheritance result`)
}

function assertCanonicalUniqueIds(values: readonly { id: string }[], label: string): void {
  const ids = values.map(({ id }) => id)
  if (!isSortedUnique(ids)) throw new Error(`${label} are not in canonical order`)
}

function isSortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || (values[index - 1] as string) < value)
}

function sameStrings(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index])
}
