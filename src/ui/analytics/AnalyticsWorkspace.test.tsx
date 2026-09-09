import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorkbenchProjectionBuilder } from '../../projection'
import { SimulationEngine } from '../../simulation/engine/engine'
import { AnalyticsWorkspace } from './AnalyticsWorkspace'

describe('analytics workspace', () => {
  it('renders labeled filters, bounded evidence modules, and unavailable cards', () => {
    const source = SimulationEngine.create('analytics-component').project()
    const projection = new WorkbenchProjectionBuilder(source).build(source, { revision: 1, bounds: { minQ: 0, maxQ: 31, minR: 0, maxR: 23 }, projectedHexRadius: 1, overlay: 'population' })
    const markup = renderToStaticMarkup(<AnalyticsWorkspace
      projection={projection}
      statistics={[]}
      events={[]}
      category="overview"
      fidelity="all"
      onCategory={() => undefined}
      onFidelity={() => undefined}
      onTimeRange={() => undefined}
      onSelectScope={() => undefined}
      onCompareScope={() => undefined}
      onOpenMetric={() => undefined}
      onOpenMap={() => undefined}
      onOpenEvent={() => undefined}
    />)
    expect(markup).toContain('Metric category')
    expect(markup).toContain('Population fidelity')
    expect(markup).toContain('Population by settlement catchment')
    expect(markup).toContain('Two-scope comparison')
    expect(markup).toContain('Organized warfare')
    expect(markup).toContain('data-state="unavailable"')
    expect(markup).toContain('Detailed people by age band')
    expect(markup).toContain('Authoritative cohorts by age band')
  })
})
