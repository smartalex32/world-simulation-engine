import type { SimulationEvent, StatisticSample, WorldDraftRecord, WorldStatisticMetricId } from '../simulation/domain/types'
import { summarizeCheckpoint, type HistoricalCheckpoint } from '../history/checkpoints'
import { validateWorldDraftRecord } from '../simulation/domain/worldDraft'
import { validateSnapshot } from '../simulation/serialization/snapshot'
import { validateWorkerContinuation } from '../worker/frameScheduler'
import { DEFAULT_PREINDUSTRIAL_PACK, exportContentPack, createContentPackResolver, validateContentPack, type ContentPack, type ResolvedContentPack } from '../contentPacks'
import { compareStableText } from '../shared/stableOrder'
import { EMPTY_TELEMETRY_WATERMARK, type TelemetryWatermark, type WorkbenchCheckpointEnvelope, type WorkbenchSnapshotEnvelope } from '../runtime/contracts'
import { decodeEventPayload, EVENT_CATALOG, type SimulationEventType } from '../simulation/events/catalog'
import { mergeRetention, validateRetentionReport, type EventRetentionReport, type EventSequenceRange } from '../simulation/events/retention'

const DATABASE_NAME = 'world-simulation-workbench'
const DATABASE_VERSION = 4
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
  telemetry?: TelemetryCommitMetadata
}

export interface TelemetryCommitMetadata {
  version: 1
  through: TelemetryWatermark
  eventRetention: EventRetentionReport
}

export interface TelemetryIntegrity {
  status: 'complete' | 'gapped' | 'uncheckpointed'
  committed: TelemetryWatermark
  unexplainedSequenceGaps: EventSequenceRange[]
  droppedByType: EventRetentionReport['droppedByType']
}

export interface SavedSnapshot {
  key: string
  runId: string
  kind: 'autosave' | 'named' | 'checkpoint'
  name: string
  createdAt: string
  snapshot: WorkbenchSnapshotEnvelope
  telemetry?: TelemetryCommitMetadata
}
export interface StoredContentPack { id: string; version: string; savedAt: string; pack: ContentPack }

interface StoredEvent extends SimulationEvent { storageKey: string }
type StoredStatistic = StatisticSample & { storageKey: string }

export interface ExportBundle {
  format: 'world-simulation-bundle'
  bundleVersion: 3
  exportedAt: string
  snapshot: WorkbenchSnapshotEnvelope
  /** Immutable artifacts required to resolve the snapshot's reference-only graph. */
  contentPacks: readonly ContentPack[]
  events: SimulationEvent[]
  statistics: StatisticSample[]
  telemetry: TelemetryCommitMetadata
}

type NdjsonManifest = Omit<ExportBundle, 'events' | 'statistics'> & { record: 'manifest' }
type NdjsonRecord = NdjsonManifest | { record: 'event'; value: SimulationEvent } | { record: 'statistic'; value: StatisticSample }

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
  telemetry: TelemetryIntegrity
}

export class WorkbenchDatabase {
  private databasePromise?: Promise<IDBDatabase>

  /** Atomically commits a snapshot and the exact worker telemetry delta that
   * reaches it. Event/statistic keys are deterministic, so repeating the same
   * envelope after an uncertain failure is idempotent. */
  async saveCheckpoint(checkpointValue: WorkbenchCheckpointEnvelope, kind: 'autosave' | 'named' | 'checkpoint', name?: string): Promise<SavedSnapshot> {
    const checkpoint = validateWorkbenchCheckpoint(checkpointValue)
    await this.resolveSnapshotContentPack(checkpoint.snapshot)
    const database = await this.open()
    const now = new Date().toISOString()
    const transaction = database.transaction(['runs', 'snapshots', 'events', 'statistics'], 'readwrite')
    const runs = transaction.objectStore('runs')
    const previous = await request<RunRecord | undefined>(runs.get(checkpoint.snapshot.state.runId))
    const durable = previous?.telemetry?.through ?? EMPTY_TELEMETRY_WATERMARK
    const isRetry = sameWatermark(durable, checkpoint.through)
    if (!isRetry && watermarkCovers(durable, checkpoint.through)) {
      transaction.abort()
      throw new Error(`Stale checkpoint telemetry: durable ${formatWatermark(durable)}, checkpoint reaches ${formatWatermark(checkpoint.through)}`)
    }
    if (!isRetry && !sameWatermark(durable, checkpoint.committed)) {
      transaction.abort()
      throw new Error(`Checkpoint telemetry conflict: durable ${formatWatermark(durable)}, worker expected ${formatWatermark(checkpoint.committed)}`)
    }
    const eventRetention = isRetry
      ? previous!.telemetry!.eventRetention
      : mergeRetention([previous?.telemetry?.eventRetention ?? emptyRetention(), checkpoint.eventRetention])
    const telemetry: TelemetryCommitMetadata = { version: 1, through: isRetry ? durable : checkpoint.through, eventRetention }
    const key = kind === 'autosave' ? `${checkpoint.snapshot.state.runId}:autosave`
      : kind === 'checkpoint' ? `${checkpoint.snapshot.state.runId}:checkpoint:${checkpoint.snapshot.state.tick}`
        : `${checkpoint.snapshot.state.runId}:named:${checkpoint.checkpointId}`
    const saved: SavedSnapshot = {
      key,
      runId: checkpoint.snapshot.state.runId,
      kind,
      name: kind === 'autosave' ? 'Autosave' : kind === 'checkpoint' ? `Checkpoint at hour ${checkpoint.snapshot.state.tick}` : (name?.trim() || `Snapshot at hour ${checkpoint.snapshot.state.tick}`),
      createdAt: now,
      snapshot: checkpoint.snapshot,
      telemetry,
    }
    for (const event of checkpoint.events) transaction.objectStore('events').put({ ...event, storageKey: event.id } satisfies StoredEvent)
    for (const sample of checkpoint.statistics) transaction.objectStore('statistics').put({ ...sample, storageKey: statisticStorageKey(sample) } satisfies StoredStatistic)
    const tick = Math.max(previous?.tick ?? 0, checkpoint.snapshot.state.tick)
    runs.put({ runId: saved.runId, seed: checkpoint.snapshot.state.config.seed, tick, engineVersion: checkpoint.snapshot.engineVersion, createdAt: previous?.createdAt ?? now, updatedAt: now, telemetry } satisfies RunRecord)
    transaction.objectStore('snapshots').put(saved)
    await transactionDone(transaction)
    if (kind === 'checkpoint') await this.trimCheckpoints(saved.runId)
    return saved
  }

  /** Retains only bounded checkpoint evidence; named saves remain user-owned. */
  private async trimCheckpoints(runId: string): Promise<void> {
    const checkpoints = (await this.listSnapshots(runId)).filter((snapshot) => snapshot.kind === 'checkpoint')
    await Promise.all(checkpoints.slice(DEFAULT_CHECKPOINT_LIMIT).map((snapshot) => this.deleteSnapshot(snapshot.key)))
  }

  /** Starts a new telemetry epoch for a freshly created authoritative run while
   * preserving user-owned named snapshots. Serialized ahead of the first
   * checkpoint by the persistence controller. */
  async resetRunTelemetry(runId: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(['runs', 'events', 'statistics'], 'readwrite')
    transaction.objectStore('runs').delete(runId)
    deleteByIndex(transaction.objectStore('events').index('runId'), IDBKeyRange.only(runId))
    deleteByIndex(transaction.objectStore('statistics').index('runId'), IDBKeyRange.only(runId))
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
    const run = await request<RunRecord | undefined>(database.transaction('runs').objectStore('runs').get(runId))
    const committed = run?.telemetry?.through
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
      events: events.filter((event) => committed === undefined || event.sequence <= committed.eventSequence).map(({ storageKey: _, ...event }) => event),
      statistics: statistics
        .map(({ storageKey: _, ...sample }) => sample)
        .sort((first, second) => first.tick - second.tick || compareStableText(first.metricId, second.metricId)),
      checkpoints: (await this.listSnapshots(runId))
        .filter((snapshot) => snapshot.kind === 'checkpoint')
        .slice(0, DEFAULT_CHECKPOINT_LIMIT)
        .map((snapshot) => summarizeCheckpoint(snapshot.snapshot))
        .sort((first, second) => first.tick - second.tick),
      telemetry: await inspectTelemetryIntegrity(database, runId, run?.telemetry),
    }
  }

  async deleteSnapshot(key: string): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction('snapshots', 'readwrite')
    transaction.objectStore('snapshots').delete(key)
    await transactionDone(transaction)
  }

  /** Streams the primary browser export as versioned NDJSON. IndexedDB cursors
   * feed the stream directly; no complete telemetry log is materialized. */
  async exportBundleNdjson(snapshot: WorkbenchSnapshotEnvelope): Promise<ReadableStream<Uint8Array>> {
    const database = await this.open()
    const resolved = await this.resolveSnapshotContentPack(snapshot)
    const run = await request<RunRecord | undefined>(database.transaction('runs').objectStore('runs').get(snapshot.state.runId))
    if (!run?.telemetry) throw new Error('Run has no committed telemetry checkpoint to export')
    assertTelemetryComplete(await inspectTelemetryIntegrity(database, snapshot.state.runId, run.telemetry))
    const manifest: NdjsonManifest = { record: 'manifest', format: 'world-simulation-bundle', bundleVersion: 3, exportedAt: new Date().toISOString(), snapshot, contentPacks: resolved.packs, telemetry: run.telemetry }
    const encoder = new TextEncoder()
    return new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(manifest)}\n`))
          await streamCursor<StoredEvent>(database.transaction('events').objectStore('events').index('runSequence'), IDBKeyRange.bound([snapshot.state.runId, 0], [snapshot.state.runId, run.telemetry!.through.eventSequence]), (stored) => {
            const { storageKey: _, ...value } = stored
            controller.enqueue(encoder.encode(`${JSON.stringify({ record: 'event', value } satisfies NdjsonRecord)}\n`))
          })
          await streamCursor<StoredStatistic>(database.transaction('statistics').objectStore('statistics').index('runId'), IDBKeyRange.only(snapshot.state.runId), (stored) => {
            const { storageKey: _, ...value } = stored
            controller.enqueue(encoder.encode(`${JSON.stringify({ record: 'statistic', value } satisfies NdjsonRecord)}\n`))
          })
          controller.close()
        } catch (error) { controller.error(error) }
      },
    })
  }

  async importBundleNdjson(stream: ReadableStream<Uint8Array>): Promise<SavedSnapshot> {
    const decoder = new TextDecoder()
    const reader = stream.getReader()
    let buffer = ''
    let manifest: NdjsonManifest | undefined
    const events: SimulationEvent[] = []
    const statistics: StatisticSample[] = []
    const consume = (line: string) => {
      if (!line.trim()) return
      const record = JSON.parse(line) as NdjsonRecord
      if (record.record === 'manifest') {
        if (manifest) throw new Error('Import contains multiple manifests')
        manifest = record
      } else if (record.record === 'event') events.push(record.value)
      else if (record.record === 'statistic') statistics.push(record.value)
      else throw new Error('Import contains an unknown NDJSON record')
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); newline = buffer.indexOf('\n') }
    }
    buffer += decoder.decode()
    consume(buffer)
    if (!manifest) throw new Error('Import manifest is missing')
    const { record: _, ...bundle } = manifest
    return this.importBundle({ ...bundle, events, statistics })
  }

  async importBundle(value: unknown): Promise<SavedSnapshot> {
    if (!value || typeof value !== 'object') throw new Error('Import is not an object')
    const bundle = value as Partial<ExportBundle>
    if (bundle.format !== 'world-simulation-bundle' || bundle.bundleVersion !== 3 || !bundle.snapshot || !Array.isArray(bundle.contentPacks) || !bundle.telemetry) throw new Error('Unsupported import bundle')
    const config = (bundle.snapshot as WorkbenchSnapshotEnvelope).state?.config
    if (!config || typeof config.contentPackId !== 'string' || typeof config.contentPackVersion !== 'string') throw new Error('Imported snapshot content-pack reference is invalid')
    const artifacts = bundle.contentPacks.map((pack) => validateContentPack(pack).pack)
    const resolved = createContentPackResolver([DEFAULT_PREINDUSTRIAL_PACK, ...artifacts]).resolve(config.contentPackId, config.contentPackVersion)
    const validated = await validateSnapshot(bundle.snapshot, resolved)
    const workerContinuation = validateWorkerContinuation((bundle.snapshot as WorkbenchSnapshotEnvelope).workerContinuation)
    const snapshot: WorkbenchSnapshotEnvelope = workerContinuation ? { ...validated, workerContinuation } : validated
    const events = validateImportedEvents(snapshot.state.runId, bundle.events).sort((first, second) => first.sequence - second.sequence)
    const statistics = validateImportedStatistics(snapshot.state.runId, bundle.statistics)
    const telemetry = validateTelemetryCommit(bundle.telemetry)
    validateImportedTelemetryPrefix(snapshot, events, statistics, telemetry)
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
      telemetry,
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
    runs.put({ runId: snapshot.state.runId, seed: snapshot.state.config.seed, tick: snapshot.state.tick, engineVersion: snapshot.engineVersion, createdAt: previous?.createdAt ?? now, updatedAt: now, telemetry } satisfies RunRecord)
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
            events.createIndex('runSequence', ['runId', 'sequence'], { unique: true })
          } else {
            const events = opening.transaction!.objectStore('events')
            if (!events.indexNames.contains('runSequence')) events.createIndex('runSequence', ['runId', 'sequence'], { unique: true })
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
      || !nonNegativeSafeInteger(event.tick) || !nonNegativeSafeInteger(event.sequence) || event.version !== 1 || typeof event.type !== 'string' || !Object.hasOwn(EVENT_CATALOG, event.type)
      || (event.cellId !== undefined && typeof event.cellId !== 'string')) {
      throw new Error('Import contains an invalid event')
    }
    const type = event.type as SimulationEventType
    return { ...event, type, version: 1, payload: decodeEventPayload(type, event.version, event.payload) } as SimulationEvent
  })
}

export function validateWorkbenchCheckpoint(value: unknown): WorkbenchCheckpointEnvelope {
  if (!isRecord(value) || value.version !== 1 || typeof value.checkpointId !== 'string' || value.checkpointId.length === 0 || !isRecord(value.snapshot)
    || !validWatermark(value.committed) || !validWatermark(value.through) || !Array.isArray(value.events) || !Array.isArray(value.statistics)) throw new Error('Workbench checkpoint is invalid')
  const checkpoint = value as unknown as WorkbenchCheckpointEnvelope
  const runId = checkpoint.snapshot.state?.runId
  if (typeof runId !== 'string' || checkpoint.through.eventSequence !== checkpoint.snapshot.state.nextEventSequence - 1
    || checkpoint.through.statisticTick !== checkpoint.snapshot.state.tick || !watermarkCovers(checkpoint.through, checkpoint.committed)) throw new Error('Workbench checkpoint watermark is invalid')
  const events = validateImportedEvents(runId, checkpoint.events).sort((a, b) => a.sequence - b.sequence)
  const statistics = validateImportedStatistics(runId, checkpoint.statistics)
  if (events.some((event, index) => event.sequence <= checkpoint.committed.eventSequence || event.sequence > checkpoint.through.eventSequence || index > 0 && event.sequence === events[index - 1]!.sequence)
    || statistics.some((sample) => sample.tick <= checkpoint.committed.statisticTick || sample.tick > checkpoint.through.statisticTick)) throw new Error('Workbench checkpoint telemetry is outside its watermark')
  const eventRetention = validateRetentionReport(checkpoint.eventRetention)
  const firstProducedSequence = eventRetention.firstProducedSequence ?? checkpoint.through.eventSequence + 1
  if (firstProducedSequence < checkpoint.committed.eventSequence + 1
    || eventRetention.lastProducedSequence !== undefined && eventRetention.lastProducedSequence !== checkpoint.through.eventSequence) throw new Error('Workbench checkpoint retention does not match its watermark')
  const unexplained = unexplainedRanges(firstProducedSequence, checkpoint.through.eventSequence, events.map((event) => event.sequence), eventRetention.droppedSequenceRanges)
  if (unexplained.length > 0) throw new Error(`Workbench checkpoint telemetry has an unexplained sequence gap at ${unexplained[0]!.first}`)
  return { ...structuredClone(checkpoint), events, statistics, eventRetention }
}

export function validateTelemetryCommit(value: unknown): TelemetryCommitMetadata {
  if (!isRecord(value) || value.version !== 1 || !validWatermark(value.through)) throw new Error('Telemetry commit metadata is invalid')
  return { version: 1, through: { ...value.through }, eventRetention: validateRetentionReport(value.eventRetention) }
}

function validateImportedTelemetryPrefix(snapshot: WorkbenchSnapshotEnvelope, events: readonly SimulationEvent[], statistics: readonly StatisticSample[], telemetry: TelemetryCommitMetadata): void {
  if (telemetry.through.eventSequence !== snapshot.state.nextEventSequence - 1 || telemetry.through.statisticTick !== snapshot.state.tick) throw new Error('Imported telemetry watermark does not match its snapshot')
  const firstProducedSequence = telemetry.eventRetention.firstProducedSequence ?? telemetry.through.eventSequence + 1
  if (telemetry.eventRetention.lastProducedSequence !== undefined && telemetry.eventRetention.lastProducedSequence !== telemetry.through.eventSequence
    || events.some((event, index) => event.sequence < firstProducedSequence || event.sequence > telemetry.through.eventSequence || index > 0 && event.sequence === events[index - 1]!.sequence)
    || statistics.some((sample) => sample.tick > telemetry.through.statisticTick)) throw new Error('Imported telemetry falls outside its committed prefix')
  const unexplained = unexplainedRanges(firstProducedSequence, telemetry.through.eventSequence, events.map((event) => event.sequence), telemetry.eventRetention.droppedSequenceRanges)
  if (unexplained.length > 0) throw new Error(`Imported telemetry has an unexplained sequence gap at ${unexplained[0]!.first}`)
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
async function inspectTelemetryIntegrity(database: IDBDatabase, runId: string, commit?: TelemetryCommitMetadata): Promise<TelemetryIntegrity> {
  if (!commit) return { status: 'uncheckpointed', committed: EMPTY_TELEMETRY_WATERMARK, unexplainedSequenceGaps: [], droppedByType: {} }
  const sequences = await cursorMap<StoredEvent, number>(database.transaction('events').objectStore('events').index('runSequence'), IDBKeyRange.bound([runId, 0], [runId, commit.through.eventSequence]), 'next', (value) => value.sequence)
  const gaps = unexplainedRanges(commit.eventRetention.firstProducedSequence ?? commit.through.eventSequence + 1, commit.through.eventSequence, sequences, commit.eventRetention.droppedSequenceRanges)
  return { status: gaps.length === 0 ? 'complete' : 'gapped', committed: commit.through, unexplainedSequenceGaps: gaps, droppedByType: commit.eventRetention.droppedByType }
}

function unexplainedRanges(first: number, last: number, retained: readonly number[], dropped: readonly EventSequenceRange[]): EventSequenceRange[] {
  if (last < first) return []
  const covered = [...retained.map((sequence) => ({ first: sequence, last: sequence })), ...dropped]
    .filter((range) => range.last >= first && range.first <= last)
    .map((range) => ({ first: Math.max(first, range.first), last: Math.min(last, range.last) }))
    .sort((a, b) => a.first - b.first || a.last - b.last)
  const gaps: EventSequenceRange[] = []
  let next = first
  for (const range of covered) {
    if (range.first > next) gaps.push({ first: next, last: range.first - 1 })
    next = Math.max(next, range.last + 1)
  }

  if (next <= last) gaps.push({ first: next, last })
  return gaps
}

function emptyRetention(): EventRetentionReport { return { version: 1, droppedByType: {}, droppedSequenceRanges: [] } }
function validWatermark(value: unknown): value is TelemetryWatermark { return isRecord(value) && safeWatermarkPart(value.eventSequence) && safeWatermarkPart(value.statisticTick) }
function safeWatermarkPart(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= -1 }
function sameWatermark(left: TelemetryWatermark, right: TelemetryWatermark): boolean { return left.eventSequence === right.eventSequence && left.statisticTick === right.statisticTick }
function watermarkCovers(left: TelemetryWatermark, right: TelemetryWatermark): boolean { return left.eventSequence >= right.eventSequence && left.statisticTick >= right.statisticTick }
function formatWatermark(value: TelemetryWatermark): string { return `${value.eventSequence}/${value.statisticTick}` }
function assertTelemetryComplete(integrity: TelemetryIntegrity): void { if (integrity.status !== 'complete') throw new Error(`Telemetry export is ${integrity.status}${integrity.unexplainedSequenceGaps[0] ? ` at sequence ${integrity.unexplainedSequenceGaps[0].first}` : ''}`) }

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

function cursorMap<TValue, TResult>(index: IDBIndex, keyRange: IDBKeyRange, direction: IDBCursorDirection, map: (value: TValue) => TResult): Promise<TResult[]> {
  return new Promise((resolve, reject) => {
    const values: TResult[] = []
    const operation = index.openCursor(keyRange, direction)
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB cursor failed'))
    operation.onsuccess = () => {
      const cursor = operation.result
      if (!cursor) { resolve(values); return }
      values.push(map(cursor.value as TValue))
      cursor.continue()
    }
  })
}

function streamCursor<T>(index: IDBIndex, keyRange: IDBKeyRange, consume: (value: T) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const operation = index.openCursor(keyRange, 'next')
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB export cursor failed'))
    operation.onsuccess = () => {
      const cursor = operation.result
      if (!cursor) { resolve(); return }
      consume(cursor.value as T)
      cursor.continue()
    }
  })
}

function deleteByIndex(index: IDBIndex, keyRange: IDBKeyRange): void {
  const operation = index.openKeyCursor(keyRange)
  operation.onsuccess = () => { const cursor = operation.result; if (cursor) { index.objectStore.delete(cursor.primaryKey); cursor.continue() } }
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
