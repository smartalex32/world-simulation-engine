import { createSessionToken } from './collaboration'
import { HostedRunCatalog } from './runCatalog'
import type { HostedRunCommand, HostedRunStore } from './types'
import type { WorldCreationDraft } from '../simulation/domain/types'

/** Server-only bridge between a shared immutable draft and one serial run executor. */
export class SharedRunCoordinator {
  private readonly tokens = new Map<string, string>()
  private readonly catalog: HostedRunCatalog
  constructor(store: HostedRunStore) { this.catalog = new HostedRunCatalog(store) }
  async create(runId: string, ownerAccountId: string, draft: unknown): Promise<void> {
    await this.service(runId, ownerAccountId, draft)
  }
  async projection(runId: string, ownerAccountId: string, draft: unknown): Promise<unknown> { const service = await this.service(runId, ownerAccountId, draft); return service.view(this.token(runId)) }
  async command(runId: string, ownerAccountId: string, draft: unknown, command: HostedRunCommand): Promise<unknown> { const service = await this.service(runId, ownerAccountId, draft); return service.execute(this.token(runId), command) }
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
