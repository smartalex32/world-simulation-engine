/** Ordered, bounded, resumable operational event stream. Event data is
 * noncanonical and is reconstructed from durable world/run reads after a
 * process restart; callers must not treat it as simulation authority. */
export interface HostedStreamEvent { id: number; topic: string; payload: unknown; createdAt: string }
export interface HostedEventStreamState { version: 1; nextId: number; events: readonly HostedStreamEvent[] }
export class HostedEventStream {
  private readonly events: HostedStreamEvent[] = []
  private nextId = 1
  constructor(private readonly capacity = 1_000) {}
  static restore(value: HostedEventStreamState, capacity = 1_000): HostedEventStream {
    if (!value || value.version !== 1 || !Number.isSafeInteger(value.nextId) || value.nextId < 1 || !Array.isArray(value.events)) throw new Error('Hosted event stream state is invalid')
    const stream = new HostedEventStream(capacity)
    let previous = 0
    for (const event of value.events) { if (!Number.isSafeInteger(event.id) || event.id < 1 || event.id <= previous || typeof event.topic !== 'string' || !event.topic || typeof event.createdAt !== 'string') throw new Error('Hosted event stream event is invalid'); previous = event.id; stream.events.push(Object.freeze(structuredClone(event))) }
    if (previous >= value.nextId) throw new Error('Hosted event stream state is invalid')
    if (stream.events.length > capacity) stream.events.splice(0, stream.events.length - capacity)
    stream.nextId = value.nextId; return stream
  }
  snapshotState(): HostedEventStreamState { return structuredClone({ version: 1 as const, nextId: this.nextId, events: this.events }) }
  publish(topic: string, payload: unknown, createdAt: string): HostedStreamEvent {
    const event = Object.freeze({ id: this.nextId++, topic, payload: structuredClone(payload), createdAt })
    this.events.push(event); if (this.events.length > this.capacity) this.events.splice(0, this.events.length - this.capacity)
    return event
  }
  after(lastEventId?: number): readonly HostedStreamEvent[] {
    if (lastEventId !== undefined && (!Number.isSafeInteger(lastEventId) || lastEventId < 0)) throw new Error('Last-Event-ID is invalid')
    return Object.freeze(this.events.filter((event) => event.id > (lastEventId ?? 0)).map((event) => structuredClone(event)))
  }
  writeSse(response: { writeHead(status: number, headers: Record<string, string>): void; write(value: string): void }, lastEventId?: number): void {
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    for (const event of this.after(lastEventId)) response.write(`id: ${event.id}\nevent: ${event.topic}\ndata: ${JSON.stringify(event.payload)}\n\n`)
  }
}
