import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../domain/worldCreation'
import { canonicalDigest } from '../serialization/digest'
import { SimulationEngine, TICK_PHASE_MANIFEST } from './engine'

function createBoundaryEngine(seed: string) {
  return SimulationEngine.create({
    ...defaultWorldCreationRequest(seed, 8, 8),
    initialPopulationCount: 1,
  })
}

describe('projection-free engine advance', () => {
  it('declares the immutable canonical phase order, cadence, and RNG ownership', () => {
    expect(TICK_PHASE_MANIFEST.map((phase) => [phase.id, phase.cadence])).toEqual([
      ['clock-and-lifecycle', 'hourly'],
      ['needs', 'hourly'],
      ['journeys', 'hourly'],
      ['activities-and-school', 'hourly'],
      ['decisions-and-actions', 'hourly'],
      ['organization-lifecycle', 'daily'],
      ['encounters-and-markets', 'hourly'],
      ['exposure-environment-and-health', 'hourly'],
      ['monthly-processing', 'monthly'],
      ['annual-processing', 'annual'],
      ['daily-processing-and-statistics', 'daily'],
    ])
    expect(TICK_PHASE_MANIFEST.find((phase) => phase.id === 'decisions-and-actions')?.rngStreams).toContain('actions')
    expect(TICK_PHASE_MANIFEST.find((phase) => phase.id === 'encounters-and-markets')?.rngStreams).toContain('encounters')
    expect(TICK_PHASE_MANIFEST.map((phase) => phase.rngStreams)).toEqual([
      ['life-cycle.mortality'], [], [], ['organization.school.attendance'],
      ['actions', 'innovation.practical-experiment', 'content-pack.<pack>.<stream>'], ['organization.lifecycle', 'organization.decisions'],
      ['encounters'], ['health.fictional-pathogen'], ['household.relocation'],
      ['life-cycle.partnership', 'life-cycle.birth', 'life-cycle.inheritance'], [],
    ])
    expect(Object.isFrozen(TICK_PHASE_MANIFEST)).toBe(true)
    expect(TICK_PHASE_MANIFEST.every((phase) => Object.isFrozen(phase) && Object.isFrozen(phase.rngStreams))).toBe(true)
  })

  it('records execution from the same static tuple at hourly and daily cadence', () => {
    const hourly = SimulationEngine.create('phase-trace-hourly').advance(1, { clockEventHours: false })
    const hourlyPhases = TICK_PHASE_MANIFEST.filter((phase) => phase.cadence === 'hourly')
    expect(hourly.diagnostics.phaseCounts).toEqual(Object.fromEntries(hourlyPhases.map((phase) => [phase.id, 1])))
    const daily = SimulationEngine.create('phase-trace-daily').advance(24, { clockEventHours: false })
    expect(daily.diagnostics.phaseCounts).toMatchObject(Object.fromEntries(hourlyPhases.map((phase) => [phase.id, 24])))
    expect(daily.diagnostics.phaseCounts['organization-lifecycle']).toBe(1)
    expect(daily.diagnostics.phaseCounts['daily-processing-and-statistics']).toBe(1)
  })

  it.each([
    {
      boundary: 1,
      digest: '61bdbad128182b4c88de65502b74538eec0aa11d42c9a6df21d14eea60680cd8',
      randomStreams: '29ecdd00e858eb8b6361ff9e6b5143ddbaf84099931a4758889f8bb6e0aabb97',
      events: '367d7ed0a630c026450f0445c4dfa403a5d5229bede3aa60fed478664c06f0b9',
      statistics: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    },
    {
      boundary: 24,
      digest: 'bca05fb200be0828c51a932d18c1a50898c53a45c2ada97ec2b47a2242c290dd',
      randomStreams: '257981ba63a7fce051914fba6fe6d3bdaa39cea9cb6f199b85fc63558345e39e',
      events: 'b3eb4651adec5951caad3e9dfe1396d2447cb84e29642f76213d0d077a5040c4',
      statistics: 'edd18712be2c3dc2577687f858cb2b5020db73f7a1edbaa11b8fcb7f99292016',
    },
    {
      boundary: 720,
      digest: 'd327a9efad6bbc477e2f6181c75231684de2ae167a2baf05226ae9c442ee10aa',
      randomStreams: 'd19bf8d30008e3d6fa225ec73d9fe37065f1a21bf6af0abf37841eb7700e3aae',
      events: '989c4d2502b6fc9677cf100b57ce157cdca587763bd317def131f7fd52ce5208',
      statistics: '962f2ab39e328128004c7f1740a294efbe9f10f4d1dedadf0e3b17ec1b2562d7',
    },
    {
      boundary: 8760,
      digest: 'd528420014504de6299ae04db6f7918972d576cf5bfcd6381b7b492d26202aa6',
      randomStreams: '09c2c5bed0559fab768a6c03ed7782fd41f6776fed6e3b900a399911bca730bc',
      events: 'b54854f144a53a66f61815129511976e555da3af186380adf356661d11979676',
      statistics: '3093c47dcb6e1bbe637a9ab6367cd1732857425423c2285fe1b5e48038d8e35d',
    },
  ])('matches the versioned canonical contract at the $boundary-hour boundary', async ({ boundary, digest, randomStreams, events, statistics }) => {
    // Fixed digests record the versioned lifecycle contract.
    const engine = createBoundaryEngine(`phase-compat-${boundary}`)
    const result = engine.advance(boundary, { clockEventHours: false })
    const snapshot = await engine.snapshot()
    expect(snapshot.digest).toBe(digest)
    expect(await canonicalDigest(snapshot.state.randomStreams)).toBe(randomStreams)
    expect(await canonicalDigest(result.events)).toBe(events)
    expect(await canonicalDigest(result.statistics)).toBe(statistics)
  }, 60_000)

  it('matches the versioned full-population interaction contract', async () => {
    const engine = SimulationEngine.create('phase-compat-full')
    const result = engine.advance(48, { clockEventHours: false })
    const snapshot = await engine.snapshot()
    expect(snapshot.digest).toBe('f49e627e5cdb087ce4f085ab28d50cfa386f3f2427c410d3d18a68173f818949')
    expect(await canonicalDigest(snapshot.state.randomStreams)).toBe('34771d9e3fbb2bca8a5a646dc073e9a6623aade43bfe34bb17d06be9f14ec597')
    expect(await canonicalDigest(result.events)).toBe('6d079c128d3f03107aa5007e5201e0c4c70836143ca114561fb64046d1e261d3')
    expect(await canonicalDigest(result.statistics)).toBe('a58dda13775abebd3a99e0d76e92cb1f5a894c668c02c55415aa4bc18312f636')
  })

  it('matches step state, telemetry, and digest at the same tick', async () => {
    const stepped = SimulationEngine.create('advance-equivalence')
    const advanced = SimulationEngine.create('advance-equivalence')
    const stepResult = stepped.step(48)
    const advanceResult = advanced.advance(48)
    expect(advanceResult.changeSet.categories).toEqual(expect.arrayContaining(['people', 'locations', 'relationships', 'communities']))
    expect(advanceResult.events).toEqual(stepResult.events)
    expect(advanceResult.statistics).toEqual(stepResult.statistics)
    expect(await advanced.snapshot()).toEqual(await stepped.snapshot())
  })

  it('preserves state-at-tick when one logical batch is split into worker-sized quanta', async () => {
    const whole = SimulationEngine.create('advance-quantum')
    const split = SimulationEngine.create('advance-quantum')
    whole.advance(72)
    for (let remaining = 72; remaining > 0; remaining -= 24) split.advance(Math.min(24, remaining), { clockEventHours: remaining <= 24 ? 72 : false })
    const wholeSnapshot = await whole.snapshot()
    const splitSnapshot = await split.snapshot()
    expect(splitSnapshot.digest).toBe(wholeSnapshot.digest)
    expect(splitSnapshot.state).toEqual(wholeSnapshot.state)
  })

  it('does not change digest or event sequence when a partial-batch snapshot is observed', async () => {
    const engine = SimulationEngine.create('advance-observation')
    engine.advance(24, { clockEventHours: false })
    const first = await engine.snapshot()
    const second = await engine.snapshot()
    expect(second.digest).toBe(first.digest)
    expect(second.state.nextEventSequence).toBe(first.state.nextEventSequence)
    expect(second.state).toEqual(first.state)
  })

  it('validates deferred clock options before mutating authoritative state', async () => {
    const engine = SimulationEngine.create('advance-invalid-clock')
    const before = await engine.snapshot()
    expect(() => engine.advance(1, { clockEventHours: 0 })).toThrow(/Clock event hours/)
    expect((await engine.snapshot()).digest).toBe(before.digest)
  })

  it('preserves bounded telemetry, complete statistics, and diagnostics when a batch is split', async () => {
    const whole = SimulationEngine.create('advance-telemetry-equivalence')
    const split = SimulationEngine.create('advance-telemetry-equivalence')
    const wholeResult = whole.advance(72, { clockEventHours: false })
    const splitResults = [split.advance(24, { clockEventHours: false }), split.advance(24, { clockEventHours: false }), split.advance(24, { clockEventHours: false })]
    const splitEvents = splitResults.flatMap((result) => result.events)
    expect(splitEvents.slice(-wholeResult.events.length)).toEqual(wholeResult.events)
    expect(splitResults.flatMap((result) => result.statistics)).toEqual(wholeResult.statistics)
    expect(Object.fromEntries(Object.entries(wholeResult.diagnostics.phaseCounts))).toEqual(Object.fromEntries(Object.entries(splitResults.reduce<Record<string, number>>((total, result) => { for (const [id, count] of Object.entries(result.diagnostics.phaseCounts)) total[id] = (total[id] ?? 0) + count; return total }, {}))))
    expect(splitResults.reduce((total, result) => total + result.diagnostics.livingPersonIndexBuilds, 0)).toBe(wholeResult.diagnostics.livingPersonIndexBuilds)
    expect(await split.snapshot()).toEqual(await whole.snapshot())
  })

  it.each([24, 720, 8760])('restores identically at the %i-hour cadence boundary', async (boundary) => {
    const uninterrupted = createBoundaryEngine(`phase-boundary-${boundary}`)
    const interrupted = createBoundaryEngine(`phase-boundary-${boundary}`)
    uninterrupted.advance(boundary + 24, { clockEventHours: false })
    interrupted.advance(boundary, { clockEventHours: false })
    const restored = await SimulationEngine.restore(await interrupted.snapshot())
    restored.advance(24, { clockEventHours: false })
    expect(await restored.snapshot()).toEqual(await uninterrupted.snapshot())
  }, 60_000)
})
