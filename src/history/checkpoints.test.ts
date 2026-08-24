import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../simulation/engine/engine'
import { createCheckpoint, compareCheckpoints } from './checkpoints'
describe('historical checkpoints', () => { it('compares detached snapshots without mutating either', async () => { const engine = SimulationEngine.create('checkpoints'); const first = createCheckpoint(await engine.snapshot()); engine.step(24); const second = createCheckpoint(await engine.snapshot()); const comparison = compareCheckpoints(first, second); expect(comparison.laterTick).toBe(24); expect(first.snapshot.state.tick).toBe(0); expect(comparison.personChanges).toHaveLength(first.snapshot.state.people.length) }) })
