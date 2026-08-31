import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'
import { completeRetention, mergeRetention, type EventRetentionReport } from '../simulation/events/retention'

export const MAX_TICKS_PER_WORKER_TURN = 24
export const TELEMETRY_EVENT_FLUSH_THRESHOLD = 1000
export const TELEMETRY_STATISTIC_FLUSH_THRESHOLD = 500

export interface TickQuantum {
  ticks: number
  clockEventHours: number | false
}

export interface SimulationBatchState {
  remaining: number
  advanced: number
}

export interface WorkerContinuationState {
  version: 1
  ticksPerBatch: number
  batch: SimulationBatchState
}

/** Worker scheduling state stays outside canonical simulation state and its digest. */
export class SimulationBatchScheduler {
  private remaining = 0
  private advanced = 0

  next(ticksPerBatch: number, maximum = MAX_TICKS_PER_WORKER_TURN): TickQuantum {
    assertPositive(ticksPerBatch, 'Ticks per batch')
    assertPositive(maximum, 'Maximum ticks per turn')
    if (this.remaining === 0) this.remaining = ticksPerBatch
    const ticks = Math.min(maximum, this.remaining)
    const completes = ticks === this.remaining
    const clockEventHours = completes ? this.advanced + ticks : false
    this.remaining -= ticks
    this.advanced = completes ? 0 : this.advanced + ticks
    return { ticks, clockEventHours }
  }

  finalizePartial(): number | undefined {
    const hours = this.advanced || undefined
    this.reset()
    return hours
  }

  reset(): void {
    this.remaining = 0
    this.advanced = 0
  }

  state(): Readonly<SimulationBatchState> {
    return { remaining: this.remaining, advanced: this.advanced }
  }

  restore(state: SimulationBatchState): void {
    validateBatchState(state)
    this.remaining = state.remaining
    this.advanced = state.advanced
  }
}

export function validateWorkerContinuation(value: unknown): WorkerContinuationState | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object') throw new Error('Worker continuation is invalid')
  const checkpoint = value as Partial<WorkerContinuationState>
  if (checkpoint.version !== 1) throw new Error(`Unsupported worker continuation version: ${String(checkpoint.version)}`)
  assertPositive(checkpoint.ticksPerBatch as number, 'Continuation ticks per batch')
  if ((checkpoint.ticksPerBatch as number) > 8760) throw new RangeError('Continuation ticks per batch must not exceed 8760')
  validateBatchState(checkpoint.batch)
  return {
    version: 1,
    ticksPerBatch: checkpoint.ticksPerBatch as number,
    batch: { remaining: checkpoint.batch!.remaining, advanced: checkpoint.batch!.advanced },
  }
}

export class TelemetryBuffer {
  private readonly events: SimulationEvent[] = []
  private readonly statistics: StatisticSample[] = []
  private readonly retention: EventRetentionReport[] = []

  append(events: readonly SimulationEvent[], statistics: readonly StatisticSample[], retention: EventRetentionReport = completeRetention(events)): void {
    this.events.push(...events)
    this.statistics.push(...statistics)
    this.retention.push(retention)
  }

  shouldFlush(): boolean {
    return this.events.length >= TELEMETRY_EVENT_FLUSH_THRESHOLD || this.statistics.length >= TELEMETRY_STATISTIC_FLUSH_THRESHOLD
  }

  drain(): { events: SimulationEvent[]; statistics: StatisticSample[]; eventRetention: EventRetentionReport } {
    return { events: this.events.splice(0, this.events.length), statistics: this.statistics.splice(0, this.statistics.length), eventRetention: mergeRetention(this.retention.splice(0, this.retention.length)) }
  }

  clear(): void {
    this.events.length = 0
    this.statistics.length = 0
    this.retention.length = 0
  }

  counts(): Readonly<{ events: number; statistics: number }> {
    return { events: this.events.length, statistics: this.statistics.length }
  }
}

/** Retry buffer for the transactional browser checkpoint boundary. A request
 * acknowledges only the prior durable watermark; data is pruned on the next
 * request, after IndexedDB has reported a successful commit. */
export class CheckpointTelemetryBuffer {
  private readonly events: SimulationEvent[] = []
  private readonly statistics: StatisticSample[] = []
  private readonly retention: EventRetentionReport[] = []

  append(events: readonly SimulationEvent[], statistics: readonly StatisticSample[], retention: EventRetentionReport = completeRetention(events)): void {
    this.events.push(...events)
    this.statistics.push(...statistics)
    this.retention.push(retention)
  }

  since(eventSequence: number, statisticTick: number): { events: SimulationEvent[]; statistics: StatisticSample[]; eventRetention: EventRetentionReport } {
    this.prune(eventSequence, statisticTick)
    return {
      events: this.events.filter((event) => event.sequence > eventSequence),
      statistics: this.statistics.filter((sample) => sample.tick > statisticTick),
      eventRetention: mergeRetention(this.retention.filter((report) => (report.lastProducedSequence ?? -1) > eventSequence)),
    }
  }

  clear(): void { this.events.length = 0; this.statistics.length = 0; this.retention.length = 0 }

  private prune(eventSequence: number, statisticTick: number): void {
    while (this.events[0] && this.events[0].sequence <= eventSequence) this.events.shift()
    while (this.statistics[0] && this.statistics[0].tick <= statisticTick) this.statistics.shift()
    while (this.retention[0] && (this.retention[0].lastProducedSequence ?? -1) <= eventSequence) this.retention.shift()
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive safe integer`)
}

function validateBatchState(value: unknown): asserts value is SimulationBatchState {
  if (!value || typeof value !== 'object') throw new Error('Worker continuation batch is invalid')
  const state = value as Partial<SimulationBatchState>
  if (!Number.isSafeInteger(state.remaining) || (state.remaining as number) < 0 || !Number.isSafeInteger(state.advanced) || (state.advanced as number) < 0) {
    throw new RangeError('Worker continuation batch values must be non-negative safe integers')
  }
  const remaining = state.remaining as number
  const advanced = state.advanced as number
  if ((remaining === 0) !== (advanced === 0)) throw new Error('Worker continuation batch must be either idle or partially advanced')
  if (remaining + advanced > 8760) throw new RangeError('Worker continuation batch exceeds the maximum logical batch')
}
