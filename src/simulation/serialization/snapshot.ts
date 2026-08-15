import { ENGINE_VERSION, SNAPSHOT_SCHEMA_VERSION, type SimulationState, type SnapshotEnvelope } from '../domain/types'

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, sortValue(entry)]),
    )
  }
  return value
}

export async function stateDigest(state: SimulationState): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(state))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createSnapshot(state: SimulationState): Promise<SnapshotEnvelope> {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    state: structuredClone(state),
    digest: await stateDigest(state),
  }
}

export async function validateSnapshot(value: unknown): Promise<SnapshotEnvelope> {
  if (!value || typeof value !== 'object') throw new Error('Snapshot is not an object')
  const snapshot = value as Partial<SnapshotEnvelope>
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) throw new Error(`Unsupported snapshot schema: ${String(snapshot.schemaVersion)}`)
  if (snapshot.engineVersion !== ENGINE_VERSION) throw new Error(`Unsupported engine version: ${String(snapshot.engineVersion)}`)
  if (!snapshot.state || typeof snapshot.digest !== 'string') throw new Error('Snapshot is missing state or digest')
  if (snapshot.state.config?.baseTickHours !== 1 || !Number.isSafeInteger(snapshot.state.tick) || snapshot.state.tick < 0) {
    throw new Error('Snapshot contains an invalid clock')
  }
  const actual = await stateDigest(snapshot.state)
  if (actual !== snapshot.digest) throw new Error('Snapshot digest does not match its contents')
  return snapshot as SnapshotEnvelope
}
