import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { PostgresHostedRunStore } from './postgres'
import { HostedRunService } from './runService'

const databaseUrl = process.env.TEST_DATABASE_URL
const testIfDatabase = databaseUrl ? describe : describe.skip

testIfDatabase('PostgreSQL hosted persistence integration', () => {
  const storePromise = PostgresHostedRunStore.connect(databaseUrl!)

  beforeEach(async () => {
    const store = await storePromise
    await store.initialize()
    await store.pool.query('TRUNCATE hosted_telemetry_batches, hosted_jobs, hosted_runs CASCADE')
  })

  afterAll(async () => { await (await storePromise).close() })

  it('atomically restores a persisted run and its telemetry batch', async () => {
    const store = await storePromise
    const bootstrap = { runId: 'postgres-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('postgres-seed') }
    const first = await HostedRunService.open(bootstrap, store)
    await first.execute('secret', { type: 'STEP', requestId: 'step', count: 24 })
    const persisted = await store.load('postgres-run')
    expect(persisted?.snapshot.state.tick).toBe(24)
    const telemetry = await store.pool.query<{ event_count: number; statistic_count: number }>('SELECT event_count, statistic_count FROM hosted_telemetry_batches WHERE run_id = $1', ['postgres-run'])
    expect(telemetry.rows).toHaveLength(1)
    expect(telemetry.rows[0]?.event_count).toBeGreaterThan(0)

    const recovered = await HostedRunService.open(bootstrap, store)
    const observation = await recovered.observe('secret')
    expect(observation.tick).toBe(24)
    expect(observation.digest).toBe(persisted?.snapshot.digest)
  })
})
