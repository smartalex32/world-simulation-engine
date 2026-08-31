import type { HouseholdInventory } from '../economy/types'

export type HouseholdId = string

export interface HouseholdRelocationTrace {
  tick: number
  sourceCellId: string
  destinationCellId: string
  foodAccessDeltaPermille: number
  /** Bounded pressure caused by food stores below the household reserve target. */
  foodReservePressurePermille: number
  travelCost: number
  householdTiePermille: number
  crowdingDelta: number
  riskCostPermille: number
  utilityPermille: number
  probabilityPermille: number
  randomRollPermille: number
  settlementMigration?: SettlementMigrationTrace
}

/** Runtime network asset; distinct from authored geometry and from institutions. */

export interface SettlementMigrationTrace {
  sourceSettlementId?: string
  destinationSettlementId?: string
  employmentPermille: number
  foodPermille: number
  housingPermille: number
  safetyPermille: number
  tiesPermille: number
  infrastructurePermille: number
  servicesPermille: number
  geographyPermille: number
  shockPermille: number
}

export type ParentChildLinkId = string
export type ActivityLocationId = string
export type ActivityLocationKind = 'home' | 'commons'
export type CurrentActivityKind = ActivityLocationKind | 'travel'
export type ActivityScheduleId = 'activity.schedule.child.v1' | 'activity.schedule.adolescent.v1' | 'activity.schedule.adult.v1'

export interface HouseholdState {
  id: HouseholdId
  homeCellId: string
  homeActivityLocationId: ActivityLocationId
  memberIds: string[]
  /** Household-owned goods. Natural cell food remains an unowned environmental resource. */
  inventory?: HouseholdInventory
  lastRelocation?: HouseholdRelocationTrace
}

export interface ParentChildLink {
  id: ParentChildLinkId
  householdId: HouseholdId
  parentId: string
  childId: string
}

export interface ActivityLocationState {
  id: ActivityLocationId
  kind: ActivityLocationKind
  cellId: string
  householdId?: HouseholdId
}

export interface CurrentActivityState {
  kind: CurrentActivityKind
  locationId: ActivityLocationId | null
  sinceTick: number
}

export interface CuriosityInheritanceTrace {
  modelId: 'inheritance.parental-baseline-variation.v1'
  targetId: 'person.trait.curiosity'
  parentIds: string[]
  parentalMeanPermille: number
  populationBaselinePermille: number
  randomVariationPermille: number
  parentalWeightPermille: number
  baselineWeightPermille: number
  variationWeightPermille: number
  finalValue: number
}
