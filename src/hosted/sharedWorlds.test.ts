import { describe, expect, it } from 'vitest'
import { SharedWorldService } from './sharedWorlds'

describe('shared worlds', () => {
  it('enforces membership, a renewable single-editor lease, immutable revisions, and audit evidence', async () => {
    const service = new SharedWorldService(); const now = '2026-01-01T00:00:00.000Z'
    await service.createAccount('owner', 'owner@example.test', 'correct-horse-battery', now); await service.createAccount('editor', 'editor@example.test', 'correct-horse-battery', now); await service.createAccount('viewer', 'viewer@example.test', 'correct-horse-battery', now)
    service.createWorld('world-1', 'Test world', 'owner', { terrain: 'plain' }, now); service.addMember('world-1', 'owner', 'editor', 'editor', now); service.addMember('world-1', 'owner', 'viewer', 'viewer', now)
    const lease = service.acquireLease('world-1', 'editor', now); expect(() => service.acquireLease('world-1', 'owner', now)).toThrow('lease')
    const revision = service.saveRevision('world-1', 'editor', lease.leaseId, 1, { terrain: 'hills' }, now); expect(revision.revision).toBe(2)
    expect(() => service.saveRevision('world-1', 'editor', lease.leaseId, 1, {}, now)).toThrow('stale')
    expect(service.listRevisions('world-1', 'viewer')).toHaveLength(2); expect(service.listAudits('world-1', 'viewer').map((entry) => entry.action)).toEqual(['world.created', 'member.updated', 'member.updated', 'lease.acquired', 'draft.revised'])
  })
})
