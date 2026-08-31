import type { SimulationEvent } from '../domain/types'
import { EVENT_CATALOG, type SimulationEventType } from './catalog'

export interface EventSequenceRange { first: number; last: number }

export interface EventRetentionReport {
  version: 1
  firstProducedSequence?: number
  lastProducedSequence?: number
  firstRetainedSequence?: number
  lastRetainedSequence?: number
  droppedByType: Partial<Record<SimulationEventType, number>>
  droppedSequenceRanges: EventSequenceRange[]
}

/** Non-authoritative deterministic retention. It observes already-created events
 * and cannot consume RNG or feed simulation decisions. */
export class EventSink {
  private readonly retained: SimulationEvent[] = []
  private readonly counts = new Map<string, number>()
  private readonly droppedByType: Partial<Record<SimulationEventType, number>> = {}
  private readonly droppedSequenceRanges: EventSequenceRange[] = []
  private firstProducedSequence?: number
  private lastProducedSequence?: number

  emit(event: SimulationEvent): void {
    this.firstProducedSequence ??= event.sequence
    this.lastProducedSequence = event.sequence
    const definition = EVENT_CATALOG[event.type]
    const countKey = `${event.tick}:${event.type}`
    const count = this.counts.get(countKey) ?? 0
    this.counts.set(countKey, count + 1)
    const eligibleTick = definition.sampleEveryHours === undefined || event.tick <= (definition.initialSampleHours ?? 0) || event.tick % definition.sampleEveryHours === 0
    if (eligibleTick && (definition.batchLimit === undefined || count < definition.batchLimit)) this.retained.push(event)
    else {
      this.droppedByType[event.type] = (this.droppedByType[event.type] ?? 0) + 1
      const range = this.droppedSequenceRanges.at(-1)
      if (range && range.last + 1 === event.sequence) range.last = event.sequence
      else this.droppedSequenceRanges.push({ first: event.sequence, last: event.sequence })
    }
  }

  batch(): { events: SimulationEvent[]; retention: EventRetentionReport } {
    return { events: this.retained, retention: retentionReport(this.retained, this.firstProducedSequence, this.lastProducedSequence, this.droppedByType, this.droppedSequenceRanges) }
  }
}

export function completeRetention(events: readonly SimulationEvent[]): EventRetentionReport {
  return retentionReport(events, events[0]?.sequence, events.at(-1)?.sequence, {}, [])
}

export function mergeRetention(reports: readonly EventRetentionReport[]): EventRetentionReport {
  const active = reports.filter((report) => report.firstProducedSequence !== undefined)
  const droppedByType: Partial<Record<SimulationEventType, number>> = {}
  for (const report of reports) for (const [type, count] of Object.entries(report.droppedByType) as [SimulationEventType, number][]) droppedByType[type] = (droppedByType[type] ?? 0) + count
  return {
    version: 1,
    firstProducedSequence: active[0]?.firstProducedSequence,
    lastProducedSequence: active.at(-1)?.lastProducedSequence,
    firstRetainedSequence: reports.flatMap((report) => report.firstRetainedSequence ?? []).at(0),
    lastRetainedSequence: reports.flatMap((report) => report.lastRetainedSequence ?? []).at(-1),
    droppedByType,
    droppedSequenceRanges: mergeSequenceRanges(reports.flatMap((report) => report.droppedSequenceRanges)),
  }
}

export function validateRetentionReport(value: unknown): EventRetentionReport {
  if (!value || typeof value !== 'object') throw new Error('Event retention report is invalid')
  const report = value as EventRetentionReport
  if (report.version !== 1 || !validOptionalSequence(report.firstProducedSequence) || !validOptionalSequence(report.lastProducedSequence)
    || !validOptionalSequence(report.firstRetainedSequence) || !validOptionalSequence(report.lastRetainedSequence)
    || !report.droppedByType || typeof report.droppedByType !== 'object' || !Array.isArray(report.droppedSequenceRanges)) throw new Error('Event retention report is invalid')
  for (const [type, count] of Object.entries(report.droppedByType)) if (!Object.hasOwn(EVENT_CATALOG, type) || !Number.isSafeInteger(count) || count < 1) throw new Error('Event retention dropped count is invalid')
  for (const [index, range] of report.droppedSequenceRanges.entries()) {
    const previous = report.droppedSequenceRanges[index - 1]
    if (!range || !validSequence(range.first) || !validSequence(range.last) || range.last < range.first || previous && range.first <= previous.last + 1) throw new Error('Event retention dropped range is invalid')
  }
  const droppedCount = Object.values(report.droppedByType).reduce((sum, count) => sum + (count ?? 0), 0)
  const rangedCount = report.droppedSequenceRanges.reduce((sum, range) => sum + range.last - range.first + 1, 0)
  if (droppedCount !== rangedCount) throw new Error('Event retention dropped counts do not match sequence ranges')
  if ((report.firstProducedSequence === undefined) !== (report.lastProducedSequence === undefined)
    || report.firstProducedSequence !== undefined && report.lastProducedSequence! < report.firstProducedSequence
    || (report.firstRetainedSequence === undefined) !== (report.lastRetainedSequence === undefined)
    || report.firstRetainedSequence !== undefined && (report.firstProducedSequence === undefined || report.firstRetainedSequence < report.firstProducedSequence || report.lastRetainedSequence! > report.lastProducedSequence!)
    || report.droppedSequenceRanges.some((range) => report.firstProducedSequence === undefined || range.first < report.firstProducedSequence || range.last > report.lastProducedSequence!)) throw new Error('Event retention watermarks are inconsistent')
  return structuredClone(report)
}

function retentionReport(events: readonly SimulationEvent[], firstProducedSequence: number | undefined, lastProducedSequence: number | undefined, droppedByType: Partial<Record<SimulationEventType, number>>, droppedSequenceRanges: readonly EventSequenceRange[]): EventRetentionReport {
  return { version: 1, firstProducedSequence, lastProducedSequence, firstRetainedSequence: events[0]?.sequence, lastRetainedSequence: events.at(-1)?.sequence, droppedByType: { ...droppedByType }, droppedSequenceRanges: droppedSequenceRanges.map((range) => ({ ...range })) }
}

function mergeSequenceRanges(values: readonly EventSequenceRange[]): EventSequenceRange[] {
  const ranges: EventSequenceRange[] = []
  for (const range of [...values].sort((a, b) => a.first - b.first || a.last - b.last)) {
    const previous = ranges.at(-1)
    if (previous && range.first <= previous.last + 1) previous.last = Math.max(previous.last, range.last)
    else ranges.push({ ...range })
  }
  return ranges
}
function validOptionalSequence(value: unknown): boolean { return value === undefined || validSequence(value) }
function validSequence(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
