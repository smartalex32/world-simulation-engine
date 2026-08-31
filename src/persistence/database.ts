import type { SimulationEvent, StatisticSample, WorldDraftRecord, WorldStatisticMetricId } from '../simulation/domain/types'
import { summarizeCheckpoint, type HistoricalCheckpoint } from '../history/checkpoints'
import { validateWorldDraftRecord } from '../simulation/domain/worldDraft'
import { validateSnapshot } from '../simulation/serialization/snapshot'
import { validateWorkerContinuation } from '../worker/frameScheduler'
import type { WorkbenchSnapshotEnvelope } from '../runtime/contracts'
import { DEFAULT_PREINDUSTRIAL_PACK, exportContentPack, createContentPackResolver, validateContentPack, type ContentPack, type ResolvedContentPack } from '../contentPacks'
import { compareStableText } from '../shared/stableOrder'

const DATABASE_NAME = 'world-simulation-workbench'
const DATABASE_VERSION = 3
const MAX_TICK = Number.MAX_SAFE_INTEGER

export const DEFAULT_HISTORY_EVENT_LIMIT = 200
export const DEFAULT_HISTORY_SAMPLE_LIMIT = 365
export const DEFAULT_CHECKPOINT_LIMIT = 24

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
  kind: 'autosave' | 'named' | 'checkpoint'
  name: string
  createdAt: string
  snapshot: WorkbenchSnapshotEnvelope
}
export interface StoredContentPack { id: string; version: string; savedAt: string; pack: ContentPack }

interface StoredEvent extends SimulationEvent { storageKey: string }
type StoredStatistic = StatisticSample & { storageKey: string }

export interface ExportBundle {
  format: 'world-simulation-bundle'
  bundleVersion: 2
  exportedAt: string
  snapshot: WorkbenchSnapshotEnvelope
  /** Immutable artifacts required to resolve the snapshot's reference-only graph. */
  contentPacks: readonly ContentPack[]
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
  checkpoints: HistoricalCheckpoint[]
}

export class WorkbenchDatabase {
  private databasePromise?: Promise<IDBDatabase>

  async saveSnapshot(snapshot: WorkbenchSnapshotEnvelope, kind: 'autosave' | 'named' | 'checkpoint', name?: string): Promise<SavedSnapshot> {
    // Persistence accepts only a canonical state whose referenced pack resolves
    // locally; envelope/digest validation remains serialization-owned.
    await this.resolveSnapshotContentPack(snapshot)
    const database = await this.open()
    const now = new Date().toISOString()
    const key = kind === 'autosave' ? `${snapshot.state.runId}:autosave` : kind === 'checkpoint' ? `${snapshot.state.runId}:checkpoint:${snapshot.state.tick}` : `${snapshot.state.runId}:named:${crypto.randomUUID()}`
    const saved: SavedSnapshot = {
      key,
      runId: snapshot.state.runId,
      kind,
      name: kind === 'autosave' ? 'Autosave' : kind === 'checkpoint' ? `Checkpoint at hour ${snapshot.state.tick}` : (name?.trim() || `Snapshot at hour ${snapshot.state.tick}`),
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
    if (kind === 'checkpoint') await this.trimCheckpoints(snapshot.state.runId)
    return saved
  }

  /** Retains only bounded checkpoint evidence; named saves remain user-owned. */
  private async trimCheckpoints(runId: string): Promise<void> {
    const checkpoints = (await this.listSnapshots(runId)).filter((snapshot) => snapshot.kind === 'checkpoint')
    await Promise.all(checkpoints.slice(DEFAULT_CHECKPOINT_LIMIT).map((snapshot) => this.deleteSnapshot(snapshot.key)))
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
    return records.map(validateWorldDraftRecord).sort((first, second) => compareStableText(first.draftId, second.draftId))
  }

  async deleteWorldDraft(draftId: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction('worldDrafts', 'readwrite')
    transaction.objectStore('worldDrafts').delete(draftId)
    await transactionDone(transaction)
  }

  /** Packs are authored data, separate from a run's immutable selected pack reference. */
  async saveContentPack(pack: ContentPack): Promise<StoredContentPack> {
    const validated = validateContentPack(pack).pack
    assertContentPackVersionImmutable(validated)
    const saved: StoredContentPack = { id: validated.manifest.id, version: validated.manifest.version, savedAt: new Date().toISOString(), pack: validated }
    const database = await this.open()
    const transaction = database.transaction('contentPacks', 'readwrite')
    const store = transaction.objectStore('contentPacks')
    const existing = await request<StoredContentPack | undefined>(store.get([saved.id, saved.version]))
    if (existing && exportContentPack(existing.pack) !== exportContentPack(validated)) {
      transaction.abort()
      throw new Error(`Content pack version is immutable: ${saved.id}@${saved.version}`)
    }
    store.put(saved)
    await transactionDone(transaction)
    return saved
  }
  async listContentPacks(): Promise<StoredContentPack[]> {
    const database = await this.open()
    const records = await request<StoredContentPack[]>(database.transaction('contentPacks').objectStore('contentPacks').getAll())
    return records.map((record) => ({ ...record, pack: validateContentPack(record.pack).pack })).sort((left, right) => compareStableText(left.id, right.id) || compareStableText(left.version, right.version))
  }
  async deleteContentPack(id: string, version: string): Promise<void> {
    const database = await this.open(); const transaction = database.transaction('contentPacks', 'readwrite')
    transaction.objectStore('contentPacks').delete([id, version]); await transactionDone(transaction)
  }

  /** Resolves the exact graph referenced by a saved snapshot before it crosses
   * the worker boundary.  The default pack is built in; every other artifact
   * must already be present in the local immutable catalog. */
  async resolveSnapshotContentPack(snapshot: WorkbenchSnapshotEnvelope): Promise<ResolvedContentPack> {
    const config = snapshot.state?.config
    if (!config || typeof config.contentPackId !== 'string' || typeof config.contentPackVersion !== 'string') throw new Error('Snapshot content-pack reference is invalid')
    const resolver = createContentPackResolver([DEFAULT_PREINDUSTRIAL_PACK, ...(await this.listContentPacks()).map((entry) => entry.pack)])
    const resolved = resolver.resolve(config.contentPackId, config.contentPackVersion)
    await validateSnapshot(snapshot, resolved)
    return resolved
  }

  async listRuns(): Promise<RunRecord[]> {
    const database = await this.open()
    const records = await request<RunRecord[]>(database.transaction('runs').objectStore('runs').getAll())
    return records.sort((a, b) => compareStableText(b.updatedAt, a.updatedAt))
  }

  async listSnapshots(runId?: string): Promise<SavedSnapshot[]> {
    const database = await this.open()
    const store = database.transaction('snapshots').objectStore('snapshots')
    const records = runId ? await request<SavedSnapshot[]>(store.index('runId').getAll(runId)) : await request<SavedSnapshot[]>(store.getAll())
    return records.sort((a, b) => compareStableText(b.createdAt, a.createdAt))
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
        .sort((first, second) => first.tick - second.tick || compareStableText(first.metricId, second.metricId)),
      checkpoints: (await this.listSnapshots(runId))
        .filter((snapshot) => snapshot.kind === 'checkpoint')
        .slice(0, DEFAULT_CHECKPOINT_LIMIT)
        .map((snapshot) => summarizeCheckpoint(snapshot.snapshot))
        .sort((first, second) => first.tick - second.tick),
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
    const resolved = await this.resolveSnapshotContentPack(snapshot)
    const events = await request<StoredEvent[]>(database.transaction('events').objectStore('events').index('runId').getAll(snapshot.state.runId))
    const statistics = await request<StoredStatistic[]>(database.transaction('statistics').objectStore('statistics').index('runId').getAll(snapshot.state.runId))
    return {
      format: 'world-simulation-bundle',
      bundleVersion: 2,
      exportedAt: new Date().toISOString(),
      snapshot,
      contentPacks: resolved.packs,
      events: events.map(({ storageKey: _, ...event }) => event),
      statistics: statistics.map(({ storageKey: _, ...sample }) => sample),
    }
  }

  async importBundle(value: unknown): Promise<SavedSnapshot> {
    if (!value || typeof value !== 'object') throw new Error('Import is not an object')
    const bundle = value as Partial<ExportBundle>
    if (bundle.format !== 'world-simulation-bundle' || bundle.bundleVersion !== 2 || !bundle.snapshot || !Array.isArray(bundle.contentPacks)) throw new Error('Unsupported import bundle')
    const config = (bundle.snapshot as WorkbenchSnapshotEnvelope).state?.config
    if (!config || typeof config.contentPackId !== 'string' || typeof config.contentPackVersion !== 'string') throw new Error('Imported snapshot content-pack reference is invalid')
    const artifacts = bundle.contentPacks.map((pack) => validateContentPack(pack).pack)
    const resolved = createContentPackResolver([DEFAULT_PREINDUSTRIAL_PACK, ...artifacts]).resolve(config.contentPackId, config.contentPackVersion)
    const validated = await validateSnapshot(bundle.snapshot, resolved)
    const workerContinuation = validateWorkerContinuation((bundle.snapshot as WorkbenchSnapshotEnvelope).workerContinuation)
    const snapshot: WorkbenchSnapshotEnvelope = workerContinuation ? { ...validated, workerContinuation } : validated
    const events = validateImportedEvents(snapshot.state.runId, bundle.events)
    const statistics = validateImportedStatistics(snapshot.state.runId, bundle.statistics)
    // An imported snapshot without its retained evidence is misleading, and
    // retained evidence without its snapshot is orphaned. Validate first,
    // then commit the complete local bundle in one IndexedDB transaction.
    const database = await this.open()
    const now = new Date().toISOString()
    const saved: SavedSnapshot = {
      key: `${snapshot.state.runId}:named:${crypto.randomUUID()}`,
      runId: snapshot.state.runId,
      kind: 'named',
      name: `Imported at hour ${snapshot.state.tick}`,
      createdAt: now,
      snapshot,
    }
    const transaction = database.transaction(['runs', 'snapshots', 'events', 'statistics', 'contentPacks'], 'readwrite')
    const packStore = transaction.objectStore('contentPacks')
    for (const pack of resolved.packs) {
      if (pack.manifest.id === DEFAULT_PREINDUSTRIAL_PACK.manifest.id && pack.manifest.version === DEFAULT_PREINDUSTRIAL_PACK.manifest.version) continue
      const existing = await request<StoredContentPack | undefined>(packStore.get([pack.manifest.id, pack.manifest.version]))
      if (existing && exportContentPack(existing.pack) !== exportContentPack(pack)) {
        transaction.abort()
        throw new Error(`Content pack version is immutable: ${pack.manifest.id}@${pack.manifest.version}`)
      }
      packStore.put({ id: pack.manifest.id, version: pack.manifest.version, savedAt: now, pack } satisfies StoredContentPack)
    }
    const runs = transaction.objectStore('runs')
    const previous = await request<RunRecord | undefined>(runs.get(snapshot.state.runId))
    runs.put({ runId: snapshot.state.runId, seed: snapshot.state.config.seed, tick: snapshot.state.tick, engineVersion: snapshot.engineVersion, createdAt: previous?.createdAt ?? now, updatedAt: now } satisfies RunRecord)
    transaction.objectStore('snapshots').put(saved)
    const eventStore = transaction.objectStore('events')
    for (const event of events) eventStore.put({ ...event, storageKey: event.id } satisfies StoredEvent)
    const statisticStore = transaction.objectStore('statistics')
    for (const sample of statistics) statisticStore.put({ ...sample, storageKey: statisticStorageKey(sample) } satisfies StoredStatistic)
    await transactionDone(transaction)
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
          if (!database.objectStoreNames.contains('contentPacks')) database.createObjectStore('contentPacks', { keyPath: ['id', 'version'] })
        }
        opening.onsuccess = () => resolve(opening.result)
        opening.onerror = () => reject(opening.error ?? new Error('Unable to open IndexedDB'))
        opening.onblocked = () => reject(new Error('Database upgrade is blocked by another tab'))
      })
    }
    return this.databasePromise
  }
}

/** The built-in pack is an immutable catalog entry even before IndexedDB has
 * materialized a row for it. */
export function assertContentPackVersionImmutable(pack: ContentPack): void {
  if (pack.manifest.id === DEFAULT_PREINDUSTRIAL_PACK.manifest.id && pack.manifest.version === DEFAULT_PREINDUSTRIAL_PACK.manifest.version && exportContentPack(pack) !== exportContentPack(DEFAULT_PREINDUSTRIAL_PACK)) {
    throw new Error(`Content pack version is immutable: ${pack.manifest.id}@${pack.manifest.version}`)
  }
}

/** Imported evidence is non-authoritative, but it must still be bound to the
 * imported run and structurally valid before the transaction begins. */
export function validateImportedEvents(runId: string, value: unknown): SimulationEvent[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('Import events must be an array')
  return value.map((event) => {
    if (!isRecord(event) || typeof event.id !== 'string' || event.id.length === 0 || event.runId !== runId
      || !nonNegativeSafeInteger(event.tick) || event.version !== 1 || typeof event.type !== 'string'
      || !isPrimitiveRecord(event.payload) || (event.cellId !== undefined && typeof event.cellId !== 'string')) {
      throw new Error('Import contains an invalid event')
    }
    return event as unknown as SimulationEvent
  })
}

/** Statistic metric identifiers remain forward-compatible, while their scope,
 * tick, numeric value, and run binding are checked before storage. */
export function validateImportedStatistics(runId: string, value: unknown): StatisticSample[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('Import statistics must be an array')
  return value.map((sample) => {
    if (!isRecord(sample) || sample.runId !== runId || !nonNegativeSafeInteger(sample.tick) || sample.metricVersion !== 1
      || typeof sample.metricId !== 'string' || sample.metricId.length === 0 || typeof sample.value !== 'number' || !Number.isFinite(sample.value)
      || (sample.scope !== 'world' && sample.scope !== 'community')
      || (sample.scope === 'world' && sample.scopeId !== undefined)
      || (sample.scope === 'community' && (typeof sample.scopeId !== 'string' || sample.scopeId.length === 0))) {
      throw new Error('Import contains an invalid statistic')
    }
    return sample as unknown as StatisticSample
  })
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function nonNegativeSafeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function isPrimitiveRecord(value: unknown): value is Record<string, string | number | boolean | null> {
  return isRecord(value) && Object.values(value).every((item) => item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
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
