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
      ['encounters-and-markets', 'hourly'],
      ['exposure-environment-and-health', 'hourly'],
      ['organization-lifecycle', 'daily'],
      ['monthly-processing', 'monthly'],
      ['annual-processing', 'annual'],
      ['daily-processing-and-statistics', 'daily'],
    ])
    expect(TICK_PHASE_MANIFEST.find((phase) => phase.id === 'decisions-and-actions')?.rngStreams).toContain('actions')
    expect(TICK_PHASE_MANIFEST.find((phase) => phase.id === 'encounters-and-markets')?.rngStreams).toContain('encounters')
    expect(TICK_PHASE_MANIFEST.map((phase) => phase.rngStreams)).toEqual([
      ['life-cycle.mortality'], [], [], ['organization.school.attendance'],
      ['actions', 'innovation.practical-experiment', 'content-pack.<pack>.<stream>'], ['encounters'],
      ['health.fictional-pathogen'], ['organization.lifecycle'], ['household.relocation'],
      ['life-cycle.partnership', 'life-cycle.birth', 'life-cycle.inheritance'], [],
    ])
    expect(Object.isFrozen(TICK_PHASE_MANIFEST)).toBe(true)
    expect(TICK_PHASE_MANIFEST.every((phase) => Object.isFrozen(phase) && Object.isFrozen(phase.rngStreams))).toBe(true)
  })

  it('records execution from the same static tuple at hourly and daily cadence', () => {
    const hourly = SimulationEngine.create('phase-trace-hourly').advance(1, { clockEventHours: false })
    expect(hourly.diagnostics.phaseCounts).toEqual(Object.fromEntries(TICK_PHASE_MANIFEST.slice(0, 7).map((phase) => [phase.id, 1])))
    const daily = SimulationEngine.create('phase-trace-daily').advance(24, { clockEventHours: false })
    expect(daily.diagnostics.phaseCounts).toMatchObject(Object.fromEntries(TICK_PHASE_MANIFEST.slice(0, 7).map((phase) => [phase.id, 24])))
    expect(daily.diagnostics.phaseCounts['daily-processing-and-statistics']).toBe(1)
  })

  it.each([
    {
      boundary: 1,
      digest: '6771c2eff6a0f384de8abb0b98203f4d8989f59d488bf8cac55c1dcd72ccab7c',
      randomStreams: '29ecdd00e858eb8b6361ff9e6b5143ddbaf84099931a4758889f8bb6e0aabb97',
      events: '367d7ed0a630c026450f0445c4dfa403a5d5229bede3aa60fed478664c06f0b9',
      statistics: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    },
    {
      boundary: 24,
      digest: '236a4bb6d52d34c3d01e4166a42328fecd4b25160ec79d0f0638c36dfba7f375',
      randomStreams: '257981ba63a7fce051914fba6fe6d3bdaa39cea9cb6f199b85fc63558345e39e',
      events: 'b3eb4651adec5951caad3e9dfe1396d2447cb84e29642f76213d0d077a5040c4',
      statistics: 'edd18712be2c3dc2577687f858cb2b5020db73f7a1edbaa11b8fcb7f99292016',
    },
    {
      boundary: 720,
      digest: '8a774a1994e0c22762c38e9ccfb81dc2453f809e1ce2889a60705b0b3498689d',
      randomStreams: 'd19bf8d30008e3d6fa225ec73d9fe37065f1a21bf6af0abf37841eb7700e3aae',
      events: '989c4d2502b6fc9677cf100b57ce157cdca587763bd317def131f7fd52ce5208',
      statistics: '962f2ab39e328128004c7f1740a294efbe9f10f4d1dedadf0e3b17ec1b2562d7',
    },
    {
      boundary: 8760,
      digest: 'dc09b1467bd1f44318b609540f0cd5674fe845eda8cf54d8c4ff26dcd5faee1d',
      randomStreams: '09c2c5bed0559fab768a6c03ed7782fd41f6776fed6e3b900a399911bca730bc',
      events: 'b54854f144a53a66f61815129511976e555da3af186380adf356661d11979676',
      statistics: '3093c47dcb6e1bbe637a9ab6367cd1732857425423c2285fe1b5e48038d8e35d',
    },
  ])('matches the pre-pipeline canonical contract at the $boundary-hour boundary', async ({ boundary, digest, randomStreams, events, statistics }) => {
    // Fixed digests record the versioned lifecycle contract.
    const engine = createBoundaryEngine(`phase-compat-${boundary}`)
    const result = engine.advance(boundary, { clockEventHours: false })
    const snapshot = await engine.snapshot()
    expect(snapshot.digest).toBe(digest)
    expect(await canonicalDigest(snapshot.state.randomStreams)).toBe(randomStreams)
    expect(await canonicalDigest(result.events)).toBe(events)
    expect(await canonicalDigest(result.statistics)).toBe(statistics)
  }, 60_000)

  it('matches the pre-pipeline full-population interaction contract', async () => {
    const engine = SimulationEngine.create('phase-compat-full')
    const result = engine.advance(48, { clockEventHours: false })
    const snapshot = await engine.snapshot()
    expect(snapshot.digest).toBe('de002ec8847c8ab77cef206798b90eb55b0d1415c8eb52eaaa42a9a2b3fd1aed')
    expect(await canonicalDigest(snapshot.state.randomStreams)).toBe('7ae6d7a2f35b8ff03e3ad8fb19b15eff891207ceea2dd67ad50f9da639abd51c')
    expect(await canonicalDigest(result.events)).toBe('06a9c17bd0cc9918702516c2c5a0c1f1b39ebefb8318910be7838882a84e09a9')
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
