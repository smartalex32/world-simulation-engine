import { HostedRunService } from './runService'
import type { HostedRunBootstrap, HostedRunStore, HostedRunSummary } from './types'

/** Owner-scoped service cache; durable snapshots remain the store's responsibility. */
export class HostedRunCatalog {
  private readonly services = new Map<string, HostedRunService>()
  constructor(private readonly store: HostedRunStore) {}
  async open(bootstrap: HostedRunBootstrap): Promise<HostedRunService> {
    const existing = this.services.get(bootstrap.runId)
    if (existing) return existing
    const service = await HostedRunService.open(bootstrap, this.store)
    this.services.set(bootstrap.runId, service)
    return service
  }
  async list(ownerId: string): Promise<HostedRunSummary[]> {
    return (await this.store.list(ownerId)).map((record) => ({ runId: record.runId, ownerId: record.ownerId, tick: record.snapshot.state.tick, savedAt: record.savedAt }))
  }
}
