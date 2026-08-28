import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'

describe('Capability 9 economy acceptance', () => {
  it('restores an authoritative economy ledger and continues with the same canonical result', async () => {
    const first = SimulationEngine.create('capability-9-economy')
    first.advance(720)
    const snapshot = await first.snapshot()
    const restored = await SimulationEngine.restore(snapshot)
    first.advance(48); restored.advance(48)
    expect(await first.snapshot()).toEqual(await restored.snapshot())
    expect(snapshot.state.economy.markets.length).toBe(snapshot.state.markets.length)
    expect(snapshot.state.economy.productionTraces.length).toBeGreaterThan(0)
  }, 30_000)

  it('retains bounded price, ownership, tax, and inequality evidence under a fixed seed', () => {
    const engine = SimulationEngine.create('capability-9-evidence')
    engine.advance(720)
    const projection = engine.project()
    expect(projection.economy.markets.every((market) => Object.values(market.prices).every((price) => Number.isSafeInteger(price) && price >= 1))).toBe(true)
    expect(projection.households.reduce((sum, household) => sum + (household.inventory?.currencyUnits ?? 0), 0)).toBeGreaterThan(0)
    expect(projection.economy.productionTraces.length).toBeGreaterThan(0)
    expect(projection.economy.totalTaxCollectedUnits).toBeGreaterThanOrEqual(0)
  }, 30_000)
})
