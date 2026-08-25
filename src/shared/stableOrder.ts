/**
 * Locale-independent text ordering for authoritative identifiers.
 * Never use localeCompare for simulation, persistence, or protocol ordering:
 * its result may vary with the host runtime's ICU data and user locale.
 */
export function compareStableText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0
}

