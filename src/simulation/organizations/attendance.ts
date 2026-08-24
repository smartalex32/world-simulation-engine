import type { GeographicCell, HouseholdState, OrganizationState, PersonState, SchoolAttendanceTrace } from '../domain/types'
import { ROAD_MOVEMENT_COST_MULTIPLIER_PERMILLE } from '../agents/actionConfig'
import { findPathDetailed } from '../spatial/pathfinding'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { getPersonVariable } from '../variables/storage'

/** Bounded daily service access. Values are integer permille or movement-cost units. */
export const SCHOOL_ATTENDANCE = { startHour: 8, durationHours: 8, maximumPathExpansions: 240, maximumTravelCost: 12_000, baseProbabilityPermille: 250, traitWeightPermille: 250, householdCapacityWeightPermille: 250, travelCostDivisor: 16, serviceCapacity: 24 } as const
/** A dedicated stream prevents attendance choices from perturbing actions or life-cycle draws. */
export const SCHOOL_ATTENDANCE_STREAM = 'organization.school.attendance' as const

export interface SchoolAttendanceEvaluation { readonly school: OrganizationState; readonly person: PersonState; readonly householdCapacityPermille: number; readonly travelCost: number | null; readonly probabilityPermille: number; readonly reason: SchoolAttendanceTrace['reason'] }

export function evaluateSchoolAttendance(input: { readonly school: OrganizationState; readonly person: PersonState; readonly household: HouseholdState | undefined; readonly peopleById: ReadonlyMap<string, PersonState>; readonly cells: readonly GeographicCell[]; readonly roadCellIds: ReadonlySet<string>; readonly travelCost?: number | null }): SchoolAttendanceEvaluation {
  const householdCapacityPermille = input.household?.memberIds.some((id) => { const member = input.peopleById.get(id); return member !== undefined && member.lifeStatus !== 'dead' && member !== input.person && member.ageYears >= 18 }) ? 1000 : 0
  const travelCost = input.travelCost === undefined ? schoolTravelCost(input.person.homeCellId, input.school.locationCellId, input.cells, input.roadCellIds) : input.travelCost
  if (travelCost === null) return { school: input.school, person: input.person, householdCapacityPermille, travelCost: null, probabilityPermille: 0, reason: 'no-route' }
  if (householdCapacityPermille === 0) return { school: input.school, person: input.person, householdCapacityPermille, travelCost, probabilityPermille: 0, reason: 'no-household-capacity' }
  if (travelCost > SCHOOL_ATTENDANCE.maximumTravelCost) return { school: input.school, person: input.person, householdCapacityPermille, travelCost, probabilityPermille: 0, reason: 'too-distant' }
  const curiosity = getPersonVariable(input.person.variables, PERSON_VARIABLE_ID.curiosity)
  const persistence = getPersonVariable(input.person.variables, PERSON_VARIABLE_ID.persistence)
  const traitContribution = Math.floor((curiosity + persistence) * SCHOOL_ATTENDANCE.traitWeightPermille / 2000)
  const householdContribution = Math.floor(householdCapacityPermille * SCHOOL_ATTENDANCE.householdCapacityWeightPermille / 1000)
  const travelPenalty = Math.floor(travelCost / SCHOOL_ATTENDANCE.travelCostDivisor)
  const probabilityPermille = clamp(SCHOOL_ATTENDANCE.baseProbabilityPermille + traitContribution + householdContribution - travelPenalty, 0, 1000)
  return { school: input.school, person: input.person, householdCapacityPermille, travelCost, probabilityPermille, reason: 'available' }
}

/** Pure and cacheable because home, school, terrain, and authored roads are explicit inputs. */
export function schoolTravelCost(homeCellId: string, schoolCellId: string, cells: readonly GeographicCell[], roadCellIds: ReadonlySet<string>): number | null {
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  const pathResult = findPathDetailed({ width: 0, height: 0, cells: [...cells] }, homeCellId, schoolCellId, { cellById: cellsById, maxExpansions: SCHOOL_ATTENDANCE.maximumPathExpansions })
  if (pathResult.truncated || !pathResult.path) return null
  return pathResult.path.cellIds.slice(1).reduce((total, cellId) => { const cell = cellsById.get(cellId); if (!cell) return total; const multiplier = roadCellIds.has(cellId) ? ROAD_MOVEMENT_COST_MULTIPLIER_PERMILLE : 1000; return total + Math.floor(cell.movementCost * multiplier / 1000) }, 0)
}

export function schoolAttendanceTrace(evaluation: SchoolAttendanceEvaluation, tick: number, randomRollPermille: number, attended: boolean, reason = evaluation.reason): SchoolAttendanceTrace {
  return { tick, schoolId: evaluation.school.id, schoolCellId: evaluation.school.locationCellId, travelCost: evaluation.travelCost, householdCapacityPermille: evaluation.householdCapacityPermille, curiosityPermille: getPersonVariable(evaluation.person.variables, PERSON_VARIABLE_ID.curiosity), persistencePermille: getPersonVariable(evaluation.person.variables, PERSON_VARIABLE_ID.persistence), probabilityPermille: evaluation.probabilityPermille, randomRollPermille, attended, reason }
}
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)) }
