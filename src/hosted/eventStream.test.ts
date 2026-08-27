import { describe, expect, it } from 'vitest'
import { HostedEventStream } from './eventStream'

describe('hosted event stream', () => {
  it('orders, bounds, and resumes event IDs without entering canonical state', () => {
    const stream = new HostedEventStream(2); stream.publish('draft', { revision: 1 }, '2026-01-01T00:00:00.000Z'); stream.publish('projection', { tick: 1 }, '2026-01-01T00:00:01.000Z'); stream.publish('job', { id: 'job' }, '2026-01-01T00:00:02.000Z')
    expect(stream.after().map(({ id, topic }) => [id, topic])).toEqual([[2, 'projection'], [3, 'job']]); expect(stream.after(2).map(({ id }) => id)).toEqual([3])
  })
  it('restores its bounded resumable state without reusing event IDs', () => {
    const stream = new HostedEventStream(2); stream.publish('draft', { revision: 1 }, '2026-01-01T00:00:00.000Z'); stream.publish('draft', { revision: 2 }, '2026-01-01T00:00:01.000Z')
    const restored = HostedEventStream.restore(stream.snapshotState(), 2); restored.publish('run', { id: 'one' }, '2026-01-01T00:00:02.000Z')
    expect(restored.after().map((event) => event.id)).toEqual([2, 3])
  })
})
