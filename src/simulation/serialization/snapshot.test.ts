import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import { ENGINE_VERSION, KNOWLEDGE_MODEL_VERSION, SNAPSHOT_SCHEMA_VERSION } from '../domain/types'
import { defaultWorldCreationRequest } from '../domain/worldCreation'
import { SNAPSHOT_CODEC, createSnapshot, canonicalStringify, stateDigest, validateSnapshot } from './snapshot'
import historicalSnapshot from './fixtures/engine-0.45.0-schema-44.json'

function historicalFixture(): unknown {
  return structuredClone(historicalSnapshot)
}

describe('canonical serialization', () => {
  it('sorts object keys recursively without reordering arrays', () => {
    expect(canonicalStringify({ z: 1, a: { d: 4, b: 2 }, list: [{ y: 2, x: 1 }] })).toBe(
      '{"a":{"b":2,"d":4},"list":[{"x":1,"y":2}],"z":1}',
    )
  })

  it('round-trips the current schema including person knowledge', async () => {
    const snapshot = await SimulationEngine.create('schema-6-round-trip').snapshot()
    const validated = await validateSnapshot(structuredClone(snapshot))

    expect(validated).toEqual(snapshot)
    expect(await SNAPSHOT_CODEC.decode(structuredClone(snapshot))).toEqual(snapshot)
    expect(SNAPSHOT_CODEC.schema).toMatchObject({ $id: 'world-simulation/snapshot-envelope' })
    expect(validated.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION)
    expect(validated.engineVersion).toBe(ENGINE_VERSION)
    expect(validated.state.people[0]?.knowledge).toEqual(expect.objectContaining({ 'knowledge.foraging': expect.any(Number), 'knowledge.localTerrain': expect.any(Number) }))
    expect(validated.state.households).toHaveLength(100)
    expect(validated.state.parentChildLinks).toHaveLength(100)
    expect(validated.state.communities).toHaveLength(2)
    expect(validated.state.dailyCommunityCounters).toHaveLength(2)
    expect(validated.state.randomStreams.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'population.households.childAge',
      'population.ageRemainderHours',
      'population.inheritance.person.trait.curiosity',
    ]))
  })

  it('restores the authenticated historical fixture with the migrated envelope evidence intact', async () => {
    const restored = await validateSnapshot(historicalFixture())

    expect(restored).toMatchObject({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      migrationProvenance: expect.objectContaining({ sourceSchemaVersion: 44, sourceEngineVersion: '0.45.0', targetSchemaVersion: SNAPSHOT_SCHEMA_VERSION }),
    })
    expect(restored.digest).toBe(await stateDigest(restored.state))
  })

  it('retains authenticated migration provenance across restore, advancement, and a later restore', async () => {
    const migrated = await validateSnapshot(historicalFixture())
    const engine = await SimulationEngine.restore(migrated)
    engine.advance(1)
    const advanced = await engine.snapshot()

    expect(advanced).toMatchObject({ migrationProvenance: migrated.migrationProvenance })
    expect(advanced.digest).not.toBe(migrated.digest)
    await expect(SimulationEngine.restore(advanced)).resolves.toBeInstanceOf(SimulationEngine)
  })

  it('upgrades an authenticated schema-45 default-pack snapshot and continues deterministically', async () => {
    const source = await SimulationEngine.create('schema-45-default-pack').snapshot()
    const legacy = structuredClone(source)
    legacy.schemaVersion = 45
    legacy.engineVersion = '0.46.0'
    legacy.state.config.organizationModelVersion = 2
    legacy.state.config.contentPackVersion = '1.1.0'
    legacy.state.config.contentPackChecksum = '0'.repeat(32)
    legacy.state.config.contentPackDependencies = []
    const legacyState = legacy.state as { organizationLifecycle?: unknown }
    legacyState.organizationLifecycle = undefined
    legacy.digest = await stateDigest(legacy.state)

    const migrated = await validateSnapshot(legacy)
    expect(migrated.state.config.contentPackVersion).toBe('1.2.0')
    expect(migrated.state.config.contentPackChecksum).not.toBe('0'.repeat(32))
    const restored = await SimulationEngine.restore(migrated)
    const control = await SimulationEngine.restore(migrated)
    restored.advance(24, { clockEventHours: false })
    control.advance(24, { clockEventHours: false })
    expect(await restored.snapshot()).toEqual(await control.snapshot())
  })

  it('repairs schema-44 creation input contaminated by runtime settlement state', async () => {
    const creation = defaultWorldCreationRequest('schema-44-settlement-repair')
    creation.settlements = [{ id: 'settlement-one', name: 'One', anchorCellId: '8,8' }]
    const current = await SimulationEngine.create(creation).snapshot()
    const legacy = structuredClone(current)
    legacy.schemaVersion = 44
    legacy.engineVersion = '0.45.0'
    legacy.state.config.organizationModelVersion = 2
    legacy.state.config.worldCreation.settlements = structuredClone(legacy.state.world.settlements)
    legacy.digest = await stateDigest(legacy.state)

    const restored = await validateSnapshot(legacy)
    expect(restored.state.config.worldCreation.settlements).toEqual(creation.settlements)
    expect(restored.state.world.settlements[0]).toHaveProperty('regional')
    expect(restored.digest).toBe(await stateDigest(restored.state))
  })

  it('rejects unsupported household, activity, development, community, and life-cycle registry versions', async () => {
    const base = await SimulationEngine.create('schema-6-registry-rejection').snapshot()
    const householdMismatch = structuredClone(base.state)
    householdMismatch.config.householdModelVersion += 1
    await expect(validateSnapshot(await createSnapshot(householdMismatch))).rejects.toThrow('Unsupported household model version')

    const activityMismatch = structuredClone(base.state)
    activityMismatch.config.activityRegistryVersion += 1
    await expect(validateSnapshot(await createSnapshot(activityMismatch))).rejects.toThrow('Unsupported activity registry version')

    const developmentMismatch = structuredClone(base.state)
    developmentMismatch.config.developmentRegistryVersion += 1
    await expect(validateSnapshot(await createSnapshot(developmentMismatch))).rejects.toThrow('Unsupported development registry version')

    const communityMismatch = structuredClone(base.state)
    communityMismatch.config.communityRegistryVersion += 1
    await expect(validateSnapshot(await createSnapshot(communityMismatch))).rejects.toThrow('Unsupported community registry version')

    const lifeCycleMismatch = structuredClone(base.state)
    lifeCycleMismatch.config.lifeCycleModelVersion += 1
    await expect(validateSnapshot(await createSnapshot(lifeCycleMismatch))).rejects.toThrow('Unsupported life-cycle model version')

    const knowledgeMismatch = structuredClone(base.state)
    knowledgeMismatch.config.knowledgeModelVersion = KNOWLEDGE_MODEL_VERSION + 1
    await expect(validateSnapshot(await createSnapshot(knowledgeMismatch))).rejects.toThrow('Unsupported knowledge model version')
  })

  it('rejects missing or out-of-range person knowledge', async () => {
    const base = await SimulationEngine.create('schema-22-knowledge-rejection').snapshot()
    const missing = structuredClone(base.state)
    if (!missing.people[0]) throw new Error('Missing controlled person fixture')
    delete missing.people[0].knowledge
    await expect(validateSnapshot(await createSnapshot(missing))).rejects.toThrow('invalid knowledge records')

    const outOfRange = structuredClone(base.state)
    if (!outOfRange.people[0]?.knowledge) throw new Error('Missing controlled knowledge fixture')
    outOfRange.people[0].knowledge['knowledge.foraging'] = 1001
    await expect(validateSnapshot(await createSnapshot(outOfRange))).rejects.toThrow('invalid knowledge values')
  })

  it('rejects malformed household membership, links, locations, and inheritance sources', async () => {
    const base = await SimulationEngine.create('schema-6-topology-rejection').snapshot()

    const duplicateMembership = structuredClone(base.state)
    const duplicatePersonId = duplicateMembership.households[0]?.memberIds[0]
    if (!duplicatePersonId || !duplicateMembership.households[1]) throw new Error('Missing controlled household fixture')
    duplicateMembership.households[1].memberIds = [...duplicateMembership.households[1].memberIds, duplicatePersonId].sort()
    await expect(validateSnapshot(await createSnapshot(duplicateMembership))).rejects.toThrow('multiple households')

    const danglingLink = structuredClone(base.state)
    const link = danglingLink.parentChildLinks[0]
    if (!link) throw new Error('Missing controlled parent-child fixture')
    link.parentId = 'person-missing'
    link.id = `person-missing|${link.childId}`
    danglingLink.parentChildLinks.sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0)
    await expect(validateSnapshot(await createSnapshot(danglingLink))).rejects.toThrow('missing person')

    const invalidLocation = structuredClone(base.state)
    const home = invalidLocation.activityLocations.find(({ kind }) => kind === 'home')
    if (!home) throw new Error('Missing controlled home activity fixture')
    home.cellId = 'missing-cell'
    await expect(validateSnapshot(await createSnapshot(invalidLocation))).rejects.toThrow('invalid home activity location')

    const unrelatedTrace = structuredClone(base.state)
    const child = unrelatedTrace.people.find(({ id }) => id === 'person-0101')
    if (!child?.originTraces[0]) throw new Error('Missing controlled inheritance trace')
    child.originTraces[0].parentIds = ['person-0002', 'person-0052']
    await expect(validateSnapshot(await createSnapshot(unrelatedTrace))).rejects.toThrow('do not match parent-child links')
  })

  it('rejects malformed development accumulators and unrelated exposure sources', async () => {
    const base = await SimulationEngine.create('development-state-rejection').snapshot()

    const missingAccumulator = structuredClone(base.state)
    const firstPerson = missingAccumulator.people[0]
    if (!firstPerson) throw new Error('Missing controlled person fixture')
    firstPerson.development.exposures = []
    await expect(validateSnapshot(await createSnapshot(missingAccumulator))).rejects.toThrow('invalid development state')

    const excessiveHours = structuredClone(base.state)
    const child = excessiveHours.people.find(({ id }) => id === 'person-0101')
    const accumulator = child?.development.exposures[0]
    if (!child || !accumulator) throw new Error('Missing controlled child development fixture')
    accumulator.recipientHours = 721
    accumulator.sourceHours = 721
    accumulator.weightedSourceValueHours = 360_500
    accumulator.sourcePersonIds = ['person-0001']
    accumulator.lastExposureTick = 1
    await expect(validateSnapshot(await createSnapshot(excessiveHours))).rejects.toThrow('out-of-range exposure totals')

    const unrelatedSource = structuredClone(base.state)
    const unrelatedChild = unrelatedSource.people.find(({ id }) => id === 'person-0101')
    const unrelatedAccumulator = unrelatedChild?.development.exposures[0]
    if (!unrelatedAccumulator) throw new Error('Missing controlled child exposure fixture')
    unrelatedAccumulator.recipientHours = 1
    unrelatedAccumulator.sourceHours = 1
    unrelatedAccumulator.weightedSourceValueHours = 500
    unrelatedAccumulator.sourcePersonIds = ['person-0002']
    unrelatedAccumulator.lastExposureTick = 1
    await expect(validateSnapshot(await createSnapshot(unrelatedSource))).rejects.toThrow('invalid development sources')
  })
})
