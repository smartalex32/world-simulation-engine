/** Environment-neutral canonical JSON. Object keys use code-point ordering,
 * undefined object properties are omitted, and array order remains semantic. */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortCanonicalValue(value))
}

function sortCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonicalValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, sortCanonicalValue(entry)]),
    )
  }
  return value
}
