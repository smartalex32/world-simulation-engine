import { describe, expect, it } from 'vitest'
import { aggregateRegionPolygon, fitWorld, mapProjectionRequest } from './mapViewport'

describe('map viewport projection requests', () => {
  it('fits a whole small world into the available viewport', () => {
    const viewport = fitWorld({ width: 128, height: 96 }, 900, 600, 18)
    expect(viewport.scale).toBeGreaterThan(0)
    expect(viewport.x).toBeGreaterThanOrEqual(0)
    expect(viewport.y).toBeGreaterThanOrEqual(0)
  })

  it('fits an 8192-square world without a legacy zoom floor and requests its full bounded extent', () => {
    const world = { width: 8192, height: 8192 }
    const viewport = fitWorld(world, 900, 600, 18)
    expect(viewport.scale).toBeLessThan(.01)
    const request = mapProjectionRequest(world, viewport, 18, 1, 'terrain')
    expect(request.bounds).toEqual({ minQ: 0, maxQ: 8191, minR: 0, maxR: 8191 })
    expect(request.projectedHexRadius).toBeLessThan(4)
  })

  it('keeps a local viewport request small and carries only render intent', () => {
    const world = { width: 8192, height: 8192 }
    const request = mapProjectionRequest(world, { width: 900, height: 600, scale: 2, x: 0, y: 0 }, 18, 42, 'community', { communityMeasureId: 'community.emergent.socialTrust', focusCellId: '4,3', hookedPersonId: 'person-0001' })
    expect(request.revision).toBe(42)
    expect(request.bounds.maxQ - request.bounds.minQ + 1).toBeLessThan(100)
    expect(request.bounds.maxR - request.bounds.minR + 1).toBeLessThan(100)
    expect(request.focusCellId).toBe('4,3')
    expect(request.hookedPersonId).toBe('person-0001')
  })

  it('uses shared axial edges for adjacent aggregate regions', () => {
    const left = aggregateRegionPolygon(0, 0, 3, 3, 18)
    const right = aggregateRegionPolygon(4, 0, 7, 3, 18)
    expect(left[1]).toEqual(right[0])
    expect(left[2]).toEqual(right[3])
  })
})
