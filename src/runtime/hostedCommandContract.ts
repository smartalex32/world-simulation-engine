import { schema, type Infer } from '../shared/schema'

const requestId = schema.string({ minLength: 1 })
const positiveInteger = schema.number({ integer: true, minimum: 1 })
const nonNegativeInteger = schema.number({ integer: true, minimum: 0 })
const nonEmptyText = schema.string({ minLength: 1 })

export const MAP_PROJECTION_REQUEST_CODEC = schema.object({
  revision: nonNegativeInteger,
  bounds: schema.object({ minQ: schema.number({ integer: true }), maxQ: schema.number({ integer: true }), minR: schema.number({ integer: true }), maxR: schema.number({ integer: true }) }),
  projectedHexRadius: schema.number({ minimum: 0 }),
  overlay: schema.enum(['terrain', 'elevation', 'habitability', 'movement', 'food', 'population', 'community']),
  communityMeasureId: schema.optional(schema.enum(['community.emergent.socialTrust', 'community.emergent.cohesion', 'community.emergent.cooperation', 'community.emergent.conflict', 'community.emergent.innovationClimate', 'community.structural.foodSecurity'])),
  focusCellId: schema.optional(nonEmptyText),
  hookedPersonId: schema.optional(nonEmptyText),
})

export const HOSTED_RUN_COMMAND_CODECS = {
  STEP: schema.object({ type: schema.literal('STEP'), requestId, count: schema.optional(positiveInteger) }),
  PAUSE: schema.object({ type: schema.literal('PAUSE'), requestId }),
  SET_SPEED: schema.object({ type: schema.literal('SET_SPEED'), requestId, ticksPerBatch: positiveInteger }),
  SET_VIEWPORT: schema.object({ type: schema.literal('SET_VIEWPORT'), requestId, viewport: MAP_PROJECTION_REQUEST_CODEC }),
  REQUEST_SNAPSHOT: schema.object({ type: schema.literal('REQUEST_SNAPSHOT'), requestId }),
  RESET: schema.object({ type: schema.literal('RESET'), requestId }),
  MATERIALIZE_COHORT: schema.object({ type: schema.literal('MATERIALIZE_COHORT'), requestId, cohortId: nonEmptyText, populationCount: positiveInteger }),
  DEMATERIALIZE_PEOPLE: schema.object({ type: schema.literal('DEMATERIALIZE_PEOPLE'), requestId, personIds: schema.array(nonEmptyText) }),
  SET_PROTECTED_PEOPLE: schema.object({ type: schema.literal('SET_PROTECTED_PEOPLE'), requestId, personIds: schema.array(nonEmptyText) }),
} as const

export const HOSTED_RUN_COMMAND_CODEC = schema.union(Object.values(HOSTED_RUN_COMMAND_CODECS))
export type HostedRunCommandContract = Infer<typeof HOSTED_RUN_COMMAND_CODEC>

export function decodeHostedRunCommand(value: unknown): HostedRunCommandContract {
  const command = HOSTED_RUN_COMMAND_CODEC.decode(value, 'command')
  if (command.type === 'SET_VIEWPORT' && (command.viewport.bounds.minQ > command.viewport.bounds.maxQ || command.viewport.bounds.minR > command.viewport.bounds.maxR)) throw new Error('command viewport bounds are invalid')
  return command
}
