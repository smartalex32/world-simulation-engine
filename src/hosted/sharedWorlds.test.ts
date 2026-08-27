import { describe, expect, it } from 'vitest'
import { SharedWorldService } from './sharedWorlds'

describe('shared worlds', () => {
  it('enforces membership, a renewable single-editor lease, immutable revisions, and audit evidence', async () => {
    const service = new SharedWorldService(); const now = '2026-01-01T00:00:00.000Z'
    await service.createAccount('owner', 'owner@example.test', 'correct-horse-battery', now); await service.createAccount('editor', 'editor@example.test', 'correct-horse-battery', now); await service.createAccount('viewer', 'viewer@example.test', 'correct-horse-battery', now)
    service.createWorld('world-1', 'Test world', 'owner', { terrain: 'plain' }, now); service.addMember('world-1', 'owner', 'editor', 'editor', now); service.addMember('world-1', 'owner', 'viewer', 'viewer', now)
    const lease = service.acquireLease('world-1', 'editor', now); expect(() => service.acquireLease('world-1', 'owner', now)).toThrow('lease')
    const revision = service.saveRevision('world-1', 'editor', lease.leaseId, 1, 'terrain-hills', { terrain: 'hills' }, now); expect(revision).toMatchObject({ revision: 2, parentRevision: 1, canonicalDigest: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(service.saveRevision('world-1', 'editor', lease.leaseId, 1, 'terrain-hills', { terrain: 'wrong-retry-payload' }, now)).toEqual(revision)
    expect(() => service.saveRevision('world-1', 'editor', lease.leaseId, 1, 'stale-edit', {}, now)).toThrow('stale')
    expect(service.listRevisions('world-1', 'viewer')).toHaveLength(2); expect(service.listAudits('world-1', 'viewer').map((entry) => entry.action)).toEqual(['world.created', 'member.updated', 'member.updated', 'lease.acquired', 'draft.revised'])
  })
  it('authenticates expiring sessions and keeps a renewed lease identifier stable', async () => {
    const service = new SharedWorldService(); const now = '2026-01-01T00:00:00.000Z'
    await service.createAccount('owner', 'owner@example.test', 'correct-horse-battery', now)
    const { token } = await service.createSession('owner@example.test', 'correct-horse-battery', now)
    expect(service.authenticateToken(token, 'worlds:read', '2026-01-01T00:00:01.000Z')).toBe('owner')
    expect(() => service.authenticateToken(token, 'worlds:read', '2026-01-03T00:00:00.000Z')).toThrow('authorization')
    service.createWorld('world-1', 'Test world', 'owner', {}, now)
    const lease = service.acquireLease('world-1', 'owner', now)
    expect(service.renewLease('world-1', 'owner', lease.leaseId, 1, '2026-01-01T00:00:02.000Z').leaseId).toBe(lease.leaseId)
  })
  it('round-trips durable operational state without changing draft revision data', async () => {
    const service = new SharedWorldService(); const now = '2026-01-01T00:00:00.000Z'
    await service.createAccount('owner', 'owner@example.test', 'correct-horse-battery', now); service.createWorld('world-1', 'Test world', 'owner', { terrain: 'plain' }, now)
    const restored = SharedWorldService.restore(service.snapshotState())
    expect(restored.getWorld('world-1', 'owner')).toEqual(service.getWorld('world-1', 'owner'))
    expect(restored.listRevisions('world-1', 'owner')).toEqual(service.listRevisions('world-1', 'owner'))
  })
})
