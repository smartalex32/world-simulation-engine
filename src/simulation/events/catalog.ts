export type EventRetentionClass = 'durable' | 'bounded' | 'sampled'
export const EVENT_CATALOG_VERSION = 1
export type EventPrimitive = string | number | boolean | null
export type EventPrimitiveRecord = Record<string, EventPrimitive | undefined>

type EmptyPayload = Record<never, never>
type PersonPayload = { personId: string }
type PersonActionPayload = PersonPayload & {
  fromCellId: string
  targetCellId: string | null
  actionWeight: number | null
  probabilityPermille: number | null
  foodConsumed?: number
  foodProduced?: number
  agriculturalFoodProduced?: number
  hungerReduced?: number
  fatigueReduced?: number
  travelCost: number
}

export interface SimulationEventPayloadMap {
  RUN_CREATED: { seed: string; width: number; height: number; population: number; worldName: string }
  RUN_STARTED: EmptyPayload
  RUN_PAUSED: EmptyPayload
  CLOCK_ADVANCED: { hours: number; currentTick: number }
  SNAPSHOT_SAVED: { name?: string; kind?: string }
  RUN_LOADED: EmptyPayload
  COHORT_MATERIALIZED: { cohortId: string; populationCount: number; transitionId?: string }
  PEOPLE_DEMATERIALIZED: { cohortId: string; populationCount: number; transitionId?: string }
  INFRASTRUCTURE_UPDATED: { assetId: string; kind: string; householdId?: string; units?: number; capacity?: number; conditionPermille?: number; disruptionPermille?: number; reason?: string }
  SETTLEMENT_REGIONAL_TRANSITION: { kind: string; reason: string; settlementId?: string; previousStatus?: string; nextStatus?: string; sourceSettlementId?: string; destinationSettlementId?: string; populationCount?: number }
  FICTIONAL_INFECTION_ACQUIRED: { personId: string | null; pathogenId: string; sourcePersonId: string | null; probabilityPermille: number; randomRollPermille: number }
  FICTIONAL_INFECTION_PROGRESS: { pathogenId: string; kind: string; sourcePersonId: string | null }
  COHORT_OUTBREAK_UPDATED: { pathogenId: string; mortalityCount?: number; susceptibleCount?: number; newIncubatingCount?: number; becameInfectiousCount?: number; recoveredCount?: number }
  PERSON_STARTED_TRAVEL: PersonActionPayload
  PERSON_MOVED: PersonActionPayload
  PERSON_ATE: PersonActionPayload
  PERSON_FAILED_TO_EAT: PersonActionPayload
  PERSON_WORKED: PersonActionPayload | { householdId: string; recipeId: string; laborHours: number; outputUnits: number } | { householdId: string; marketId: string; wageUnits: number; workerCount: number }
  HOUSEHOLDS_SHARED_FOOD: { donorHouseholdId: string; recipientHouseholdId: string; foodAmount: number }
  HOUSEHOLDS_EXCHANGED_TOOLS: { marketId: string; donorHouseholdId?: string; recipientHouseholdId?: string; toolAmount?: number; sellerHouseholdId?: string; buyerHouseholdId?: string; goodId?: string; quantity?: number; unitPriceUnits?: number; transportCostUnits?: number; taxUnits?: number }
  HOUSEHOLD_RELOCATED: { householdId: string; sourceCellId: string; destinationCellId: string; foodAccessDeltaPermille: number; travelCost: number; householdTiePermille: number; crowdingDelta: number; destinationSettlementId: string | null; sourceSettlementId: string | null; servicesPermille: number; infrastructurePermille: number; riskCostPermille: number; utilityPermille: number; probabilityPermille: number; randomRollPermille: number }
  SETTLEMENT_SCALE_CHANGED: { settlementId: string; previousScale: string; nextScale: string; population: number; densityPerHomeCell: number; resourceUnitsPerResident: number; accessPermille: number }
  COMMUNITY_CONTENTION_RESOLVED: { communityId: string; disputeId?: string; kind?: string; grievanceBefore?: number; grievanceAfter?: number; legitimacyPermille?: number }
  PERSON_ATTENDED_SCHOOL: PersonPayload & { schoolId: string; schoolCellId: string; travelCost: number | null; probabilityPermille: number; randomRollPermille: number; learningHours: number }
  PERSON_MISSED_SCHOOL: PersonPayload & { schoolId: string; reason: string; travelCost?: number | null; probabilityPermille?: number; randomRollPermille: number }
  ORGANIZATION_FORMED: { organizationId: string; kindId: string; locationCellId: string; probabilityPermille: number; randomRollPermille: number }
  ORGANIZATION_MEMBERSHIP_CHANGED: PersonPayload & { organizationId: string; change: string; roleId?: string; probabilityPermille: number; randomRollPermille: number }
  PERSON_EXPLORED: PersonActionPayload
  PERSON_RESTED: PersonActionPayload
  PERSON_SOCIALIZED: PersonActionPayload
  PERSON_ACTIVITY_CHANGED: PersonPayload & { previousKind: string; previousLocationId: string | null; currentKind: string; currentLocationId: string | null }
  PERSON_AGED: PersonPayload & { ageYears: number }
  PERSON_LIFE_STAGE_CHANGED: PersonPayload & { previousLifeStage: string; nextLifeStage: string; ageYears: number }
  PERSON_DIED: PersonPayload & { ageYears: number; mortalityPermille: number; baseMortalityPermille: number; healthMortalityRiskPermille: number; diseaseMortalityPermille: number }
  PARTNERSHIP_FORMED: { firstPersonId: string; secondPersonId: string; householdId: string }
  PERSON_MOVED_HOUSEHOLD: PersonPayload & { previousHouseholdId: string; householdId: string; homeCellId: string }
  PERSON_BORN: PersonPayload & { householdId: string; parentIds: string }
  PERSON_ENCOUNTERED: PersonPayload & { otherPersonId: string; cellId: string; activityLocationId: string; outcome: string; outcomeWeight: number; totalOutcomeWeight: number; probabilityPermille: number; familiarityBefore: number; familiarityAfter: number }
  RELATIONSHIP_FORMED: PersonPayload & { personAId: string; personBId: string; cellId: string; activityLocationId: string }
  PERSON_KNOWLEDGE_DISCOVERED: PersonPayload & { knowledgeId?: string; techniqueId?: string; source?: string; previousValue?: number; gain?: number; currentValue?: number; knowledgePermille?: number; toolCost?: number; successRollPermille?: number }
  PERSON_KNOWLEDGE_SHARED: PersonPayload & { sourcePersonId: string; knowledgeId: string; previousValue: number; sourceValue: number; relationshipTrust: number; gain: number; currentValue: number }
  PERSON_EXPERIENCED_PARENT_MODELING: PersonPayload & { householdId: string; experienceId: string; activityLocationId: string; sourcePersonIds: string; sourcePersonCount: number; recipientHours: number; sourceHours: number; sourceMeanPermille: number; exposureStrengthPermille: number }
  PERSON_EXPERIENCED_PEER_MODELING: PersonPayload & { experienceId: string; targetId: string; sourceHours: number; sourceMeanPermille: number; exposureStrengthPermille: number; sourceContextId: string | null }
  PERSON_EXPERIENCED_ACTIVITY_PRACTICE: PersonPayload & { experienceId: string; targetId: string; sourceHours: number; sourceMeanPermille: number; exposureStrengthPermille: number; sourceContextId: string | null }
  PERSON_EXPERIENCED_COMMUNITY_EXPOSURE: PersonPayload & { experienceId: string; targetId: string; sourceHours: number; sourceMeanPermille: number; exposureStrengthPermille: number; sourceContextId: string | null }
  PERSON_VARIABLE_DEVELOPED: PersonPayload & { experienceId: string; edgeId: string; targetId: string; previousValue: number; sourceValuePermille: number; gapPermille: number; exposureStrengthPermille: number; ageBand: string; plasticityPermille: number; applicationProbabilityPermille: number; requestedDelta: number; appliedDelta: number; currentValue: number }
  COMMUNITY_MEASURES_UPDATED: { communityId: string; communityName: string; windowStartTick: number; windowEndTick: number; exposedPersonHours: number; encounters: number; foodSecurityPermille: number; foodSecurityDeltaPermille: number; socialTrustPermille?: number; socialTrustDeltaPermille?: number; cohesionPermille?: number; cohesionDeltaPermille?: number; cooperationPermille?: number; cooperationDeltaPermille?: number; conflictPermille?: number; conflictDeltaPermille?: number; innovationClimatePermille?: number; innovationClimateDeltaPermille?: number }
  ERROR: { message: string; code?: string }
}

export type SimulationEventType = keyof SimulationEventPayloadMap
export type SimulationEventPayload<T extends SimulationEventType> = SimulationEventPayloadMap[T] & EventPrimitiveRecord

export interface EventCatalogEntry<T extends SimulationEventType = SimulationEventType> {
  version: 1
  retention: EventRetentionClass
  /** Maximum retained occurrences per event type at an eligible sampling tick. Durable events are unlimited. */
  batchLimit?: number
  /** Absolute simulation-time sampling interval. This keeps retention stable across worker batch splits and restarts. */
  sampleEveryHours?: number
  /** Initial evidence window retained before periodic sampling begins. */
  initialSampleHours?: number
  /** Public payload schema generated from the same required-field contract as decode(). */
  payloadSchema: Readonly<Record<string, unknown>>
  decode(value: unknown): SimulationEventPayload<T>
}

type FieldKind = 'string' | 'number' | 'boolean'
type RequiredFields = Readonly<Record<string, FieldKind>>

function codec<T extends SimulationEventType>(type: T, alternatives: readonly RequiredFields[]): (value: unknown) => SimulationEventPayload<T> {
  return (value) => {
    if (!isPrimitiveRecord(value) || !alternatives.some((fields) => fieldsMatch(value, fields))) throw new Error(`Event ${type} payload is invalid`)
    return value as SimulationEventPayload<T>
  }
}

function entry<T extends SimulationEventType>(type: T, retention: EventRetentionClass, alternatives: readonly RequiredFields[] = [{}], batchLimit?: number): EventCatalogEntry<T> {
  const sampleEveryHours = retention === 'bounded' ? 24 : retention === 'sampled' ? 168 : undefined
  const initialSampleHours = retention === 'bounded' ? 24 : retention === 'sampled' ? 1 : undefined
  return { version: 1, retention, ...(batchLimit === undefined ? {} : { batchLimit }), ...(sampleEveryHours === undefined ? {} : { sampleEveryHours, initialSampleHours }), payloadSchema: eventPayloadSchema(alternatives), decode: codec(type, alternatives) }
}

const primitiveSchema = { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] } as const

function eventPayloadSchema(alternatives: readonly RequiredFields[]): Readonly<Record<string, unknown>> {
  const variants = alternatives.map((fields) => ({
    type: 'object',
    properties: Object.fromEntries(Object.entries(fields).map(([name, kind]) => [name, { type: kind }])),
    required: Object.keys(fields),
    additionalProperties: primitiveSchema,
  }))
  return Object.freeze(variants.length === 1 ? variants[0]! : { oneOf: variants })
}

const person = { personId: 'string' } as const
const action = { ...person, fromCellId: 'string', travelCost: 'number' } as const

export const EVENT_CATALOG = {
  RUN_CREATED: entry('RUN_CREATED', 'durable', [{ seed: 'string', width: 'number', height: 'number', population: 'number', worldName: 'string' }]),
  RUN_STARTED: entry('RUN_STARTED', 'durable'), RUN_PAUSED: entry('RUN_PAUSED', 'durable'),
  CLOCK_ADVANCED: entry('CLOCK_ADVANCED', 'bounded', [{ hours: 'number', currentTick: 'number' }], 100),
  SNAPSHOT_SAVED: entry('SNAPSHOT_SAVED', 'durable'), RUN_LOADED: entry('RUN_LOADED', 'durable'),
  COHORT_MATERIALIZED: entry('COHORT_MATERIALIZED', 'durable', [{ cohortId: 'string', populationCount: 'number' }]),
  PEOPLE_DEMATERIALIZED: entry('PEOPLE_DEMATERIALIZED', 'durable', [{ cohortId: 'string', populationCount: 'number' }]),
  INFRASTRUCTURE_UPDATED: entry('INFRASTRUCTURE_UPDATED', 'durable', [{ assetId: 'string', kind: 'string' }]),
  SETTLEMENT_REGIONAL_TRANSITION: entry('SETTLEMENT_REGIONAL_TRANSITION', 'durable', [{ kind: 'string', reason: 'string' }]),
  FICTIONAL_INFECTION_ACQUIRED: entry('FICTIONAL_INFECTION_ACQUIRED', 'durable', [{ pathogenId: 'string', probabilityPermille: 'number', randomRollPermille: 'number' }]),
  FICTIONAL_INFECTION_PROGRESS: entry('FICTIONAL_INFECTION_PROGRESS', 'bounded', [{ pathogenId: 'string', kind: 'string' }], 100),
  COHORT_OUTBREAK_UPDATED: entry('COHORT_OUTBREAK_UPDATED', 'bounded', [{ pathogenId: 'string' }], 100),
  PERSON_STARTED_TRAVEL: entry('PERSON_STARTED_TRAVEL', 'sampled', [action], 20), PERSON_MOVED: entry('PERSON_MOVED', 'sampled', [action], 20),
  PERSON_ATE: entry('PERSON_ATE', 'sampled', [action], 20), PERSON_FAILED_TO_EAT: entry('PERSON_FAILED_TO_EAT', 'bounded', [action], 100),
  PERSON_WORKED: entry('PERSON_WORKED', 'sampled', [action, { householdId: 'string', recipeId: 'string', laborHours: 'number', outputUnits: 'number' }, { householdId: 'string', marketId: 'string', wageUnits: 'number', workerCount: 'number' }], 20),
  HOUSEHOLDS_SHARED_FOOD: entry('HOUSEHOLDS_SHARED_FOOD', 'bounded', [{ donorHouseholdId: 'string', recipientHouseholdId: 'string', foodAmount: 'number' }], 100),
  HOUSEHOLDS_EXCHANGED_TOOLS: entry('HOUSEHOLDS_EXCHANGED_TOOLS', 'bounded', [{ marketId: 'string' }], 100),
  HOUSEHOLD_RELOCATED: entry('HOUSEHOLD_RELOCATED', 'durable', [{ householdId: 'string', sourceCellId: 'string', destinationCellId: 'string' }]),
  SETTLEMENT_SCALE_CHANGED: entry('SETTLEMENT_SCALE_CHANGED', 'durable', [{ settlementId: 'string', previousScale: 'string', nextScale: 'string' }]),
  COMMUNITY_CONTENTION_RESOLVED: entry('COMMUNITY_CONTENTION_RESOLVED', 'durable', [{ communityId: 'string' }]),
  PERSON_ATTENDED_SCHOOL: entry('PERSON_ATTENDED_SCHOOL', 'bounded', [{ ...person, schoolId: 'string', schoolCellId: 'string' }], 100),
  PERSON_MISSED_SCHOOL: entry('PERSON_MISSED_SCHOOL', 'bounded', [{ ...person, schoolId: 'string', reason: 'string' }], 100),
  ORGANIZATION_FORMED: entry('ORGANIZATION_FORMED', 'durable', [{ organizationId: 'string', kindId: 'string', locationCellId: 'string', probabilityPermille: 'number', randomRollPermille: 'number' }]),
  ORGANIZATION_MEMBERSHIP_CHANGED: entry('ORGANIZATION_MEMBERSHIP_CHANGED', 'durable', [{ ...person, organizationId: 'string', change: 'string', probabilityPermille: 'number', randomRollPermille: 'number' }]),
  PERSON_EXPLORED: entry('PERSON_EXPLORED', 'bounded', [action], 100), PERSON_RESTED: entry('PERSON_RESTED', 'sampled', [action], 20), PERSON_SOCIALIZED: entry('PERSON_SOCIALIZED', 'sampled', [action], 20),
  PERSON_ACTIVITY_CHANGED: entry('PERSON_ACTIVITY_CHANGED', 'sampled', [{ ...person, previousKind: 'string', currentKind: 'string' }], 20),
  PERSON_AGED: entry('PERSON_AGED', 'durable', [{ ...person, ageYears: 'number' }]),
  PERSON_LIFE_STAGE_CHANGED: entry('PERSON_LIFE_STAGE_CHANGED', 'durable', [{ ...person, previousLifeStage: 'string', nextLifeStage: 'string' }]),
  PERSON_DIED: entry('PERSON_DIED', 'durable', [{ ...person, ageYears: 'number' }]), PARTNERSHIP_FORMED: entry('PARTNERSHIP_FORMED', 'durable', [{ firstPersonId: 'string', secondPersonId: 'string', householdId: 'string' }]),
  PERSON_MOVED_HOUSEHOLD: entry('PERSON_MOVED_HOUSEHOLD', 'durable', [{ ...person, previousHouseholdId: 'string', householdId: 'string' }]), PERSON_BORN: entry('PERSON_BORN', 'durable', [{ ...person, householdId: 'string', parentIds: 'string' }]),
  PERSON_ENCOUNTERED: entry('PERSON_ENCOUNTERED', 'bounded', [{ ...person, otherPersonId: 'string', cellId: 'string', outcome: 'string' }], 100), RELATIONSHIP_FORMED: entry('RELATIONSHIP_FORMED', 'durable', [{ ...person, personAId: 'string', personBId: 'string' }]),
  PERSON_KNOWLEDGE_DISCOVERED: entry('PERSON_KNOWLEDGE_DISCOVERED', 'durable', [person]), PERSON_KNOWLEDGE_SHARED: entry('PERSON_KNOWLEDGE_SHARED', 'bounded', [{ ...person, sourcePersonId: 'string', knowledgeId: 'string' }], 100),
  PERSON_EXPERIENCED_PARENT_MODELING: entry('PERSON_EXPERIENCED_PARENT_MODELING', 'bounded', [{ ...person, experienceId: 'string', householdId: 'string' }], 100),
  PERSON_EXPERIENCED_PEER_MODELING: entry('PERSON_EXPERIENCED_PEER_MODELING', 'bounded', [{ ...person, experienceId: 'string', targetId: 'string' }], 100),
  PERSON_EXPERIENCED_ACTIVITY_PRACTICE: entry('PERSON_EXPERIENCED_ACTIVITY_PRACTICE', 'bounded', [{ ...person, experienceId: 'string', targetId: 'string' }], 100),
  PERSON_EXPERIENCED_COMMUNITY_EXPOSURE: entry('PERSON_EXPERIENCED_COMMUNITY_EXPOSURE', 'bounded', [{ ...person, experienceId: 'string', targetId: 'string' }], 100),
  PERSON_VARIABLE_DEVELOPED: entry('PERSON_VARIABLE_DEVELOPED', 'bounded', [{ ...person, experienceId: 'string', targetId: 'string', appliedDelta: 'number' }], 100),
  COMMUNITY_MEASURES_UPDATED: entry('COMMUNITY_MEASURES_UPDATED', 'durable', [{ communityId: 'string', communityName: 'string', windowStartTick: 'number', windowEndTick: 'number' }]),
  ERROR: entry('ERROR', 'durable', [{ message: 'string' }]),
} satisfies { [T in SimulationEventType]: EventCatalogEntry<T> }

export function decodeEventPayload<T extends SimulationEventType>(type: T, version: number, value: unknown): SimulationEventPayload<T> {
  const definition = EVENT_CATALOG[type]
  if (version !== definition.version) throw new Error(`Unsupported ${type} event version: ${version}`)
  return definition.decode(value) as SimulationEventPayload<T>
}

function isPrimitiveRecord(value: unknown): value is EventPrimitiveRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every((item) => item === undefined || item === null || typeof item === 'string' || typeof item === 'number' && Number.isFinite(item) || typeof item === 'boolean')
}

function fieldsMatch(value: EventPrimitiveRecord, fields: RequiredFields): boolean {
  return Object.entries(fields).every(([key, kind]) => typeof value[key] === kind)
}
