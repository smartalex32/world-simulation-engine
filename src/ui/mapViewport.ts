import type { GeographicCell, HexGrid } from '../simulation/domain/types'

const SQRT_3 = Math.sqrt(3)

export interface MapViewportState {
  width: number
  height: number
  scale: number
  x: number
  y: number
}

export interface RenderLevel {
  cells: GeographicCell[]
  stride: number
  cellRadius: number
  borderAlpha: number
  label: 'hex detail' | 'terrain overview' | 'regional overview'
}

export function fitWorld(grid: HexGrid, width: number, height: number, hexSize: number, padding = 34): MapViewportState {
  const boundsWidth = SQRT_3 * hexSize * (grid.width + (grid.height - 1) / 2)
  const boundsHeight = hexSize * (1.5 * (grid.height - 1) + 2)
  const availableWidth = Math.max(1, width - padding * 2)
  const availableHeight = Math.max(1, height - padding * 2)
  const scale = Math.max(0.015, Math.min(2.5, availableWidth / boundsWidth, availableHeight / boundsHeight))
  return {
    width,
    height,
    scale,
    x: (width - boundsWidth * scale) / 2 + (SQRT_3 * hexSize * scale) / 2,
    y: (height - boundsHeight * scale) / 2 + hexSize * scale,
  }
}

export function renderLevel(grid: HexGrid, viewport: MapViewportState, hexSize: number): RenderLevel {
  const projectedRadius = hexSize * viewport.scale
  const stride = projectedRadius < 1.5 ? Math.min(128, Math.ceil(1.5 / Math.max(projectedRadius, 0.001))) : 1
  const borderAlpha = projectedRadius >= 7 ? 0.48 : projectedRadius <= 4 ? 0 : ((projectedRadius - 4) / 3) * 0.48
  const worldMinX = -viewport.x / viewport.scale - hexSize * stride
  const worldMaxX = (viewport.width - viewport.x) / viewport.scale + hexSize * stride
  const worldMinY = -viewport.y / viewport.scale - hexSize * stride
  const worldMaxY = (viewport.height - viewport.y) / viewport.scale + hexSize * stride
  const rMin = clamp(Math.floor(worldMinY / (1.5 * hexSize)) - stride, 0, grid.height - 1)
  const rMax = clamp(Math.ceil(worldMaxY / (1.5 * hexSize)) + stride, 0, grid.height - 1)
  const cells: GeographicCell[] = []
  const firstR = alignDown(rMin, stride)

  for (let r = firstR; r <= rMax; r += stride) {
    if (r < 0 || r >= grid.height) continue
    const qMin = clamp(Math.floor(worldMinX / (SQRT_3 * hexSize) - r / 2) - stride, 0, grid.width - 1)
    const qMax = clamp(Math.ceil(worldMaxX / (SQRT_3 * hexSize) - r / 2) + stride, 0, grid.width - 1)
    const firstQ = alignDown(qMin, stride)
    for (let q = firstQ; q <= qMax; q += stride) {
      if (q < 0 || q >= grid.width) continue
      const cell = grid.cells[r * grid.width + q]
      if (cell) cells.push(cell)
    }
  }

  return {
    cells,
    stride,
    cellRadius: hexSize * stride * 1.035,
    borderAlpha,
    label: stride > 1 ? 'regional overview' : borderAlpha === 0 ? 'terrain overview' : 'hex detail',
  }
}

export function populationMarkerRadius(count: number, stride: number, selected = false): number {
  if (stride === 1) return selected ? 4.5 : 2.6
  return Math.min(18 * stride * 0.28, 2 + Math.sqrt(count) * 1.35)
}

function alignDown(value: number, interval: number): number {
  return Math.floor(value / interval) * interval
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
