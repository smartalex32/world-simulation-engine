import type { ActivityLocationState, CuriosityInheritanceTrace, GeographicCell, HouseholdState, ParentChildLink, PersonState, PopulationPlacementZone } from '../domain/types'
import { resolveCurrentActivity } from '../activities/model'
import { generateInitialHouseholds } from '../households/generate'
import { HOUSEHOLD_GENERATION_STREAM } from '../households/config'
import { calculateCuriosityInheritance } from '../households/inheritance'
import { createParentCuriosityExposureAccumulator } from '../exposure/model'
import { RandomProvider } from '../rng/pcg32'
import { hexNeighbors } from '../spatial/hex'
import { PERSON_VARIABLE_ID, getPersonVariableDefinition } from '../variables/registry'
import { createDefaultPersonVariableValues, getPersonVariable, setPersonVariable } from '../variables/storage'
import type { PersonVariableId } from '../variables/types'

type BasePersonState = Omit<PersonState, 'ageHoursIntoYear' | 'locationCellId' | 'homeCellId' | 'householdId' | 'activityScheduleId' | 'currentActivity' | 'originTraces' | 'development'> & { initialHomeCellId: string }

export interface GeneratedPopulation {
  people: PersonState[]
  households: HouseholdState[]
  parentChildLinks: ParentChildLink[]
  activityLocations: ActivityLocationState[]
}

export function generatePopulation(cells: GeographicCell[], random: RandomProvider): GeneratedPopulation
export function generatePopulation(cells: GeographicCell[], zones: readonly PopulationPlacementZone[], random: RandomProvider, preserveLegacyHomePlacement?: boolean): GeneratedPopulation
export function generatePopulation(cells: GeographicCell[], zonesOrRandom: readonly PopulationPlacementZone[] | RandomProvider, suppliedRandom?: RandomProvider, preserveLegacyHomePlacement = false): GeneratedPopulation {
  const random = zonesOrRandom instanceof RandomProvider ? zonesOrRandom : suppliedRandom
  if (!random) throw new Error('Population generation requires a random provider')
  const zones = zonesOrRandom instanceof RandomProvider
    ? [{ id: 'population-zone-0001', name: 'Initial population', cellIds: cells.filter((cell) => cell.habitability >= 500 && cell.movementCost > 0).map((cell) => cell.id).sort(), populationCount: 200 }]
    : zonesOrRandom
  const count = zones.reduce((sum, zone) => sum + zone.populationCount, 0)
  const basePeople = generateBasePeople(cells, random, count)
  const topology = generateInitialHouseholds(basePeople, cells, zones, random, preserveLegacyHomePlacement || zonesOrRandom instanceof RandomProvider)
  const basePeopleById = new Map(basePeople.map((person) => [person.id, person]))
  const householdsById = new Map(topology.households.map((household) => [household.id, household]))
  const parentIdsByChildId = new Map<string, string[]>()
  for (const link of topology.parentChildLinks) {
    const existing = parentIdsByChildId.get(link.childId)
    if (existing) existing.push(link.parentId)
    else parentIdsByChildId.set(link.childId, [link.parentId])
  }
  for (const [childId, parentIds] of parentIdsByChildId) {
    if (parentIds.length !== 2) throw new Error(`Initial child ${childId} must have exactly two parents`)
    parentIds.sort()
  }
  const ageRemainderRng = random.stream(HOUSEHOLD_GENERATION_STREAM.ageRemainderHours)
  const inheritanceRng = random.stream(HOUSEHOLD_GENERATION_STREAM.curiosityInheritance)
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  const people = topology.personAssignments.map((assignment): PersonState => {
    const base = basePeopleById.get(assignment.personId)
    const household = householdsById.get(assignment.householdId)
    if (!base || !household) throw new Error(`Household assignment references missing state for ${assignment.personId}`)
    const variables = { ...base.variables }
    const parentIds = parentIdsByChildId.get(base.id)
    const originTraces: CuriosityInheritanceTrace[] = []
    if (parentIds) {
      const firstParentId = parentIds[0]
      const secondParentId = parentIds[1]
      if (!firstParentId || !secondParentId) throw new Error(`Child ${base.id} has invalid inheritance sources`)
      const firstParent = basePeopleById.get(firstParentId)
      const secondParent = basePeopleById.get(secondParentId)
      if (!firstParent || !secondParent) throw new Error(`Child ${base.id} has a missing inheritance source`)
      const inherited = calculateCuriosityInheritance({
        parentIds: [firstParentId, secondParentId],
        parentValuesPermille: [
          getPersonVariable(firstParent.variables, PERSON_VARIABLE_ID.curiosity),
          getPersonVariable(secondParent.variables, PERSON_VARIABLE_ID.curiosity),
        ],
        randomVariationPermille: inheritanceRng.nextInt(1001),
      })
      setPersonVariable(variables, PERSON_VARIABLE_ID.curiosity, inherited.valuePermille)
      originTraces.push(inherited.trace)
    }
    const activity = resolveCurrentActivity({
      personId: base.id,
      ageYears: assignment.ageYears,
      locationCellId: assignment.homeCellId,
      householdId: household.id,
      householdHomeCellId: household.homeCellId,
    }, 0)
    if (!activity) throw new Error(`Initial person ${base.id} has no activity location`)
    const { initialHomeCellId: _, ...baseState } = base
    return {
      ...baseState,
      ageYears: assignment.ageYears,
      ageHoursIntoYear: ageRemainderRng.nextInt(8760),
      locationCellId: assignment.homeCellId,
      homeCellId: assignment.homeCellId,
      householdId: household.id,
      activityScheduleId: activity.scheduleId,
      currentActivity: { kind: activity.kind, locationId: activity.locationId, sinceTick: 0 },
      originTraces,
      development: { exposures: [{ ...createParentCuriosityExposureAccumulator(1), sourcePersonIds: [] }] },
      variables,
      knownCellIds: knownCells(assignment.homeCellId, byId),
    }
  })
  const peopleById = new Map(people.map((person) => [person.id, person]))
  for (const link of topology.parentChildLinks) {
    const parent = peopleById.get(link.parentId)
    const child = peopleById.get(link.childId)
    if (!parent || !child) throw new Error(`Initial parent-child link ${link.id} is invalid`)
    const minimumParentAgeHours = child.ageYears * 8760 + child.ageHoursIntoYear + 18 * 8760
    const parentAgeHours = parent.ageYears * 8760 + parent.ageHoursIntoYear
    if (parentAgeHours < minimumParentAgeHours) parent.ageYears += Math.ceil((minimumParentAgeHours - parentAgeHours) / 8760)
  }
  return {
    people,
    households: [...topology.households],
    parentChildLinks: [...topology.parentChildLinks],
    activityLocations: [...topology.activityLocations],
  }
}

function generateBasePeople(cells: readonly GeographicCell[], random: RandomProvider, count: number): BasePersonState[] {
  const rng = random.stream('population')
  const trustRng = random.stream(`population.variable.${PERSON_VARIABLE_ID.trustPropensity}`)
  const conformityRng = random.stream(`population.variable.${PERSON_VARIABLE_ID.conformity}`)
  const persistenceRng = random.stream(`population.variable.${PERSON_VARIABLE_ID.persistence}`)
  const fatigueRng = random.stream(`population.variable.${PERSON_VARIABLE_ID.fatigue}`)
  const socialConnectionRng = random.stream(`population.variable.${PERSON_VARIABLE_ID.socialConnection}`)
  const legacyHomes = cells.filter((cell) => cell.habitability >= 500 && cell.movementCost > 0)
  const legacyHomeCount = legacyHomes.length
  if (legacyHomeCount === 0) throw new Error('World has no habitable cells for population placement')
  return Array.from({ length: count }, (_, index): BasePersonState => {
    // Preserve the pre-8A population stream cadence while actual homes are selected by the placement stream.
    const legacyHomeOrdinal = rng.nextInt(legacyHomeCount)
    const initialHomeCellId = legacyHomes[legacyHomeOrdinal]?.id
    if (!initialHomeCellId) throw new Error('Unable to select a legacy home cell')
    return {
      id: `person-${(index + 1).toString().padStart(4, '0')}`,
      initialHomeCellId,
      ageYears: 18 + rng.nextInt(48),
      variables: createDefaultPersonVariableValues({
        [PERSON_VARIABLE_ID.curiosity]: drawInitialValue(PERSON_VARIABLE_ID.curiosity, rng),
        [PERSON_VARIABLE_ID.riskTolerance]: drawInitialValue(PERSON_VARIABLE_ID.riskTolerance, rng),
        [PERSON_VARIABLE_ID.sociability]: drawInitialValue(PERSON_VARIABLE_ID.sociability, rng),
        [PERSON_VARIABLE_ID.hunger]: drawInitialValue(PERSON_VARIABLE_ID.hunger, rng),
        [PERSON_VARIABLE_ID.trustPropensity]: drawInitialValue(PERSON_VARIABLE_ID.trustPropensity, trustRng),
        [PERSON_VARIABLE_ID.conformity]: drawInitialValue(PERSON_VARIABLE_ID.conformity, conformityRng),
        [PERSON_VARIABLE_ID.persistence]: drawInitialValue(PERSON_VARIABLE_ID.persistence, persistenceRng),
        [PERSON_VARIABLE_ID.fatigue]: drawInitialValue(PERSON_VARIABLE_ID.fatigue, fatigueRng),
        [PERSON_VARIABLE_ID.socialConnection]: drawInitialValue(PERSON_VARIABLE_ID.socialConnection, socialConnectionRng),
      }),
      knownCellIds: [],
    }
  })
}

function knownCells(homeCellId: string, byId: ReadonlyMap<string, GeographicCell>): string[] {
  const home = byId.get(homeCellId)
  if (!home) throw new Error(`Missing home cell ${homeCellId}`)
  return [home.id, ...hexNeighbors(home)
    .map(({ q, r }) => byId.get(`${q},${r}`))
    .filter((cell): cell is GeographicCell => Boolean(cell?.movementCost))
    .map((cell) => cell.id)]
    .sort()
}

function drawInitialValue(id: PersonVariableId, rng: ReturnType<RandomProvider['stream']>): number {
  const definition = getPersonVariableDefinition(id)
  return definition.initializationMinimum + rng.nextInt(definition.initializationMaximum - definition.initializationMinimum + 1)
}
