import type { DraftAuditEntry, DraftLease, WorldAccess } from './collaboration'
import type { SharedWorld, SharedWorldDraftRevision, SharedWorldRun } from './sharedWorlds'

export interface SharedSession { token: string; expiresAt: string }
export interface SharedApiTokenRecord { id: string; accountId: string; scopes: readonly string[]; createdAt: string; expiresAt?: string }
export interface SharedWorldClientOptions { fetcher?: typeof fetch }

/** Typed browser/Node client for the versioned shared-world HTTP boundary. */
export class SharedWorldClient {
  private token?: string
  private readonly fetcher: typeof fetch
  constructor(private readonly baseUrl: string, options: SharedWorldClientOptions = {}) { this.fetcher = options.fetcher ?? fetch }
  async createAccount(id: string, email: string, password: string): Promise<{ id: string; email: string; createdAt: string }> { return this.request('/api/v1/accounts', { method: 'POST', body: { id, email, password }, authenticated: false }) }
  async signIn(email: string, password: string): Promise<SharedSession> { const session = await this.request<SharedSession>('/api/v1/sessions', { method: 'POST', body: { email, password }, authenticated: false }); this.token = session.token; return session }
  setToken(token: string): void { if (!token) throw new Error('Shared world bearer token is required'); this.token = token }
  async issueToken(id: string, scopes: readonly ('worlds:read' | 'worlds:write')[]): Promise<{ token: string; record: SharedApiTokenRecord }> { return this.request('/api/v1/tokens', { method: 'POST', body: { id, scopes } }) }
  async listTokens(): Promise<readonly SharedApiTokenRecord[]> { return this.request('/api/v1/tokens') }
  async revokeToken(id: string): Promise<void> { await this.request(`/api/v1/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
  async createWorld(id: string, name: string, draft: unknown): Promise<SharedWorld> { return this.request('/api/v1/worlds', { method: 'POST', body: { id, name, draft } }) }
  async listRuns(worldId: string): Promise<readonly SharedWorldRun[]> { return this.request(`/api/v1/worlds/${encodeURIComponent(worldId)}/runs`) }
  async getWorld(worldId: string): Promise<SharedWorld> { return this.request(`/api/v1/worlds/${encodeURIComponent(worldId)}`) }
  async listMembers(worldId: string): Promise<readonly WorldAccess[]> { return this.request(`/api/v1/worlds/${encodeURIComponent(worldId)}/members`) }
  async setMember(worldId: string, accountId: string, role: 'editor' | 'viewer'): Promise<WorldAccess> { return this.request(`/api/v1/worlds/${encodeURIComponent(worldId)}/members`, { method: 'PUT', body: { accountId, role } }) }
  async acquireLease(worldId: string): Promise<DraftLease> { return this.request(`/api/v1/worlds/${encodeURIComponent(worldId)}/lease`, { method: 'POST', body: {} }) }
  async renewLease(worldId: string, leaseId: string, expectedRevision: number): Promise<DraftLease> { return this.request(`/api/v1/worlds/${encodeURIComponent(worldId)}/lease`, { method: 'POST', body: { leaseId, expectedRevision } }) }
  async listRevisions(worldId: string): Promise<readonly SharedWorldDraftRevision[]> { return this.request(`/api/v1/worlds/${encodeURIComponent(worldId)}/revisions`) }
  async saveRevision(worldId: string, leaseId: string, expectedRevision: number, clientMutationId: string, payload: unknown): Promise<SharedWorldDraftRevision> { return this.request(`/api/v1/worlds/${encodeURIComponent(worldId)}/revisions`, { method: 'POST', body: { leaseId, expectedRevision, clientMutationId, payload } }) }
  async listAudits(worldId: string): Promise<readonly DraftAuditEntry[]> { return this.request(`/api/v1/worlds/${encodeURIComponent(worldId)}/audits`) }
  private async request<T>(path: string, options: { method?: string; body?: unknown; authenticated?: boolean } = {}): Promise<T> {
    const authenticated = options.authenticated ?? true
    if (authenticated && !this.token) throw new Error('Shared world bearer token is required')
    const response = await this.fetcher(`${this.baseUrl}${path}`, { method: options.method ?? 'GET', headers: { ...(authenticated ? { authorization: `Bearer ${this.token}` } : {}), ...(options.body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) })
    const value = await response.json() as unknown
    if (!response.ok) throw new Error(`Shared-world API request failed: ${response.status}`)
    return value as T
  }
}
