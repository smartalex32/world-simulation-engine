import { createSessionToken, hashPassword, hashSessionToken, requireRole, type DraftAuditEntry, type DraftLease, type HostedAccount, type HostedSession, type WorldAccess, type WorldRole } from './collaboration'

export interface SharedWorld { id: string; name: string; ownerAccountId: string; currentRevision: number; createdAt: string; updatedAt: string }
export interface SharedWorldDraftRevision { worldId: string; revision: number; authorAccountId: string; payload: unknown; createdAt: string }
export interface SharedApiToken { id: string; accountId: string; tokenHash: string; scopes: readonly string[]; createdAt: string; expiresAt?: string }

/** Noncanonical collaboration authority.  Canonical simulation state remains in
 * the run store; revisions, users, leases, and audit timestamps are operational metadata. */
export class SharedWorldService {
  private readonly accounts = new Map<string, HostedAccount>()
  private readonly accountsByEmail = new Map<string, string>()
  private readonly sessions = new Map<string, HostedSession>()
  private readonly worlds = new Map<string, SharedWorld>()
  private readonly access = new Map<string, WorldAccess>()
  private readonly revisions = new Map<string, SharedWorldDraftRevision[]>()
  private readonly leases = new Map<string, DraftLease>()
  private readonly audits = new Map<string, DraftAuditEntry[]>()
  private readonly tokens = new Map<string, SharedApiToken>()

  async createAccount(id: string, email: string, password: string, now: string): Promise<HostedAccount> {
    if (!validId(id) || !validEmail(email) || this.accounts.has(id) || this.accountsByEmail.has(email.toLowerCase())) throw new Error('Account is invalid or already exists')
    const account: HostedAccount = Object.freeze({ id, email: email.toLowerCase(), passwordHash: await hashPassword(password), createdAt: now })
    this.accounts.set(id, account); this.accountsByEmail.set(account.email, id)
    return account
  }
  createWorld(id: string, name: string, ownerAccountId: string, payload: unknown, now: string): SharedWorld {
    if (!validId(id) || !name.trim() || !this.accounts.has(ownerAccountId) || this.worlds.has(id)) throw new Error('Shared world is invalid or already exists')
    const world: SharedWorld = Object.freeze({ id, name: name.trim(), ownerAccountId, currentRevision: 1, createdAt: now, updatedAt: now })
    this.worlds.set(id, world); this.access.set(accessKey(id, ownerAccountId), Object.freeze({ worldId: id, accountId: ownerAccountId, role: 'owner' }))
    this.revisions.set(id, [Object.freeze({ worldId: id, revision: 1, authorAccountId: ownerAccountId, payload: structuredClone(payload), createdAt: now })])
    this.audit(id, ownerAccountId, 'world.created', 1, now); return world
  }
  addMember(worldId: string, actorId: string, accountId: string, role: Exclude<WorldRole, 'owner'>, now: string): WorldAccess {
    requireRole(this.member(worldId, actorId), 'owner'); if (!this.accounts.has(accountId)) throw new Error('Shared world account does not exist')
    const entry = Object.freeze({ worldId, accountId, role }); this.access.set(accessKey(worldId, accountId), entry); this.audit(worldId, actorId, 'member.updated', this.world(worldId).currentRevision, now); return entry
  }
  acquireLease(worldId: string, accountId: string, now: string, durationMs = 60_000): DraftLease {
    requireRole(this.member(worldId, accountId), 'owner', 'editor'); const existing = this.leases.get(worldId)
    if (existing && existing.expiresAt > now && existing.holderAccountId !== accountId) throw new Error('Draft editing lease is unavailable')
    const lease = Object.freeze({ worldId, leaseId: createSessionToken(), holderAccountId: accountId, revision: this.world(worldId).currentRevision, expiresAt: new Date(Date.parse(now) + durationMs).toISOString() })
    this.leases.set(worldId, lease); this.audit(worldId, accountId, 'lease.acquired', lease.revision, now); return lease
  }
  renewLease(worldId: string, accountId: string, leaseId: string, expectedRevision: number, now: string, durationMs = 60_000): DraftLease {
    this.assertLease(worldId, accountId, leaseId, expectedRevision, now); return this.acquireLease(worldId, accountId, now, durationMs)
  }
  saveRevision(worldId: string, accountId: string, leaseId: string, expectedRevision: number, payload: unknown, now: string): SharedWorldDraftRevision {
    this.assertLease(worldId, accountId, leaseId, expectedRevision, now); const world = this.world(worldId); const revision = world.currentRevision + 1
    const next = Object.freeze({ ...world, currentRevision: revision, updatedAt: now }); this.worlds.set(worldId, next)
    const entry = Object.freeze({ worldId, revision, authorAccountId: accountId, payload: structuredClone(payload), createdAt: now }); this.revisions.get(worldId)!.push(entry)
    this.leases.set(worldId, Object.freeze({ ...this.leases.get(worldId)!, revision })); this.audit(worldId, accountId, 'draft.revised', revision, now); return entry
  }
  listRevisions(worldId: string, accountId: string): readonly SharedWorldDraftRevision[] { requireRole(this.member(worldId, accountId), 'owner', 'editor', 'viewer'); return Object.freeze([...(this.revisions.get(worldId) ?? [])].map((revision) => structuredClone(revision))) }
  listAudits(worldId: string, accountId: string): readonly DraftAuditEntry[] { requireRole(this.member(worldId, accountId), 'owner', 'editor', 'viewer'); return Object.freeze([...(this.audits.get(worldId) ?? [])]) }
  issueToken(id: string, accountId: string, scopes: readonly string[], now: string): { token: string; record: SharedApiToken } {
    if (!validId(id) || !this.accounts.has(accountId) || scopes.length === 0) throw new Error('API token is invalid')
    const token = createSessionToken(); const record = Object.freeze({ id, accountId, tokenHash: hashSessionToken(token), scopes: Object.freeze([...new Set(scopes)].sort()), createdAt: now })
    this.tokens.set(id, record); return { token, record }
  }
  authenticateToken(token: string, scope: string): string { const hash = hashSessionToken(token); const record = [...this.tokens.values()].find((entry) => entry.tokenHash === hash); if (!record || !record.scopes.includes(scope)) throw new Error('Shared world authorization failed'); return record.accountId }
  member(worldId: string, accountId: string): WorldAccess | undefined { return this.access.get(accessKey(worldId, accountId)) }
  private world(id: string): SharedWorld { const world = this.worlds.get(id); if (!world) throw new Error('Shared world does not exist'); return world }
  private assertLease(worldId: string, accountId: string, leaseId: string, expectedRevision: number, now: string): void { const lease = this.leases.get(worldId); if (!lease || lease.expiresAt <= now || lease.holderAccountId !== accountId || lease.leaseId !== leaseId) throw new Error('Draft editing lease is unavailable'); if (lease.revision !== expectedRevision || this.world(worldId).currentRevision !== expectedRevision) throw new Error(`Draft revision is stale; current revision is ${this.world(worldId).currentRevision}`) }
  private audit(worldId: string, actorAccountId: string, action: string, revision: number, createdAt: string): void { const entries = this.audits.get(worldId) ?? []; entries.push(Object.freeze({ id: `${worldId}-${entries.length + 1}`, worldId, actorAccountId, action, revision, createdAt })); this.audits.set(worldId, entries) }
}
function accessKey(worldId: string, accountId: string): string { return `${worldId}:${accountId}` }
function validId(value: string): boolean { return /^[a-zA-Z0-9_-]{1,128}$/.test(value) }
function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) }
