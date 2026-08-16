import type { MapProjectionRequest, ProjectionOverlay } from '../projection'
import { axialToPixel, pixelToAxial } from '../simulation/spatial/hex'

const SQRT_3 = Math.sqrt(3)
const MINIMUM_SCALE = 1e-6

export interface MapViewportState {
  width: number
  height: number
  scale: number
  x: number
  y: number
}

export interface WorldDimensions {
  width: number
  height: number
}

export function fitWorld(world: WorldDimensions, width: number, height: number, hexSize: number, padding = 34): MapViewportState {
  const boundsWidth = SQRT_3 * hexSize * (world.width + (world.height - 1) / 2)
  const boundsHeight = hexSize * (1.5 * (world.height - 1) + 2)
  const availableWidth = Math.max(1, width - padding * 2)
  const availableHeight = Math.max(1, height - padding * 2)
  const scale = Math.max(MINIMUM_SCALE, Math.min(2.5, availableWidth / boundsWidth, availableHeight / boundsHeight))
  return { width, height, scale, x: (width - boundsWidth * scale) / 2 + (SQRT_3 * hexSize * scale) / 2, y: (height - boundsHeight * scale) / 2 + hexSize * scale }
}

/** Creates a bounded, non-authoritative map request. It never participates in simulation state or RNG. */
export function mapProjectionRequest(world: WorldDimensions, viewport: MapViewportState, hexSize: number, revision: number, overlay: ProjectionOverlay, options: { communityMeasureId?: MapProjectionRequest['communityMeasureId']; focusCellId?: string; hookedPersonId?: string } = {}): MapProjectionRequest {
  const corners = [
    pixelToAxial((-viewport.x) / viewport.scale, (-viewport.y) / viewport.scale, hexSize),
    pixelToAxial((viewport.width - viewport.x) / viewport.scale, (-viewport.y) / viewport.scale, hexSize),
    pixelToAxial((-viewport.x) / viewport.scale, (viewport.height - viewport.y) / viewport.scale, hexSize),
    pixelToAxial((viewport.width - viewport.x) / viewport.scale, (viewport.height - viewport.y) / viewport.scale, hexSize),
  ]
  const qValues = corners.map(({ q }) => q)
  const rValues = corners.map(({ r }) => r)
  return {
    revision,
    bounds: {
      minQ: clamp(Math.min(...qValues) - 2, 0, world.width - 1),
      maxQ: clamp(Math.max(...qValues) + 2, 0, world.width - 1),
      minR: clamp(Math.min(...rValues) - 2, 0, world.height - 1),
      maxR: clamp(Math.max(...rValues) + 2, 0, world.height - 1),
    },
    projectedHexRadius: Math.max(0, hexSize * viewport.scale),
    overlay,
    ...options,
  }
}

/** Four shared axial boundaries make neighboring aggregate regions tile continuously without hex outlines. */
export function aggregateRegionPolygon(q: number, r: number, qMax: number, rMax: number, hexSize: number): readonly { x: number; y: number }[] {
  return [
    axialToPixel({ q: q - .5, r: r - .5 }, hexSize),
    axialToPixel({ q: qMax + .5, r: r - .5 }, hexSize),
    axialToPixel({ q: qMax + .5, r: rMax + .5 }, hexSize),
    axialToPixel({ q: q - .5, r: rMax + .5 }, hexSize),
  ]
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)) }
