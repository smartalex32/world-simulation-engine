export interface NumericDomain { minimum: number; maximum: number; identical: boolean }

export function numericDomain(values: readonly (number | undefined)[], includeZero = false): NumericDomain | undefined {
  const finite = values.filter((value): value is number => value !== undefined && Number.isFinite(value))
  if (finite.length === 0) return undefined
  let minimum = Math.min(...finite)
  let maximum = Math.max(...finite)
  if (includeZero) {
    minimum = Math.min(0, minimum)
    maximum = Math.max(0, maximum)
  }
  if (minimum === maximum) return { minimum: minimum - 0.5, maximum: maximum + 0.5, identical: true }
  return { minimum, maximum, identical: false }
}

export function scaleLinear(value: number, domain: NumericDomain, rangeMinimum: number, rangeMaximum: number): number {
  const ratio = (value - domain.minimum) / (domain.maximum - domain.minimum)
  return rangeMinimum + Math.max(0, Math.min(1, ratio)) * (rangeMaximum - rangeMinimum)
}

export interface LineSegment { key: string; points: string }

export function buildLineSegments(values: readonly { tick: number; value?: number }[], width: number, height: number): LineSegment[] {
  const domain = numericDomain(values.map((datum) => datum.value))
  if (!domain || values.length === 0) return []
  const minimumTick = Math.min(...values.map((datum) => datum.tick))
  const maximumTick = Math.max(...values.map((datum) => datum.tick))
  const tickDomain: NumericDomain = minimumTick === maximumTick
    ? { minimum: minimumTick - 0.5, maximum: maximumTick + 0.5, identical: true }
    : { minimum: minimumTick, maximum: maximumTick, identical: false }
  const segments: LineSegment[] = []
  let current: string[] = []
  let startTick = minimumTick
  const flush = () => {
    if (current.length > 0) segments.push({ key: `${startTick}:${segments.length}`, points: current.join(' ') })
    current = []
  }
  for (const datum of values) {
    if (datum.value === undefined || !Number.isFinite(datum.value)) {
      flush()
      continue
    }
    if (current.length === 0) startTick = datum.tick
    const x = scaleLinear(datum.tick, tickDomain, 2, width - 2)
    const y = scaleLinear(datum.value, domain, height - 2, 2)
    current.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  flush()
  return segments
}

export function deterministicNodePositions(ids: readonly string[], width: number, height: number): ReadonlyMap<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  const radius = Math.max(20, Math.min(width, height) * 0.36)
  ids.forEach((id, index) => {
    const angle = ids.length === 1 ? 0 : (index / ids.length) * Math.PI * 2 - Math.PI / 2
    result.set(id, { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius })
  })
  return result
}
