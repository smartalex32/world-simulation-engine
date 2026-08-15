import type { DailyCommunityCounters } from './types'

export function createDailyCommunityCounters(): DailyCommunityCounters {
  return Object.freeze({
    windowStartTick: 0,
    windowEndTick: 0,
    exposedPersonIds: Object.freeze([]),
    encounterParticipantIds: Object.freeze([]),
    encounteredRelationshipIds: Object.freeze([]),
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
  })
}
