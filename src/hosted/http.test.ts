import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { createHostedHttpServer } from './http'
import { HostedSimulationJobManager } from './jobs'
import { HostedRunService } from './runService'
import { MemoryHostedRunStore } from './store'
import { DEFAULT_PREINDUSTRIAL_PACK, MemoryContentPackCatalog } from '../contentPacks'
import { SharedWorldService } from './sharedWorlds'
import { HostedEventStream } from './eventStream'
import { SharedRunCoordinator } from './sharedRuns'

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

describe('shared world HTTP boundary', () => {
  it('uses sessions for authorized role, lease, revision, and audit operations', async () => {
    const store = new MemoryHostedRunStore(); const service = await HostedRunService.open({ runId: 'shared-run', ownerId: 'owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('shared-seed') }, store)
    const shared = new SharedWorldService(); const server = createHostedHttpServer({ runId: 'shared-run', ownerToken: 'secret', service, jobs: new HostedSimulationJobManager(service, store, 'owner', 'secret'), sharedWorlds: shared, eventStream: new HostedEventStream() })
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected TCP')
    try {
      const base = `http://127.0.0.1:${address.port}`; const json = { 'content-type': 'application/json' }
      expect((await fetch(`${base}/api/v1/accounts`, { method: 'POST', headers: json, body: JSON.stringify({ id: 'owner', email: 'owner@example.test', password: 'correct-horse-battery' }) })).status).toBe(201)
      const session = await (await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'owner@example.test', password: 'correct-horse-battery' }) })).json() as { token: string }
      const headers = { ...json, authorization: `Bearer ${session.token}` }
      const apiToken = await (await fetch(`${base}/api/v1/tokens`, { method: 'POST', headers, body: JSON.stringify({ id: 'read-token', scopes: ['worlds:read'] }) })).json() as { token: string }
      expect((await fetch(`${base}/api/v1/tokens`, { headers })).status).toBe(200)
      expect((await fetch(`${base}/api/v1/worlds`, { method: 'POST', headers, body: JSON.stringify({ id: 'world-1', name: 'Shared world', draft: defaultWorldCreationRequest('shared-world') }) })).status).toBe(201)
      const lease = await (await fetch(`${base}/api/v1/worlds/world-1/lease`, { method: 'POST', headers, body: '{}' })).json() as { leaseId: string; revision: number }
      const revision = await (await fetch(`${base}/api/v1/worlds/world-1/revisions`, { method: 'POST', headers, body: JSON.stringify({ leaseId: lease.leaseId, expectedRevision: lease.revision, clientMutationId: 'edit-1', payload: { terrain: 'hills' } }) })).json() as { revision: number }
      expect(revision.revision).toBe(2)
      expect((await (await fetch(`${base}/api/v1/worlds/world-1/audits`, { headers })).json()) as unknown[]).toHaveLength(3)
      expect((await fetch(`${base}/api/v1/worlds/world-1/revisions`, { method: 'POST', headers, body: JSON.stringify({ leaseId: lease.leaseId, expectedRevision: 1, clientMutationId: 'stale', payload: {} }) })).status).toBe(409)
      expect((await fetch(`${base}/api/v1/worlds/world-1`, { headers: { authorization: `Bearer ${apiToken.token}` } })).status).toBe(200)
      expect((await fetch(`${base}/api/v1/worlds`, { method: 'POST', headers: { authorization: `Bearer ${apiToken.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'forbidden', name: 'Forbidden' }) })).status).toBe(401)
      expect((await fetch(`${base}/api/v1/tokens/read-token`, { method: 'DELETE', headers })).status).toBe(204)
    } finally { server.close(); await once(server, 'close') }
  })
})

describe('shared authoritative runs', () => {
  it('commits an immutable revision into an owner-controlled server run with viewer projections', async () => {
    const store = new MemoryHostedRunStore(); const service = await HostedRunService.open({ runId: 'host', ownerId: 'host-owner', ownerToken: 'secret', creation: defaultWorldCreationRequest('host') }, store); const shared = new SharedWorldService()
    const server = createHostedHttpServer({ runId: 'host', ownerToken: 'secret', service, jobs: new HostedSimulationJobManager(service, store, 'host-owner', 'secret'), sharedWorlds: shared, eventStream: new HostedEventStream(), sharedRuns: new SharedRunCoordinator(store) })
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected TCP')
    try {
      const base = `http://127.0.0.1:${address.port}`; const json = { 'content-type': 'application/json' }
      await fetch(`${base}/api/v1/accounts`, { method: 'POST', headers: json, body: JSON.stringify({ id: 'owner', email: 'owner@example.test', password: 'correct-horse-battery' }) }); await fetch(`${base}/api/v1/accounts`, { method: 'POST', headers: json, body: JSON.stringify({ id: 'viewer', email: 'viewer@example.test', password: 'correct-horse-battery' }) })
      const ownerSession = await (await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'owner@example.test', password: 'correct-horse-battery' }) })).json() as { token: string }; const viewerSession = await (await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'viewer@example.test', password: 'correct-horse-battery' }) })).json() as { token: string }
      const ownerHeaders = { ...json, authorization: `Bearer ${ownerSession.token}` }; const viewerHeaders = { ...json, authorization: `Bearer ${viewerSession.token}` }
      await fetch(`${base}/api/v1/worlds`, { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ id: 'world-1', name: 'Shared world', draft: defaultWorldCreationRequest('shared') }) }); await fetch(`${base}/api/v1/worlds/world-1/members`, { method: 'PUT', headers: ownerHeaders, body: JSON.stringify({ accountId: 'viewer', role: 'viewer' }) })
      expect((await fetch(`${base}/api/v1/worlds/world-1/runs`, { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ revision: 1, runId: 'shared-run' }) })).status).toBe(201)
      expect((await (await fetch(`${base}/api/v1/worlds/world-1/runs`, { headers: viewerHeaders })).json() as { runId: string }[]).map((run) => run.runId)).toEqual(['shared-run'])
      expect((await fetch(`${base}/api/v1/worlds/world-1/runs/shared-run/projection`, { headers: viewerHeaders })).status).toBe(200)
      expect((await fetch(`${base}/api/v1/worlds/world-1/runs/shared-run/commands`, { method: 'POST', headers: viewerHeaders, body: JSON.stringify({ type: 'STEP', requestId: 'viewer-step' }) })).status).toBe(401)
      expect((await fetch(`${base}/api/v1/worlds/world-1/runs/shared-run/commands`, { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ type: 'STEP', requestId: 'owner-step' }) })).status).toBe(200)
      expect(((await (await fetch(`${base}/api/v1/worlds/world-1/audits`, { headers: ownerHeaders })).json()) as { action: string }[]).some((entry) => entry.action === 'run.command.step')).toBe(true)
    } finally { server.close(); await once(server, 'close') }
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
