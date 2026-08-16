import { PROJECTION_CHUNK_SIZE, type AxialViewportBounds, type ProjectionRegionSize } from './types'

export function projectionChunkKey(q: number, r: number): string {
  return `chunk:${Math.floor(q / PROJECTION_CHUNK_SIZE)}:${Math.floor(r / PROJECTION_CHUNK_SIZE)}`
}

export function regionKey(size: ProjectionRegionSize, q: number, r: number): string {
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError('Region size must be a positive safe integer')
  return `lod:${size}:${Math.floor(q / size)}:${Math.floor(r / size)}`
}

export function alignRegionOrigin(value: number, size: ProjectionRegionSize): number {
  return Math.floor(value / size) * size
}

export function regionCount(bounds: AxialViewportBounds, size: ProjectionRegionSize): number {
  const firstQ = alignRegionOrigin(bounds.minQ, size)
  const firstR = alignRegionOrigin(bounds.minR, size)
  return (Math.floor((bounds.maxQ - firstQ) / size) + 1) * (Math.floor((bounds.maxR - firstR) / size) + 1)
}

export function clampViewportBounds(bounds: AxialViewportBounds, width: number, height: number): AxialViewportBounds {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) throw new RangeError('World dimensions must be positive safe integers')
  const normalized = {
    minQ: integerOr(bounds.minQ, 0),
    maxQ: integerOr(bounds.maxQ, width - 1),
    minR: integerOr(bounds.minR, 0),
    maxR: integerOr(bounds.maxR, height - 1),
  }
  const lowQ = Math.min(normalized.minQ, normalized.maxQ)
  const highQ = Math.max(normalized.minQ, normalized.maxQ)
  const lowR = Math.min(normalized.minR, normalized.maxR)
  const highR = Math.max(normalized.minR, normalized.maxR)
  return {
    minQ: clamp(lowQ, 0, width - 1),
    maxQ: clamp(highQ, 0, width - 1),
    minR: clamp(lowR, 0, height - 1),
    maxR: clamp(highR, 0, height - 1),
  }
}

function integerOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(value) : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
