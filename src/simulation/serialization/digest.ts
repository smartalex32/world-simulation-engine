import type { SimulationState } from '../domain/types'

/** Stable JSON representation used by every versioned snapshot envelope. */
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

/** The digest authenticates state only; envelope audit metadata is excluded. */
export async function stateDigest(state: SimulationState | Record<string, unknown>): Promise<string> {
  return canonicalDigest(state)
}

/** Hashes non-authoritative envelope audit evidence with the same stable encoding. */
export async function canonicalDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
