import type { SimulationEvent, StatisticSample, WorldDraftRecord, WorldStatisticMetricId } from '../simulation/domain/types'
import { validateWorldDraftRecord } from '../simulation/domain/worldDraft'
import { validateSnapshot } from '../simulation/serialization/snapshot'
import { validateWorkerContinuation } from '../worker/frameScheduler'
import type { WorkbenchSnapshotEnvelope } from '../worker/protocol'

const DATABASE_NAME = 'world-simulation-workbench'
const DATABASE_VERSION = 2
const MAX_TICK = Number.MAX_SAFE_INTEGER

export const DEFAULT_HISTORY_EVENT_LIMIT = 200
export const DEFAULT_HISTORY_SAMPLE_LIMIT = 365

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
  snapshot: WorkbenchSnapshotEnvelope
}

interface StoredEvent extends SimulationEvent { storageKey: string }
type StoredStatistic = StatisticSample & { storageKey: string }

export interface ExportBundle {
  format: 'world-simulation-bundle'
  bundleVersion: 1
  exportedAt: string
  snapshot: WorkbenchSnapshotEnvelope
  events: SimulationEvent[]
  statistics: StatisticSample[]
}

export interface RunHistoryQuery {
  /** Bounded newest-first event history. */
  eventLimit?: number
  /** World metrics to retrieve. Each metric receives its own bounded series. */
  metricIds: readonly WorldStatisticMetricId[]
  sampleLimit?: number
}

export interface RunHistory {
  events: SimulationEvent[]
  statistics: StatisticSample[]
}

export class WorkbenchDatabase {
  private databasePromise?: Promise<IDBDatabase>

  async saveSnapshot(snapshot: WorkbenchSnapshotEnvelope, kind: 'autosave' | 'named', name?: string): Promise<SavedSnapshot> {
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

  /** Drafts are deliberately separate from authoritative snapshots and runs. */
  async saveWorldDraft(record: WorldDraftRecord): Promise<WorldDraftRecord> {
    const validated = validateWorldDraftRecord(record)
    const database = await this.open()
    const transaction = database.transaction('worldDrafts', 'readwrite')
    transaction.objectStore('worldDrafts').put(validated)
    await transactionDone(transaction)
    return validated
  }

  async loadWorldDraft(draftId: string): Promise<WorldDraftRecord | undefined> {
    const database = await this.open()
    const record = await request<unknown>(database.transaction('worldDrafts').objectStore('worldDrafts').get(draftId))
    return record === undefined ? undefined : validateWorldDraftRecord(record)
  }

  async listWorldDrafts(): Promise<WorldDraftRecord[]> {
    const database = await this.open()
    const records = await request<unknown[]>(database.transaction('worldDrafts').objectStore('worldDrafts').getAll())
    return records.map(validateWorldDraftRecord).sort((first, second) => first.draftId.localeCompare(second.draftId))
  }

  async deleteWorldDraft(draftId: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction('worldDrafts', 'readwrite')
    transaction.objectStore('worldDrafts').delete(draftId)
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

  /**
   * Reads a bounded, indexed history without loading a run's complete event
   * log. History is evidence only: this never mutates authoritative state.
   */
  async readHistory(runId: string, query: RunHistoryQuery): Promise<RunHistory> {
    const database = await this.open()
    const eventLimit = boundedHistoryLimit(query.eventLimit, DEFAULT_HISTORY_EVENT_LIMIT)
    const sampleLimit = boundedHistoryLimit(query.sampleLimit, DEFAULT_HISTORY_SAMPLE_LIMIT)
    const eventTransaction = database.transaction('events')
    const events = await cursorValues<StoredEvent>(
      eventTransaction.objectStore('events').index('runTick'),
      IDBKeyRange.bound([runId, 0], [runId, MAX_TICK]),
      'prev',
      eventLimit,
    )
    const statisticTransaction = database.transaction('statistics')
    const statistics = (await Promise.all([...query.metricIds]
      .sort()
      .map((metricId) => cursorValues<StoredStatistic>(
        statisticTransaction.objectStore('statistics').index('runMetricTick'),
        IDBKeyRange.bound([runId, metricId, 0], [runId, metricId, MAX_TICK]),
        'prev',
        sampleLimit,
      )))).flat()
    return {
      events: events.map(({ storageKey: _, ...event }) => event),
      statistics: statistics
        .map(({ storageKey: _, ...sample }) => sample)
        .sort((first, second) => first.tick - second.tick || first.metricId.localeCompare(second.metricId)),
    }
  }

  async deleteSnapshot(key: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction('snapshots', 'readwrite')
    transaction.objectStore('snapshots').delete(key)
    await transactionDone(transaction)
  }

  async exportBundle(snapshot: WorkbenchSnapshotEnvelope): Promise<ExportBundle> {
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
    const validated = await validateSnapshot(bundle.snapshot)
    const workerContinuation = validateWorkerContinuation((bundle.snapshot as WorkbenchSnapshotEnvelope).workerContinuation)
    const snapshot: WorkbenchSnapshotEnvelope = workerContinuation ? { ...validated, workerContinuation } : validated
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
          if (!database.objectStoreNames.contains('runs')) {
            const runs = database.createObjectStore('runs', { keyPath: 'runId' })
            runs.createIndex('updatedAt', 'updatedAt')
          }
          if (!database.objectStoreNames.contains('snapshots')) {
            const snapshots = database.createObjectStore('snapshots', { keyPath: 'key' })
            snapshots.createIndex('runId', 'runId')
          }
          if (!database.objectStoreNames.contains('events')) {
            const events = database.createObjectStore('events', { keyPath: 'storageKey' })
            events.createIndex('runId', 'runId')
            events.createIndex('runTick', ['runId', 'tick'])
          }
          if (!database.objectStoreNames.contains('statistics')) {
            const statistics = database.createObjectStore('statistics', { keyPath: 'storageKey' })
            statistics.createIndex('runId', 'runId')
            statistics.createIndex('runMetricTick', ['runId', 'metricId', 'tick'])
          }
          if (!database.objectStoreNames.contains('worldDrafts')) database.createObjectStore('worldDrafts', { keyPath: 'draftId' })
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

function cursorValues<T>(index: IDBIndex, keyRange: IDBKeyRange, direction: IDBCursorDirection, limit: number): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const values: T[] = []
    const operation = index.openCursor(keyRange, direction)
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB cursor failed'))
    operation.onsuccess = () => {
      const cursor = operation.result
      if (!cursor || values.length >= limit) {
        resolve(values)
        return
      }
      values.push(cursor.value as T)
      cursor.continue()
    }
  })
}

function boundedHistoryLimit(value: number | undefined, fallback: number): number {
  if (!Number.isSafeInteger(value) || value === undefined || value < 1) return fallback
  return Math.min(value, 5_000)
}


function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}
