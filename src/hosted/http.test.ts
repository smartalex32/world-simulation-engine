import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { createHostedHttpServer } from './http'
import { HostedSimulationJobManager } from './jobs'
import { HostedRunService } from './runService'
import { MemoryHostedRunStore } from './store'
import { DEFAULT_PREINDUSTRIAL_PACK, MemoryContentPackCatalog } from '../contentPacks'

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

describe('hosted content-pack boundary', () => {
  it('lists and accepts only validated owner-authorized packs', async () => {
    const store = new MemoryHostedRunStore(); const service = await HostedRunService.open({ runId: 'pack-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('pack-seed') }, store)
    const server = createHostedHttpServer({ runId: 'pack-run', ownerToken: 'secret', service, jobs: new HostedSimulationJobManager(service, store, 'owner', 'secret'), contentPacks: new MemoryContentPackCatalog([DEFAULT_PREINDUSTRIAL_PACK]) })
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected TCP')
    try {
      const base = `http://127.0.0.1:${address.port}`; const headers = { authorization: 'Bearer secret', 'content-type': 'application/json' }
      expect(await (await fetch(`${base}/content-packs`, { headers })).json()).toHaveLength(1)
      expect((await fetch(`${base}/content-packs`, { method: 'PUT', headers, body: JSON.stringify({ nope: true }) })).status).toBe(400)
    } finally { server.close(); await once(server, 'close') }
  })
})
