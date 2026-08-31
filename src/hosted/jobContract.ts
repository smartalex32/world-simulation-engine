import { schema, type Infer } from '../shared/schema'

const boundedTicks = schema.number({ integer: true, minimum: 1, maximum: 8760 })
export const HOSTED_JOB_REQUEST_CODEC = schema.object({
  jobId: schema.string({ minLength: 1, pattern: '^[a-zA-Z0-9_-]+$' }),
  totalTicks: boundedTicks,
  quantumTicks: schema.optional(boundedTicks),
  checkpointIntervalTicks: schema.optional(boundedTicks),
})

export type HostedJobRequest = Infer<typeof HOSTED_JOB_REQUEST_CODEC>
export function decodeHostedJobRequest(value: unknown): HostedJobRequest { return HOSTED_JOB_REQUEST_CODEC.decode(value, 'job') }
