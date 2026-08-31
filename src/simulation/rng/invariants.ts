import { HOUSEHOLD_GENERATION_STREAM } from '../households/config'
import { failCanonicalValidation as fail } from '../validation/error'

/** Canonical validation owned by the named-RNG subsystem. */
export function validateRandomStreams(value: unknown): void {
  if (!Array.isArray(value)) fail('randomStreams', 'state.randomStreams', 'shape', 'Snapshot contains invalid random streams')
  const names: string[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') fail('randomStreams', 'state.randomStreams', 'entry', 'Snapshot contains an invalid random stream')
    const stream = entry as { name?: unknown; stateHex?: unknown; incrementHex?: unknown }
    if (typeof stream.name !== 'string' || !/^[0-9a-f]{16}$/i.test(String(stream.stateHex)) || !/^[0-9a-f]{16}$/i.test(String(stream.incrementHex))) fail('randomStreams', 'state.randomStreams', 'entry', 'Snapshot contains an invalid random stream')
    names.push(stream.name)
  }
  if (!names.every((name, index) => index === 0 || (names[index - 1] as string) < name)) fail('randomStreams', 'state.randomStreams', 'ordering', 'Snapshot random streams are not in canonical order')
  for (const required of Object.values(HOUSEHOLD_GENERATION_STREAM)) if (!names.includes(required)) fail('randomStreams', 'state.randomStreams', 'missing-required-stream', `Snapshot is missing random stream: ${required}`)
}
