import type { ContentPackRuntime } from '../../contentPacks/runtime'
import type { SimulationState } from '../domain/types'
import { failCanonicalValidation as fail } from '../validation/error'
import { validatePersonVariableValues } from '../variables/storage'

/** Canonical validation owned by the detailed-population subsystem. */
export function validateDetailedPopulationState(state: SimulationState, runtime: Pick<ContentPackRuntime, 'variables'>): void {
  if (new Set(state.people.map((person) => person.id)).size !== state.people.length || state.people.some((person, index) => index > 0 && state.people[index - 1]!.id >= person.id)) fail('population', 'state.people', 'identity-or-ordering', 'Population is not uniquely canonically ordered')
  const personIds = new Set(state.people.map((person) => person.id))
  const cellsById = new Map(state.world.grid.cells.map((cell) => [cell.id, cell]))
  const cellIds = new Set(cellsById.keys())
  const locationsById = new Map(state.activityLocations.map((location) => [location.id, location]))
  const organizationIds = new Set(state.organizations.map((organization) => organization.id))
  for (const person of state.people) {
    if (!cellIds.has(person.locationCellId)) fail('population', `state.people.${person.id}.locationCellId`, 'missing-reference', `Person ${person.id} occupies a missing cell`)
    if (!cellIds.has(person.homeCellId) || (person.initialHomeCellId !== undefined && !cellIds.has(person.initialHomeCellId)) || !Array.isArray(person.knownCellIds) || person.knownCellIds.some((id, index) => !cellIds.has(id) || (index > 0 && person.knownCellIds[index - 1]! >= id))) fail('population', `state.people.${person.id}.knownCellIds`, 'home-or-known-cell-reference', `Person ${person.id} has invalid home or known cells`)
    try {
      validatePersonVariableValues(person.variables, runtime.variables)
    } catch (error) {
      fail('population', `state.people.${person.id}.variables`, 'invariant', error instanceof Error ? error.message : 'Person variables are invalid')
    }
    if (!person.knowledge || Object.keys(person.knowledge).sort().join('|') !== 'knowledge.foraging|knowledge.localTerrain') fail('population', `state.people.${person.id}.knowledge`, 'knowledge-records', `Person ${person.id} contains invalid knowledge records`)
    if (Object.values(person.knowledge).some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000)) fail('population', `state.people.${person.id}.knowledge`, 'knowledge-values', `Person ${person.id} contains invalid knowledge values`)
    if (typeof person.schoolLearningHours !== 'number' || !Number.isSafeInteger(person.schoolLearningHours) || person.schoolLearningHours < 0) fail('population', `state.people.${person.id}.schoolLearningHours`, 'school-learning-hours', `Person ${person.id} has invalid school learning hours`)
    if (person.schoolAttendance && (!organizationIds.has(person.schoolAttendance.schoolId) || !Number.isSafeInteger(person.schoolAttendance.returnTick) || person.schoolAttendance.returnTick <= state.tick)) fail('population', `state.people.${person.id}.schoolAttendance`, 'school-attendance', `Person ${person.id} has invalid school attendance state`)
    if (person.journey) {
      const destination = cellsById.get(person.journey.destinationCellId)
      if (!destination?.movementCost) fail('population', `state.people.${person.id}.journey.destinationCellId`, 'journey-destination', `Person ${person.id} is traveling to an invalid cell`)
      if (!Number.isInteger(person.journey.remainingCost) || person.journey.remainingCost <= 0 || person.journey.remainingCost > person.journey.totalCost) fail('population', `state.people.${person.id}.journey`, 'journey-progress', `Person ${person.id} has invalid journey progress`)
    }
    if (person.lastEncounter) {
      if (!personIds.has(person.lastEncounter.otherPersonId) || person.lastEncounter.otherPersonId === person.id || person.lastEncounter.tick > state.tick) fail('population', `state.people.${person.id}.lastEncounter`, 'encounter-reference', `Person ${person.id} has an invalid last encounter`)
      if (!locationsById.has(person.lastEncounter.activityLocationId) || !cellIds.has(person.lastEncounter.cellId)) fail('population', `state.people.${person.id}.lastEncounter.activityLocationId`, 'encounter-location', `Person ${person.id} has an invalid encounter activity location`)
    }
  }
}
