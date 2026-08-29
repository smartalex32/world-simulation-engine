import { createSessionToken } from './collaboration'
import { HostedRunCatalog } from './runCatalog'
import type { HostedRunCommand, HostedRunRecord, HostedRunStore } from './types'
import type { WorldCreationDraft } from '../simulation/domain/types'
import { prepareHostedRunRecord, type HostedTransactionalCommandResult } from './runService'
import type { SharedWorldCommitRequest } from './sharedWorlds'

/** Server-only bridge between a shared immutable draft and one serial run executor. */
export class SharedRunCoordinator {
  private readonly tokens = new Map<string, string>()
  private readonly catalog: HostedRunCatalog
  constructor(private readonly store: HostedRunStore) { this.catalog = new HostedRunCatalog(store) }
  async prepare(runId: string, ownerAccountId: string, draft: unknown, savedAt: string): Promise<HostedRunRecord> {
    return prepareHostedRunRecord({ runId, ownerId: ownerAccountId, ownerToken: 'prepared-only', creation: worldCreationDraft(draft) }, savedAt)
  }
  async create(runId: string, ownerAccountId: string, draft: unknown): Promise<void> {
    await this.service(runId, ownerAccountId, draft)
  }
  async persistPrepared(record: HostedRunRecord): Promise<void> { await this.store.save(record) }
  async projection(runId: string, ownerAccountId: string, draft: unknown): Promise<unknown> { const service = await this.service(runId, ownerAccountId, draft); return service.view(this.token(runId)) }
  async command(runId: string, ownerAccountId: string, draft: unknown, command: HostedRunCommand, sharedWorld?: Omit<SharedWorldCommitRequest, 'initialRun'>): Promise<HostedTransactionalCommandResult> { const service = await this.service(runId, ownerAccountId, draft); return sharedWorld ? service.executeTransactional(this.token(runId), command, sharedWorld) : { result: await service.execute(this.token(runId), command) } }
  private async service(runId: string, ownerAccountId: string, draft: unknown) {
    const token = this.tokens.get(runId) ?? createSessionToken(); this.tokens.set(runId, token)
    return this.catalog.open({ runId, ownerId: ownerAccountId, ownerToken: token, creation: worldCreationDraft(draft) })
  }
  private token(runId: string): string { const token = this.tokens.get(runId); if (!token) throw new Error('Shared world run is unavailable'); return token }
}

function worldCreationDraft(value: unknown): WorldCreationDraft {
  if (!value || typeof value !== 'object') throw new Error('Shared world revision is not a world creation draft')
  return structuredClone(value) as WorldCreationDraft
}
