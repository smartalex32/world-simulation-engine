export const ACTION_WEIGHT_MINIMUM = 1
export const ACTION_WEIGHT_MAXIMUM = 10_000

export const ACTION_BASE_WEIGHT = Object.freeze({
  eat: 30,
  move: 110,
  explore: 40,
  rest: 120,
  socialize: 20,
  work: 55,
} as const)

export const LOCAL_FOOD_WEIGHT_CAP = 300
export const DESTINATION_FOOD_WEIGHT_PERMILLE = 350
export const MOVE_TRAVEL_COST_DIVISOR = 3
export const NIGHTTIME_REST_WEIGHT = 450
export const HOME_REST_WEIGHT = 80
export const OTHER_OCCUPANT_SOCIAL_WEIGHT = 90
export const PLAIN_MOVEMENT_COST = 1000
/** Road cells lower effective travel cost; roads remain owned by no person or polity. */
export const ROAD_MOVEMENT_COST_MULTIPLIER_PERMILLE = 650
export const HOURLY_TRAVEL_BUDGET = 1000

export const HOURLY_HUNGER_INCREASE = 12
export const HOURLY_FATIGUE_INCREASE = 10
export const HOURLY_SOCIAL_NEED_INCREASE = 8
export const REST_FATIGUE_RECOVERY = 180
export const ENCOUNTER_SOCIAL_NEED_RECOVERY = 140
export const FOOD_TO_HUNGER_RECOVERY = 2
export const WORK_FATIGUE_COST = 55
