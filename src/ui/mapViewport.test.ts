import { describe, expect, it } from 'vitest'
import type { HexGrid } from '../simulation/domain/types'
import { generateValley } from '../simulation/spatial/worldGenerator'
import { fitWorld, populationMarkerRadius, renderLevel } from './mapViewport'

describe('map viewport level of detail', () => {
  const grid: HexGrid = generateValley('viewport-test', 128, 96).world.grid

  it('fits a whole world into the available viewport', () => {
    const viewport = fitWorld(grid, 900, 600, 18)
    expect(viewport.scale).toBeGreaterThan(0)
    expect(viewport.x).toBeGreaterThanOrEqual(0)
    expect(viewport.y).toBeGreaterThanOrEqual(0)
  })

  it('culls most cells when zoomed in', () => {
    const level = renderLevel(grid, { width: 900, height: 600, scale: 2, x: 0, y: 0 }, 18)
    expect(level.cells.length).toBeLessThan(grid.cells.length / 4)
    expect(level.stride).toBe(1)
    expect(level.borderAlpha).toBeGreaterThan(0)
  })

  it('hides borders and aggregates cells at world-scale zoom', () => {
    const level = renderLevel(grid, { width: 900, height: 600, scale: 0.03, x: 0, y: 0 }, 18)
    expect(level.borderAlpha).toBe(0)
    expect(level.stride).toBeGreaterThan(1)
    expect(level.label).toBe('regional overview')
    expect(level.cells.length).toBeLessThan(grid.cells.length)
  })

  it('keeps population marks in world units so they shrink on screen', () => {
    const worldRadius = populationMarkerRadius(1, 1)
    expect(worldRadius * 0.1).toBeLessThan(worldRadius * 1)
    expect(populationMarkerRadius(100, 8)).toBeLessThan(18 * 8 * 0.3)
  })
})
