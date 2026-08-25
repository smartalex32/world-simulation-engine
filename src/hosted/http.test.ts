import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { createHostedHttpServer } from './http'
import { HostedSimulationJobManager } from './jobs'
import { HostedRunService } from './runService'
import { MemoryHostedRunStore } from './store'

describe('hosted HTTP boundary', () => {
  it('uses bounded bodies and accurate authorization/not-found status codes', async () => {
    const store = new MemoryHostedRunStore()
    const service = await HostedRunService.open({ runId: 'http-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('http-seed') }, store)
    const jobs = new HostedSimulationJobManager(service, store, 'owner', 'secret')
    const server = createHostedHttpServer({ runId: 'http-run', ownerToken: 'secret', service, jobs, maximumRequestBytes: 32 })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test server')
    const base = `http://127.0.0.1:${address.port}`
    try {
      expect((await fetch(`${base}/runs/http-run/jobs/missing`, { headers: { authorization: 'Bearer secret' } })).status).toBe(404)
      expect((await fetch(`${base}/runs/http-run/commands`, { method: 'POST', body: '{}' })).status).toBe(401)
      expect((await fetch(`${base}/runs/http-run/commands`, {
        method: 'POST', headers: { authorization: 'Bearer secret', 'content-type': 'application/json' }, body: JSON.stringify({ payload: 'x'.repeat(64) }),
      })).status).toBe(413)
      expect((await fetch(`${base}/runs/http-run/commands`, {
        method: 'POST', headers: { authorization: 'Bearer secret', 'content-type': 'application/json' }, body: '{',
      })).status).toBe(400)
    } finally {
      server.close()
      await once(server, 'close')
    }
  })
})
