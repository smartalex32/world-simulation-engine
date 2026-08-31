import { describe, expect, it } from 'vitest'
import { HOSTED_JOB_RECORD_CODEC, HOSTED_RUN_RECORD_CODEC, validateHostedJob, validateHostedRunRecord } from './types'

describe('hosted persistence validation', () => {
  it('rejects malformed run and job records before they become authoritative', () => {
    expect(() => validateHostedRunRecord({ protocolVersion: 1, runId: '../escape', ownerId: 'owner', savedAt: 'now', snapshot: { digest: 'digest', state: { tick: 0 } } })).toThrow('invalid')
    expect(() => validateHostedJob({ version: 2, jobId: 'job', runId: 'run', ownerId: 'owner', status: 'running' })).toThrow('invalid')
    expect(HOSTED_RUN_RECORD_CODEC.schema).toBeDefined()
    expect(HOSTED_JOB_RECORD_CODEC.schema).toBeDefined()
  })
})
