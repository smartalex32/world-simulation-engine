import type { HexCoord } from '../domain/types'

export const HEX_DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export function cellId({ q, r }: HexCoord): string {
  return `${q},${r}`
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map(({ q, r }) => ({ q: coord.q + q, r: coord.r + r }))
}

export function isInBounds(coord: HexCoord, width: number, height: number): boolean {
  return Number.isInteger(coord.q) && Number.isInteger(coord.r) && coord.q >= 0 && coord.r >= 0 && coord.q < width && coord.r < height
}

export function axialToPixel(coord: HexCoord, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (coord.q + coord.r / 2),
    y: size * 1.5 * coord.r,
  }
}

export function pixelToAxial(x: number, y: number, size: number): HexCoord {
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / size
  const r = ((2 / 3) * y) / size
  return roundAxial(q, r)
}

function roundAxial(q: number, r: number): HexCoord {
  const x = q
  const z = r
  const y = -x - z
  let rx = Math.round(x)
  let ry = Math.round(y)
  let rz = Math.round(z)
  const xDiff = Math.abs(rx - x)
  const yDiff = Math.abs(ry - y)
  const zDiff = Math.abs(rz - z)
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz
  else if (yDiff > zDiff) ry = -rx - rz
  else rz = -rx - ry
  void ry
  return { q: rx, r: rz }
}
