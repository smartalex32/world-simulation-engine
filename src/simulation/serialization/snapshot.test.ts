import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import { ENGINE_VERSION, KNOWLEDGE_MODEL_VERSION, SNAPSHOT_SCHEMA_VERSION } from '../domain/types'
import { defaultWorldCreationRequest } from '../domain/worldCreation'
import { SNAPSHOT_CODEC, createSnapshot, canonicalStringify, stateDigest, validateSnapshot } from './snapshot'
import historicalSnapshot from './fixtures/engine-0.45.0-schema-44.json'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'

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

  it('rejects the authenticated schema-44 historical fixture outside the compatibility window', async () => {
    await expect(validateSnapshot(historicalFixture())).rejects.toThrow('outside the current-plus-prior-two')
  })

  it('rejects malformed organization lifecycle evidence in a re-digested snapshot', async () => {
    const snapshot = await SimulationEngine.create('organization-lifecycle-trace-validation').snapshot()
    const person = snapshot.state.people[0]
    const location = snapshot.state.activityLocations.find((candidate) => candidate.kind === 'commons')
    if (!person || !location) throw new Error('Expected default person and commons location')
    const malformed = structuredClone(snapshot)
    malformed.state.organizations.push({ id: 'organization.school.trace-test', name: 'Trace test school', kind: 'school', locationCellId: location.cellId, activityLocationId: location.id, members: [], serviceCapacity: 1, sharedRuleIds: ['organization.rule.attendance.v1'] })
    const organization = malformed.state.organizations[0]!
    malformed.state.organizationLifecycle.nextTraceSequence = 2
    malformed.state.organizationLifecycle.latestMembershipTraces.push({ sequence: 1, tick: 0, organizationId: organization.id, personId: person.id, change: 'joined', nextRoleId: 'not-a-defined-role', baseProbabilityPermille: 1, factors: { activityPermille: 1000, proximityPermille: 1000, relationshipPermille: 1000, interestPermille: 1000, exposurePermille: 1000 }, finalProbabilityPermille: 1, rngStream: 'organization.lifecycle', randomRollPermille: 0, selected: true })
    malformed.digest = await stateDigest(malformed.state)
    await expect(validateSnapshot(malformed)).rejects.toThrow('Organization membership trace is invalid')

    const corruptFactor = structuredClone(snapshot)
    corruptFactor.state.organizationLifecycle.nextTraceSequence = 2
    corruptFactor.state.organizationLifecycle.latestFormationTraces.push({ sequence: 1, tick: 0, kindId: 'unknown-kind', candidatePersonIds: [person.id], locationCellId: location.cellId, baseProbabilityPermille: 1, factors: { activityPermille: 1000, proximityPermille: 1001, relationshipPermille: 1000, interestPermille: 1000, exposurePermille: 1000 }, finalProbabilityPermille: 1, rngStream: 'organization.lifecycle', randomRollPermille: 0, formed: false, rejectionReason: 'probability' })
    corruptFactor.digest = await stateDigest(corruptFactor.state)
    await expect(validateSnapshot(corruptFactor)).rejects.toThrow('Organization formation traces are invalid')

    const impossibleOutcome = structuredClone(snapshot)
    impossibleOutcome.state.organizations.push({ id: 'organization.school.trace-test', name: 'Trace test school', kind: 'school', locationCellId: location.cellId, activityLocationId: location.id, members: [], serviceCapacity: 1, sharedRuleIds: ['organization.rule.attendance.v1'] })
    impossibleOutcome.state.organizationLifecycle.nextTraceSequence = 2
    impossibleOutcome.state.organizationLifecycle.latestMembershipTraces.push({ sequence: 1, tick: 0, organizationId: 'organization.school.trace-test', personId: person.id, change: 'joined', nextRoleId: 'learner', baseProbabilityPermille: 1, factors: { activityPermille: 1000, proximityPermille: 1000, relationshipPermille: 1000, interestPermille: 1000, exposurePermille: 1000 }, finalProbabilityPermille: 1, rngStream: 'wrong-stream', randomRollPermille: 999, selected: true, rejectionReason: 'probability' } as never)
    impossibleOutcome.digest = await stateDigest(impossibleOutcome.state)
    await expect(validateSnapshot(impossibleOutcome)).rejects.toThrow('Organization membership trace is invalid')

    const impossibleTransition = structuredClone(snapshot)
    impossibleTransition.state.organizations.push({ id: 'organization.study-circle.trace-test', name: 'Trace test circle', kind: 'study-circle', locationCellId: location.cellId, activityLocationId: location.id, members: [], serviceCapacity: 8, sharedRuleIds: [] })
    impossibleTransition.state.organizations.sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0)
    impossibleTransition.state.organizationLifecycle.nextTraceSequence = 2
    impossibleTransition.state.organizationLifecycle.latestMembershipTraces.push({ sequence: 1, tick: 0, organizationId: 'organization.study-circle.trace-test', personId: person.id, change: 'joined', nextRoleId: 'member', baseProbabilityPermille: 1, factors: { activityPermille: 1000, proximityPermille: 1000, relationshipPermille: 0, interestPermille: 500, exposurePermille: 0 }, finalProbabilityPermille: 1, rngStream: 'organization.lifecycle', randomRollPermille: 0, selected: true })
    impossibleTransition.digest = await stateDigest(impossibleTransition.state)
    await expect(validateSnapshot(impossibleTransition)).rejects.toThrow('Selected organization join was impossible')
  })

  it('upgrades an authenticated schema-45 default-pack snapshot and continues deterministically', async () => {
    const source = await SimulationEngine.create('schema-45-default-pack').snapshot()
    const legacy = structuredClone(source)
    legacy.schemaVersion = 45
    legacy.engineVersion = '0.46.0'
    legacy.state.config.contentPackModelVersion = 2
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

  it('upgrades an authenticated schema-46 default-pack snapshot with its legacy pack reference', async () => {
    const source = await SimulationEngine.create('schema-46-default-pack').snapshot()
    const legacy = structuredClone(source)
    legacy.schemaVersion = 46
    legacy.engineVersion = '0.47.0'
    legacy.state.config.organizationModelVersion = 3
    legacy.state.config.contentPackVersion = '1.1.0'
    legacy.state.config.contentPackChecksum = '0'.repeat(32)
    legacy.state.config.contentPackDependencies = []
    legacy.digest = await stateDigest(legacy.state)

    const migrated = await validateSnapshot(legacy)
    expect(migrated.state.config).toMatchObject({ organizationModelVersion: 4, contentPackVersion: '1.2.0' })
    expect(migrated.state.config.contentPackChecksum).not.toBe('0'.repeat(32))
    const restored = await SimulationEngine.restore(migrated)
    const control = await SimulationEngine.restore(migrated)
    restored.advance(24, { clockEventHours: false }); control.advance(24, { clockEventHours: false })
    expect(await restored.snapshot()).toEqual(await control.snapshot())
  })

  it('preserves legacy custom-pack opt-out semantics when schema-46 ignored future account fields', async () => {
    const pack = structuredClone(DEFAULT_PREINDUSTRIAL_PACK)
    pack.manifest = { ...pack.manifest, id: 'setting.schema-46-legacy-fields', version: '1.0.0', name: 'Schema-46 legacy fields' }
    pack.organizationDefinitions = pack.organizationDefinitions.map((definition) => definition.id === 'school' ? { ...definition, assets: { initialCurrencyUnits: 9, initialGoods: { 'good.food': 3 } }, reputation: { enabled: true } } : definition)
    const source = await SimulationEngine.create('schema-46-custom-pack', 32, 24, pack).snapshot()
    const legacy = structuredClone(source)
    legacy.schemaVersion = 46; legacy.engineVersion = '0.47.0'; legacy.state.config.organizationModelVersion = 3
    delete legacy.state.config.organizationAssetReputationModelVersion
    for (const organization of legacy.state.organizations) { delete organization.assets; delete organization.reputationLedger }
    legacy.digest = await stateDigest(legacy.state)

    const migrated = await validateSnapshot(legacy, pack)
    expect(migrated.state.config.organizationAssetReputationModelVersion).toBe(0)
    expect(migrated.state.organizations.every((organization) => organization.assets === undefined && organization.reputationLedger === undefined)).toBe(true)
    await expect(SimulationEngine.restore(migrated, pack)).resolves.toBeInstanceOf(SimulationEngine)
  })

  it('rejects schema-44 creation input outside the compatibility window', async () => {
    const creation = defaultWorldCreationRequest('schema-44-settlement-repair')
    creation.settlements = [{ id: 'settlement-one', name: 'One', anchorCellId: '8,8' }]
    const current = await SimulationEngine.create(creation).snapshot()
    const legacy = structuredClone(current)
    legacy.schemaVersion = 44
    legacy.engineVersion = '0.45.0'
    legacy.state.config.contentPackModelVersion = 2
    legacy.state.config.organizationModelVersion = 2
    legacy.state.config.worldCreation.settlements = structuredClone(legacy.state.world.settlements)
    legacy.digest = await stateDigest(legacy.state)

    await expect(validateSnapshot(legacy)).rejects.toThrow('outside the current-plus-prior-two')
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
