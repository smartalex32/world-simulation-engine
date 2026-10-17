import type { ProjectedMapCell, ProjectionOverlay } from '../../projection'

/**
 * Presentation-only terrain marks.  The hash is deliberately derived from a
 * cell id, rather than a random source, so panning and redraws never make the
 * map shimmer or affect simulation reproducibility.
 */
export function terrainFill(cell: Pick<ProjectedMapCell, 'terrain' | 'elevation' | 'environment'>, overlay: ProjectionOverlay, fallback: string): string {
  if (overlay !== 'terrain') return fallback
  if (cell.terrain === 'water') return cell.environment?.lake ? '#31677a' : '#275d73'
  if (cell.terrain === 'hill') return cell.elevation > 800 ? '#777266' : '#6b7651'
  const productivity = cell.environment?.ecologicalProductivityPermille ?? 500
  return productivity >= 650 ? '#4f8050' : productivity <= 300 ? '#9a8050' : '#69834e'
}

export function drawTerrainIllustration(context: CanvasRenderingContext2D, cell: ProjectedMapCell, x: number, y: number, radius: number, projectedScale: number): void {
  // Texture is not useful below this threshold and must stay bounded per cell.
  if (projectedScale * radius < 4) return
  const seed = hash(cell.id)
  const unit = Math.max(.001, projectedScale)
  context.save()
  hexClip(context, x, y, radius - .55)
  if (cell.terrain === 'water') drawWater(context, x, y, radius, seed, unit)
  else if (cell.terrain === 'hill') drawRidges(context, x, y, radius, seed, unit)
  else drawTrees(context, x, y, radius, seed, unit, cell.environment?.ecologicalProductivityPermille ?? 500)
  context.restore()
}

function drawWater(context: CanvasRenderingContext2D, x: number, y: number, radius: number, seed: number, unit: number): void {
  context.strokeStyle = 'rgba(191, 232, 235, .27)'
  context.lineWidth = Math.max(.45, .8 / unit)
  for (let index = 0; index < 3; index += 1) {
    const offset = ((seed >>> (index * 5)) & 7) - 3
    const waveY = y + offset + (index - 1) * radius * .3
    context.beginPath()
    context.moveTo(x - radius * .62, waveY)
    context.quadraticCurveTo(x - radius * .15, waveY - 2.2, x + radius * .22, waveY)
    context.quadraticCurveTo(x + radius * .48, waveY + 1.5, x + radius * .68, waveY - .6)
    context.stroke()
  }
}

function drawRidges(context: CanvasRenderingContext2D, x: number, y: number, radius: number, seed: number, unit: number): void {
  context.strokeStyle = 'rgba(54, 59, 43, .52)'
  context.lineWidth = Math.max(.55, 1 / unit)
  for (let index = 0; index < 3; index += 1) {
    const ridgeX = x + (((seed >>> (index * 4)) & 15) / 15 - .5) * radius
    const ridgeY = y + (index - 1) * radius * .34
    context.beginPath()
    context.moveTo(ridgeX - radius * .35, ridgeY + radius * .18)
    context.lineTo(ridgeX, ridgeY - radius * .2)
    context.lineTo(ridgeX + radius * .32, ridgeY + radius * .15)
    context.stroke()
  }
}

function drawTrees(context: CanvasRenderingContext2D, x: number, y: number, radius: number, seed: number, unit: number, productivity: number): void {
  const count = productivity < 350 ? 1 : productivity > 700 ? 4 : 2
  context.fillStyle = productivity < 350 ? 'rgba(91, 99, 48, .48)' : 'rgba(32, 84, 48, .55)'
  for (let index = 0; index < count; index += 1) {
    const local = mix(seed, index + 1)
    const treeX = x + (((local & 255) / 255) - .5) * radius * 1.05
    const treeY = y + ((((local >>> 8) & 255) / 255) - .5) * radius * .95
    const treeRadius = Math.max(.8 / unit, radius * .11)
    context.beginPath()
    context.moveTo(treeX, treeY - treeRadius * 1.45)
    context.lineTo(treeX + treeRadius, treeY + treeRadius)
    context.lineTo(treeX - treeRadius, treeY + treeRadius)
    context.closePath()
    context.fill()
  }
}

function hexClip(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath()
  for (let index = 0; index < 6; index += 1) {
    const angle = (60 * index - 30) * Math.PI / 180
    const pointX = x + radius * Math.cos(angle)
    const pointY = y + radius * Math.sin(angle)
    if (index === 0) context.moveTo(pointX, pointY)
    else context.lineTo(pointX, pointY)
  }
  context.closePath()
  context.clip()
}

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619)
  return result >>> 0
}

function mix(value: number, index: number): number {
  let result = value + Math.imul(index, 0x9e3779b9)
  result = Math.imul(result ^ (result >>> 16), 0x85ebca6b)
  return (result ^ (result >>> 13)) >>> 0
}
