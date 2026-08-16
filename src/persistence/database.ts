import type { SimulationEvent, SnapshotEnvelope, StatisticSample } from '../simulation/domain/types'
import { validateSnapshot } from '../simulation/serialization/snapshot'

const DATABASE_NAME = 'world-simulation-workbench'
const DATABASE_VERSION = 1

export interface RunRecord {
  runId: string
  seed: string
  tick: number
  engineVersion: string
  createdAt: string
  updatedAt: string
}

export interface SavedSnapshot {
  key: string
  runId: string
  kind: 'autosave' | 'named'
  name: string
  createdAt: string
  snapshot: SnapshotEnvelope
}

interface StoredEvent extends SimulationEvent { storageKey: string }
type StoredStatistic = StatisticSample & { storageKey: string }

export interface ExportBundle {
  format: 'world-simulation-bundle'
  bundleVersion: 1
  exportedAt: string
  snapshot: SnapshotEnvelope
  events: SimulationEvent[]
  statistics: StatisticSample[]
}

export class WorkbenchDatabase {
  private databasePromise?: Promise<IDBDatabase>

  async saveSnapshot(snapshot: SnapshotEnvelope, kind: 'autosave' | 'named', name?: string): Promise<SavedSnapshot> {
    const database = await this.open()
    const now = new Date().toISOString()
    const key = kind === 'autosave' ? `${snapshot.state.runId}:autosave` : `${snapshot.state.runId}:named:${crypto.randomUUID()}`
    const saved: SavedSnapshot = {
      key,
      runId: snapshot.state.runId,
      kind,
      name: kind === 'autosave' ? 'Autosave' : (name?.trim() || `Snapshot at hour ${snapshot.state.tick}`),
      createdAt: now,
      snapshot,
    }
    const transaction = database.transaction(['runs', 'snapshots'], 'readwrite')
    const runs = transaction.objectStore('runs')
    const previous = await request<RunRecord | undefined>(runs.get(snapshot.state.runId))
    const run: RunRecord = {
      runId: snapshot.state.runId,
      seed: snapshot.state.config.seed,
      tick: snapshot.state.tick,
      engineVersion: snapshot.engineVersion,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    }
    runs.put(run)
    transaction.objectStore('snapshots').put(saved)
    await transactionDone(transaction)
    return saved
  }

  async appendTelemetry(events: SimulationEvent[], statistics: StatisticSample[]): Promise<void> {
    if (events.length === 0 && statistics.length === 0) return
    const database = await this.open()
    const transaction = database.transaction(['events', 'statistics'], 'readwrite')
    const eventStore = transaction.objectStore('events')
    for (const event of events) eventStore.put({ ...event, storageKey: event.id } satisfies StoredEvent)
    const statisticStore = transaction.objectStore('statistics')
    for (const sample of statistics) {
      const storageKey = statisticStorageKey(sample)
      statisticStore.put({ ...sample, storageKey } satisfies StoredStatistic)
    }
    await transactionDone(transaction)
  }

  async listRuns(): Promise<RunRecord[]> {
    const database = await this.open()
    const records = await request<RunRecord[]>(database.transaction('runs').objectStore('runs').getAll())
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async listSnapshots(runId?: string): Promise<SavedSnapshot[]> {
    const database = await this.open()
    const store = database.transaction('snapshots').objectStore('snapshots')
    const records = runId ? await request<SavedSnapshot[]>(store.index('runId').getAll(runId)) : await request<SavedSnapshot[]>(store.getAll())
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async deleteSnapshot(key: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction('snapshots', 'readwrite')
    transaction.objectStore('snapshots').delete(key)
    await transactionDone(transaction)
  }

  async exportBundle(snapshot: SnapshotEnvelope): Promise<ExportBundle> {
    const database = await this.open()
    const events = await request<StoredEvent[]>(database.transaction('events').objectStore('events').index('runId').getAll(snapshot.state.runId))
    const statistics = await request<StoredStatistic[]>(database.transaction('statistics').objectStore('statistics').index('runId').getAll(snapshot.state.runId))
    return {
      format: 'world-simulation-bundle',
      bundleVersion: 1,
      exportedAt: new Date().toISOString(),
      snapshot,
      events: events.map(({ storageKey: _, ...event }) => event),
      statistics: statistics.map(({ storageKey: _, ...sample }) => sample),
    }
  }

  async importBundle(value: unknown): Promise<SavedSnapshot> {
    if (!value || typeof value !== 'object') throw new Error('Import is not an object')
    const bundle = value as Partial<ExportBundle>
    if (bundle.format !== 'world-simulation-bundle' || bundle.bundleVersion !== 1 || !bundle.snapshot) throw new Error('Unsupported import bundle')
    const snapshot = await validateSnapshot(bundle.snapshot)
    const events = Array.isArray(bundle.events) ? bundle.events : []
    const statistics = Array.isArray(bundle.statistics) ? bundle.statistics : []
    await this.appendTelemetry(events, statistics)
    const saved = await this.saveSnapshot(snapshot, 'named', `Imported at hour ${snapshot.state.tick}`)
    return saved
  }

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const opening = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
        opening.onupgradeneeded = () => {
          const database = opening.result
          const runs = database.createObjectStore('runs', { keyPath: 'runId' })
          runs.createIndex('updatedAt', 'updatedAt')
          const snapshots = database.createObjectStore('snapshots', { keyPath: 'key' })
          snapshots.createIndex('runId', 'runId')
          const events = database.createObjectStore('events', { keyPath: 'storageKey' })
          events.createIndex('runId', 'runId')
          events.createIndex('runTick', ['runId', 'tick'])
          const statistics = database.createObjectStore('statistics', { keyPath: 'storageKey' })
          statistics.createIndex('runId', 'runId')
          statistics.createIndex('runMetricTick', ['runId', 'metricId', 'tick'])
        }
        opening.onsuccess = () => resolve(opening.result)
        opening.onerror = () => reject(opening.error ?? new Error('Unable to open IndexedDB'))
        opening.onblocked = () => reject(new Error('Database upgrade is blocked by another tab'))
      })
    }
    return this.databasePromise
  }
}

/** Community scope is part of identity so two catchments cannot overwrite one another. */
export function statisticStorageKey(sample: StatisticSample): string {
  const scopeId = sample.scope === 'community' ? sample.scopeId : 'world'
  return `${sample.runId}:${sample.scope}:${scopeId}:${sample.metricId}:${sample.tick}`
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}
