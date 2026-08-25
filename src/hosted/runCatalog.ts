import { HostedRunService } from './runService'
import type { HostedRunBootstrap, HostedRunStore, HostedRunSummary } from './types'

/** Owner-scoped service cache; durable snapshots remain the store's responsibility. */
export class HostedRunCatalog {
  private readonly services = new Map<string, HostedRunService>()
  private readonly openings = new Map<string, Promise<HostedRunService>>()
  private readonly bootstraps = new Map<string, HostedRunBootstrap>()
  constructor(private readonly store: HostedRunStore) {}
  async open(bootstrap: HostedRunBootstrap): Promise<HostedRunService> {
    const existing = this.services.get(bootstrap.runId)
    if (existing) { this.assertSameAuthority(bootstrap); return existing }
    const opening = this.openings.get(bootstrap.runId)
    if (opening) { this.assertSameAuthority(bootstrap); return opening }
    this.bootstraps.set(bootstrap.runId, bootstrap)
    const created = HostedRunService.open(bootstrap, this.store).then((service) => {
      this.services.set(bootstrap.runId, service)
      return service
    }).finally(() => this.openings.delete(bootstrap.runId))
    this.openings.set(bootstrap.runId, created)
    return created
  }
  async list(ownerId: string): Promise<HostedRunSummary[]> {
    return (await this.store.list(ownerId)).map((record) => ({ runId: record.runId, ownerId: record.ownerId, tick: record.snapshot.state.tick, savedAt: record.savedAt }))
  }

  private assertSameAuthority(bootstrap: HostedRunBootstrap): void {
    const original = this.bootstraps.get(bootstrap.runId)
    if (!original || original.ownerId !== bootstrap.ownerId || original.ownerToken !== bootstrap.ownerToken) {
      throw new Error('Hosted run authority does not match the existing coordinator')
    }
  }
}
