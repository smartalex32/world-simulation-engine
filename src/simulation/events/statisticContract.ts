import { schema } from '../../shared/schema'
import type { CommunityStatisticMetricId, StatisticSample, WorldStatisticMetricId } from './types'

const common = {
  runId: schema.string({ minLength: 1 }),
  tick: schema.number({ integer: true, minimum: 0 }),
  metricVersion: schema.literal(1),
  metricId: schema.string({ minLength: 1 }),
  value: schema.number(),
} as const

const wireCodec = schema.union([
  schema.object({ ...common, scope: schema.literal('world') }),
  schema.object({ ...common, scope: schema.literal('community'), scopeId: schema.string({ minLength: 1 }) }),
])

/** Statistic IDs remain forward-compatible on import; scope and envelope shape do not. */
export const STATISTIC_SAMPLE_CODEC = schema.custom<StatisticSample>(wireCodec.schema, (value, path) => {
  const decoded = wireCodec.decode(value, path)
  return decoded.scope === 'world'
    ? { ...decoded, metricId: decoded.metricId as WorldStatisticMetricId }
    : { ...decoded, metricId: decoded.metricId as CommunityStatisticMetricId }
})

export function decodeStatisticSample(value: unknown, runId?: string): StatisticSample {
  const sample = STATISTIC_SAMPLE_CODEC.decode(value, 'statistic')
  if (runId !== undefined && sample.runId !== runId) throw new Error('Statistic run binding is invalid')
  return sample
}
