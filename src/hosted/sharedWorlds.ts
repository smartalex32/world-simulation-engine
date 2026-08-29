import { createSessionToken, hashPassword, hashSessionToken, requireRole, verifyPassword, type DraftAuditEntry, type DraftLease, type HostedAccount, type HostedSession, type WorldAccess, type WorldRole } from './collaboration'
import { createHash } from 'node:crypto'
import { canonicalStringify } from '../simulation/serialization/snapshot'
import { compareStableText } from '../shared/stableOrder'
import type { HostedRunRecord } from './types'

export interface SharedWorld { id: string; name: string; ownerAccountId: string; currentRevision: number; createdAt: string; updatedAt: string }
export interface SharedWorldDraftRevision { worldId: string; revision: number; parentRevision?: number; canonicalDigest: string; authorAccountId: string; payload: unknown; createdAt: string }
export interface SharedApiToken { id: string; accountId: string; tokenHash: string; scopes: readonly string[]; createdAt: string; expiresAt?: string }
export interface SharedWorldRun { worldId: string; revision: number; runId: string; ownerAccountId: string; createdAt: string }
export interface SharedWorldServiceState {
  version: 1
  accounts: readonly HostedAccount[]
  sessions: readonly HostedSession[]
  worlds: readonly SharedWorld[]
  access: readonly WorldAccess[]
  revisions: readonly SharedWorldDraftRevision[]
  leases: readonly DraftLease[]
  audits: readonly DraftAuditEntry[]
  tokens: readonly SharedApiToken[]
  mutations: readonly { key: string; revision: SharedWorldDraftRevision }[]
  runs?: readonly SharedWorldRun[]
}

export interface SharedOutboxEventInput { key: string; topic: string; payload: unknown; occurredAt: string }
export interface SharedOutboxEvent { id: number; key: string; topic: string; payload: unknown; createdAt: string }
export interface SharedWorldCommitRequest {
  expectedRevision: number
  service: SharedWorldService
  event?: SharedOutboxEventInput
  initialRun?: HostedRunRecord
}
export interface SharedWorldCommitResult { revision: number; event?: SharedOutboxEvent }
export interface SharedWorldMutationStore {
  loadSharedWorldService(): Promise<SharedWorldService>
  commitSharedWorldMutation(request: SharedWorldCommitRequest): Promise<SharedWorldCommitResult>
  outboxAfter(lastEventId?: number): Promise<readonly SharedOutboxEvent[]>
}

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
  private readonly mutations = new Map<string, SharedWorldDraftRevision>()
  private readonly runs = new Map<string, SharedWorldRun>()
  private storageRevisionValue = 0

  static restore(value: SharedWorldServiceState, storageRevision = 0): SharedWorldService {
    if (!value || value.version !== 1 || !Array.isArray(value.accounts) || !Array.isArray(value.sessions) || !Array.isArray(value.worlds) || !Array.isArray(value.access) || !Array.isArray(value.revisions) || !Array.isArray(value.leases) || !Array.isArray(value.audits) || !Array.isArray(value.tokens) || !Array.isArray(value.mutations)) throw new Error('Shared world persisted state is invalid')
    const service = new SharedWorldService()
    for (const account of value.accounts) { if (!validId(account.id) || !validEmail(account.email) || typeof account.passwordHash !== 'string' || typeof account.createdAt !== 'string') throw new Error('Shared world account state is invalid'); service.accounts.set(account.id, structuredClone(account)); service.accountsByEmail.set(account.email, account.id) }
    for (const session of value.sessions) { if (!validId(session.accountId) || typeof session.id !== 'string' || typeof session.tokenHash !== 'string' || typeof session.createdAt !== 'string' || typeof session.expiresAt !== 'string') throw new Error('Shared world session state is invalid'); service.sessions.set(session.id, structuredClone(session)) }
    for (const world of value.worlds) { if (!validId(world.id) || !validId(world.ownerAccountId) || !Number.isSafeInteger(world.currentRevision) || world.currentRevision < 1) throw new Error('Shared world state is invalid'); service.worlds.set(world.id, structuredClone(world)) }
    for (const entry of value.access) { if (!validId(entry.worldId) || !validId(entry.accountId) || !isWorldRole(entry.role)) throw new Error('Shared world access state is invalid'); service.access.set(accessKey(entry.worldId, entry.accountId), structuredClone(entry)) }
    for (const revision of value.revisions) { if (!validId(revision.worldId) || !validId(revision.authorAccountId) || !Number.isSafeInteger(revision.revision) || revision.revision < 1 || (revision.parentRevision !== undefined && (!Number.isSafeInteger(revision.parentRevision) || revision.parentRevision < 1 || revision.parentRevision >= revision.revision))) throw new Error('Shared world revision state is invalid'); const normalized = Object.freeze({ ...structuredClone(revision), canonicalDigest: typeof revision.canonicalDigest === 'string' ? revision.canonicalDigest : payloadDigest(revision.payload) }); if (!/^[a-f0-9]{64}$/.test(normalized.canonicalDigest) || normalized.canonicalDigest !== payloadDigest(normalized.payload)) throw new Error('Shared world revision digest is invalid'); const revisions = service.revisions.get(normalized.worldId) ?? []; revisions.push(normalized); service.revisions.set(normalized.worldId, revisions) }
    for (const lease of value.leases) { if (!validId(lease.worldId) || !validId(lease.holderAccountId) || typeof lease.leaseId !== 'string' || !Number.isSafeInteger(lease.revision)) throw new Error('Shared world lease state is invalid'); service.leases.set(lease.worldId, structuredClone(lease)) }
    for (const audit of value.audits) { if (!validId(audit.worldId) || !validId(audit.actorAccountId) || !Number.isSafeInteger(audit.revision)) throw new Error('Shared world audit state is invalid'); const audits = service.audits.get(audit.worldId) ?? []; audits.push(structuredClone(audit)); service.audits.set(audit.worldId, audits) }
    for (const token of value.tokens) { if (!validId(token.id) || !validId(token.accountId) || typeof token.tokenHash !== 'string' || !Array.isArray(token.scopes)) throw new Error('Shared world token state is invalid'); service.tokens.set(token.id, structuredClone(token)) }
    for (const mutation of value.mutations) { if (typeof mutation.key !== 'string') throw new Error('Shared world mutation state is invalid'); service.mutations.set(mutation.key, structuredClone(mutation.revision)) }
    for (const run of value.runs ?? []) { if (!validId(run.worldId) || !validId(run.runId) || !validId(run.ownerAccountId) || !Number.isSafeInteger(run.revision) || run.revision < 1) throw new Error('Shared world run state is invalid'); service.runs.set(run.runId, structuredClone(run)) }
    service.setStorageRevision(storageRevision)
    return service
  }
  snapshotState(): SharedWorldServiceState {
    return structuredClone({ version: 1 as const, accounts: [...this.accounts.values()], sessions: [...this.sessions.values()], worlds: [...this.worlds.values()], access: [...this.access.values()], revisions: [...this.revisions.values()].flat(), leases: [...this.leases.values()], audits: [...this.audits.values()].flat(), tokens: [...this.tokens.values()], mutations: [...this.mutations.entries()].map(([key, revision]) => ({ key, revision })), runs: [...this.runs.values()] })
  }
  storageRevision(): number { return this.storageRevisionValue }
  setStorageRevision(revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Shared world storage revision is invalid')
    this.storageRevisionValue = revision
  }
  fork(): SharedWorldService { return SharedWorldService.restore(this.snapshotState(), this.storageRevisionValue) }
  replaceWith(candidate: SharedWorldService): void {
    const restored = SharedWorldService.restore(candidate.snapshotState(), candidate.storageRevision())
    replaceMap(this.accounts, restored.accounts); replaceMap(this.accountsByEmail, restored.accountsByEmail); replaceMap(this.sessions, restored.sessions)
    replaceMap(this.worlds, restored.worlds); replaceMap(this.access, restored.access); replaceMap(this.revisions, restored.revisions)
    replaceMap(this.leases, restored.leases); replaceMap(this.audits, restored.audits); replaceMap(this.tokens, restored.tokens)
    replaceMap(this.mutations, restored.mutations); replaceMap(this.runs, restored.runs); this.storageRevisionValue = restored.storageRevisionValue
  }

  async createAccount(id: string, email: string, password: string, now: string): Promise<HostedAccount> {
    if (!validId(id) || !validEmail(email) || this.accounts.has(id) || this.accountsByEmail.has(email.toLowerCase())) throw new Error('Account is invalid or already exists')
    const account: HostedAccount = Object.freeze({ id, email: email.toLowerCase(), passwordHash: await hashPassword(password), createdAt: now })
    this.accounts.set(id, account); this.accountsByEmail.set(account.email, id)
    return account
  }
  async createSession(email: string, password: string, now: string, durationMs = 86_400_000): Promise<{ token: string; session: HostedSession }> {
    const accountId = this.accountsByEmail.get(email.toLowerCase())
    const account = accountId ? this.accounts.get(accountId) : undefined
    if (!account || !(await verifyPassword(account.passwordHash, password))) throw new Error('Shared world authorization failed')
    if (!Number.isSafeInteger(durationMs) || durationMs < 60_000) throw new Error('Session duration is invalid')
    const token = createSessionToken()
    const session = Object.freeze({ id: createSessionToken(), accountId: account.id, tokenHash: hashSessionToken(token), createdAt: now, expiresAt: new Date(Date.parse(now) + durationMs).toISOString() })
    this.sessions.set(session.id, session)
    return { token, session }
  }
  createWorld(id: string, name: string, ownerAccountId: string, payload: unknown, now: string): SharedWorld {
    if (!validId(id) || !name.trim() || !this.accounts.has(ownerAccountId) || this.worlds.has(id)) throw new Error('Shared world is invalid or already exists')
    const world: SharedWorld = Object.freeze({ id, name: name.trim(), ownerAccountId, currentRevision: 1, createdAt: now, updatedAt: now })
    this.worlds.set(id, world); this.access.set(accessKey(id, ownerAccountId), Object.freeze({ worldId: id, accountId: ownerAccountId, role: 'owner' }))
    this.revisions.set(id, [Object.freeze({ worldId: id, revision: 1, canonicalDigest: payloadDigest(payload), authorAccountId: ownerAccountId, payload: structuredClone(payload), createdAt: now })])
    this.audit(id, ownerAccountId, 'world.created', 1, now); return world
  }
  addMember(worldId: string, actorId: string, accountId: string, role: Exclude<WorldRole, 'owner'>, now: string): WorldAccess {
    requireRole(this.member(worldId, actorId), 'owner'); if (!this.accounts.has(accountId)) throw new Error('Shared world account does not exist')
    const entry = Object.freeze({ worldId, accountId, role }); this.access.set(accessKey(worldId, accountId), entry); this.audit(worldId, actorId, 'member.updated', this.world(worldId).currentRevision, now); return entry
  }
  getWorld(worldId: string, accountId: string): SharedWorld { requireRole(this.member(worldId, accountId), 'owner', 'editor', 'viewer'); return structuredClone(this.world(worldId)) }
  listMembers(worldId: string, accountId: string): readonly WorldAccess[] {
    requireRole(this.member(worldId, accountId), 'owner', 'editor', 'viewer')
    return Object.freeze([...this.access.values()].filter((entry) => entry.worldId === worldId).sort((a, b) => compareStableText(a.accountId, b.accountId)).map((entry) => structuredClone(entry)))
  }
  acquireLease(worldId: string, accountId: string, now: string, durationMs = 60_000): DraftLease {
    requireRole(this.member(worldId, accountId), 'owner', 'editor'); const existing = this.leases.get(worldId)
    if (existing && existing.expiresAt > now && existing.holderAccountId !== accountId) throw new Error('Draft editing lease is unavailable')
    const lease = Object.freeze({ worldId, leaseId: createSessionToken(), holderAccountId: accountId, revision: this.world(worldId).currentRevision, expiresAt: new Date(Date.parse(now) + durationMs).toISOString() })
    this.leases.set(worldId, lease); this.audit(worldId, accountId, 'lease.acquired', lease.revision, now); return lease
  }
  renewLease(worldId: string, accountId: string, leaseId: string, expectedRevision: number, now: string, durationMs = 60_000): DraftLease {
    const lease = this.assertLease(worldId, accountId, leaseId, expectedRevision, now)
    if (!Number.isSafeInteger(durationMs) || durationMs < 1_000) throw new Error('Draft lease duration is invalid')
    const renewed = Object.freeze({ ...lease, expiresAt: new Date(Date.parse(now) + durationMs).toISOString() })
    this.leases.set(worldId, renewed); this.audit(worldId, accountId, 'lease.renewed', renewed.revision, now); return renewed
  }
  saveRevision(worldId: string, accountId: string, leaseId: string, expectedRevision: number, clientMutationId: string, payload: unknown, now: string): SharedWorldDraftRevision {
    if (!validId(clientMutationId)) throw new Error('Draft mutation ID is invalid')
    const mutationKey = `${worldId}:${accountId}:${clientMutationId}`; const previous = this.mutations.get(mutationKey)
    if (previous) return structuredClone(previous)
    this.assertLease(worldId, accountId, leaseId, expectedRevision, now); const world = this.world(worldId); const revision = world.currentRevision + 1
    const next = Object.freeze({ ...world, currentRevision: revision, updatedAt: now }); this.worlds.set(worldId, next)
    const entry = Object.freeze({ worldId, revision, parentRevision: expectedRevision, canonicalDigest: payloadDigest(payload), authorAccountId: accountId, payload: structuredClone(payload), createdAt: now }); this.revisions.get(worldId)!.push(entry)
    this.leases.set(worldId, Object.freeze({ ...this.leases.get(worldId)!, revision })); this.mutations.set(mutationKey, entry); this.audit(worldId, accountId, 'draft.revised', revision, now); return structuredClone(entry)
  }
  listRevisions(worldId: string, accountId: string): readonly SharedWorldDraftRevision[] { requireRole(this.member(worldId, accountId), 'owner', 'editor', 'viewer'); return Object.freeze([...(this.revisions.get(worldId) ?? [])].map((revision) => structuredClone(revision))) }
  listAudits(worldId: string, accountId: string): readonly DraftAuditEntry[] { requireRole(this.member(worldId, accountId), 'owner', 'editor', 'viewer'); return Object.freeze([...(this.audits.get(worldId) ?? [])]) }
  commitRun(worldId: string, accountId: string, revision: number, runId: string, now: string): { run: SharedWorldRun; draft: unknown } {
    requireRole(this.member(worldId, accountId), 'owner'); if (!validId(runId) || this.runs.has(runId)) throw new Error('Shared world run is invalid or already exists')
    const draft = this.revisions.get(worldId)?.find((entry) => entry.revision === revision)
    if (!draft) throw new Error('Shared world revision does not exist')
    const run = Object.freeze({ worldId, revision, runId, ownerAccountId: accountId, createdAt: now }); this.runs.set(runId, run); this.audit(worldId, accountId, 'run.committed', revision, now)
    return { run: structuredClone(run), draft: structuredClone(draft.payload) }
  }
  getRun(worldId: string, runId: string, accountId: string): SharedWorldRun { requireRole(this.member(worldId, accountId), 'owner', 'editor', 'viewer'); const run = this.runs.get(runId); if (!run || run.worldId !== worldId) throw new Error('Shared world run does not exist'); return structuredClone(run) }
  listRuns(worldId: string, accountId: string): readonly SharedWorldRun[] { requireRole(this.member(worldId, accountId), 'owner', 'editor', 'viewer'); return Object.freeze([...this.runs.values()].filter((run) => run.worldId === worldId).sort((a, b) => compareStableText(a.createdAt, b.createdAt) || compareStableText(a.runId, b.runId)).map((run) => structuredClone(run))) }
  draftForRun(run: SharedWorldRun): unknown { const draft = this.revisions.get(run.worldId)?.find((entry) => entry.revision === run.revision); if (!draft) throw new Error('Shared world run revision is unavailable'); return structuredClone(draft.payload) }
  recordRunControl(run: SharedWorldRun, accountId: string, commandType: string, now: string): void {
    requireRole(this.member(run.worldId, accountId), 'owner')
    if (!/^[A-Z_]{2,64}$/.test(commandType)) throw new Error('Shared world run command is invalid')
    this.audit(run.worldId, accountId, `run.command.${commandType.toLowerCase()}`, run.revision, now)
  }
  issueToken(id: string, accountId: string, scopes: readonly string[], now: string): { token: string; record: SharedApiToken } {
    if (!validId(id) || !this.accounts.has(accountId) || scopes.length === 0) throw new Error('API token is invalid')
    const token = createSessionToken(); const record = Object.freeze({ id, accountId, tokenHash: hashSessionToken(token), scopes: Object.freeze([...new Set(scopes)].sort()), createdAt: now })
    this.tokens.set(id, record); return { token, record }
  }
  listTokens(accountId: string): readonly Omit<SharedApiToken, 'tokenHash'>[] { return Object.freeze([...this.tokens.values()].filter((token) => token.accountId === accountId).sort((a, b) => compareStableText(a.id, b.id)).map(({ tokenHash: _, ...token }) => structuredClone(token))) }
  revokeToken(id: string, accountId: string): void { const token = this.tokens.get(id); if (!token || token.accountId !== accountId) throw new Error('Shared world authorization failed'); this.tokens.delete(id) }
  authenticateToken(token: string, scope: string, now = new Date().toISOString()): string {
    const hash = hashSessionToken(token)
    const session = [...this.sessions.values()].find((entry) => entry.tokenHash === hash && entry.expiresAt > now)
    if (session) return session.accountId
    const record = [...this.tokens.values()].find((entry) => entry.tokenHash === hash && (!entry.expiresAt || entry.expiresAt > now))
    if (!record || !record.scopes.includes(scope)) throw new Error('Shared world authorization failed'); return record.accountId
  }
  member(worldId: string, accountId: string): WorldAccess | undefined { return this.access.get(accessKey(worldId, accountId)) }
  private world(id: string): SharedWorld { const world = this.worlds.get(id); if (!world) throw new Error('Shared world does not exist'); return world }
  private assertLease(worldId: string, accountId: string, leaseId: string, expectedRevision: number, now: string): DraftLease { const lease = this.leases.get(worldId); if (!lease || lease.expiresAt <= now || lease.holderAccountId !== accountId || lease.leaseId !== leaseId) throw new Error('Draft editing lease is unavailable'); if (lease.revision !== expectedRevision || this.world(worldId).currentRevision !== expectedRevision) throw new Error(`Draft revision is stale; current revision is ${this.world(worldId).currentRevision}`); return lease }
  private audit(worldId: string, actorAccountId: string, action: string, revision: number, createdAt: string): void { const entries = this.audits.get(worldId) ?? []; entries.push(Object.freeze({ id: `${worldId}-${entries.length + 1}`, worldId, actorAccountId, action, revision, createdAt })); this.audits.set(worldId, entries) }
}
function accessKey(worldId: string, accountId: string): string { return `${worldId}:${accountId}` }
function validId(value: string): boolean { return /^[a-zA-Z0-9_-]{1,128}$/.test(value) }
function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) }
function isWorldRole(value: unknown): value is WorldRole { return value === 'owner' || value === 'editor' || value === 'viewer' }
function payloadDigest(payload: unknown): string { return createHash('sha256').update(canonicalStringify(payload)).digest('hex') }
function replaceMap<K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>): void { target.clear(); for (const [key, value] of source) target.set(key, value) }
