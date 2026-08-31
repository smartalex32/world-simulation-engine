import type { SimulationState } from '../domain/types'
import { canonicalStringify } from '../../shared/canonicalJson'
export { canonicalStringify } from '../../shared/canonicalJson'

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
