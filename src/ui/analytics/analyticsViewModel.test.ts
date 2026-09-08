import { describe, expect, it } from 'vitest'
import { WorkbenchProjectionBuilder, type WorkbenchProjection } from '../../projection'
import type { StatisticSample } from '../../simulation/domain/types'
import { SimulationEngine } from '../../simulation/engine/engine'
import { buildAnalyticsCard, buildAnalyticsDashboard, buildScopeComparison } from './analyticsViewModel'
import { ANALYTICS_METRICS, analyticsMetric } from './metricRegistry'

function projection(): WorkbenchProjection {
  const source = SimulationEngine.create('analytics-fixture').project()
  return new WorkbenchProjectionBuilder(source).build(source, { revision: 1, bounds: { minQ: 0, maxQ: 31, minR: 0, maxR: 23 }, projectedHexRadius: 1, overlay: 'population' })
}

function sample(metricId: StatisticSample['metricId'], tick: number, value: number): StatisticSample {
  return { runId: 'fixture', tick, metricVersion: 1, metricId, value, scope: 'world' } as StatisticSample
}

describe('analytics metric registry and adapters', () => {
  it('keeps stable metadata and honest unavailable reference metrics', () => {
    expect(new Set(ANALYTICS_METRICS.map((metric) => metric.id)).size).toBe(ANALYTICS_METRICS.length)
    expect(analyticsMetric('conflict.warfare')).toMatchObject({ requiredCapability: 'warfare' })
    expect(buildAnalyticsCard(analyticsMetric('conflict.warfare')!, projection(), [], { fromTick: 0, toTick: 24 }).availability).toBe('unavailable')
  })

  it('distinguishes zero, one sample, gaps, and desirable direction', () => {
    const world = projection()
    const definition = analyticsMetric('resources.totalFood')!
    const zero = buildAnalyticsCard(definition, world, [sample('resources.totalFood', 24, 0)], { fromTick: 0, toTick: 24 })
    expect(zero).toMatchObject({ value: 0, availability: 'available', trendMeaning: 'not-comparable' })
    const rising = buildAnalyticsCard(definition, world, [sample('resources.totalFood', 24, 10), sample('resources.totalFood', 48, 15)], { fromTick: 0, toTick: 48 })
    expect(rising).toMatchObject({ delta: 5, trendMeaning: 'desirable' })
    const gapped = buildAnalyticsCard(definition, world, [sample('resources.totalFood', 24, 10), sample('resources.totalFood', 96, 8)], { fromTick: 0, toTick: 96 })
    expect(gapped).toMatchObject({ availability: 'gapped', delta: -2, trendMeaning: 'undesirable' })
  })

  it('builds bounded composition and preserves detailed/cohort fidelity scopes', () => {
    const world = projection()
    const view = buildAnalyticsDashboard({ projection: world, statistics: [], events: [], category: 'overview' })
    expect(view.detailedAgeBands.reduce((sum, entry) => sum + entry.value, 0)).toBe(world.people.length)
    expect(view.cohortAgeBands.reduce((sum, entry) => sum + entry.value, 0)).toBe(world.cohorts.reduce((sum, cohort) => sum + cohort.populationCount, 0))
    expect(view.settlementPopulation).toHaveLength(world.settlements.length)
    expect(view.recentEvents).toEqual([])
  })

  it('compares only compatible scopes and states settlement denominators', () => {
    const world = projection()
    world.settlements.push(
      {
        id: 'west', name: 'West', anchorCellId: '1,1', scale: 'hamlet', nearbyResidentCount: 12, nearbyHomeCellCount: 4, nearbyHouseholdCount: 4,
        householdFoodStoreUnits: 30, recordedRelocationArrivalCount: 0, catchmentCellCount: 7, catchmentSource: 'anchor-radius', currentVisitorCount: 1,
        catchmentResourceCapacity: 80, waterAccessCellCount: 2,
        scaleEvidence: { suggestedScale: 'hamlet', direction: 'stable', densityPerHomeCell: 3, resourceUnitsPerResident: 6, accessPermille: 400 },
      },
      {
        id: 'east', name: 'East', anchorCellId: '2,2', scale: 'village', nearbyResidentCount: 18, nearbyHomeCellCount: 6, nearbyHouseholdCount: 6,
        householdFoodStoreUnits: 44, recordedRelocationArrivalCount: 1, catchmentCellCount: 9, catchmentSource: 'authored', currentVisitorCount: 0,
        catchmentResourceCapacity: 120, waterAccessCellCount: 4,
        scaleEvidence: { suggestedScale: 'village', direction: 'stable', densityPerHomeCell: 3, resourceUnitsPerResident: 7, accessPermille: 500 },
      },
    )
    const [left, right] = world.settlements
    if (!left || !right) throw new Error('Fixture needs two settlements')
    const rows = buildScopeComparison(world, { kind: 'settlement', id: left.id }, { kind: 'settlement', id: right.id })
    expect(rows[0]).toMatchObject({ label: 'Nearby residents (geographic catchment)', comparable: true })
    expect(buildScopeComparison(world, { kind: 'settlement', id: left.id }, { kind: 'region', id: world.communities[0]!.catchment.id })[0]).toMatchObject({ comparable: false })
  })
})
