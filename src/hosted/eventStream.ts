/** Ordered, bounded, resumable operational event stream. Event data is
 * noncanonical and is reconstructed from durable world/run reads after a
 * process restart; callers must not treat it as simulation authority. */
export interface HostedStreamEvent { id: number; topic: string; payload: unknown; createdAt: string }
export class HostedEventStream {
  private readonly events: HostedStreamEvent[] = []
  private nextId = 1
  constructor(private readonly capacity = 1_000) {}
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
