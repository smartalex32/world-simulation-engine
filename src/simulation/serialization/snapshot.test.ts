import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import { createSnapshot, canonicalStringify, validateSnapshot } from './snapshot'

describe('canonical serialization', () => {
  it('sorts object keys recursively without reordering arrays', () => {
    expect(canonicalStringify({ z: 1, a: { d: 4, b: 2 }, list: [{ y: 2, x: 1 }] })).toBe(
      '{"a":{"b":2,"d":4},"list":[{"x":1,"y":2}],"z":1}',
    )
  })

  it('round-trips schema 6 households, activity locations, links, and named streams', async () => {
    const snapshot = await SimulationEngine.create('schema-6-round-trip').snapshot()
    const validated = await validateSnapshot(structuredClone(snapshot))

    expect(validated).toEqual(snapshot)
    expect(validated.schemaVersion).toBe(6)
    expect(validated.engineVersion).toBe('0.6.0')
    expect(validated.state.households).toHaveLength(100)
    expect(validated.state.parentChildLinks).toHaveLength(100)
    expect(validated.state.randomStreams.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'population.households.childAge',
      'population.ageRemainderHours',
      'population.inheritance.person.trait.curiosity',
    ]))
  })

  it('rejects unsupported household and activity registry versions', async () => {
    const base = await SimulationEngine.create('schema-6-registry-rejection').snapshot()
    const householdMismatch = structuredClone(base.state)
    householdMismatch.config.householdModelVersion += 1
    await expect(validateSnapshot(await createSnapshot(householdMismatch))).rejects.toThrow('Unsupported household model version')

    const activityMismatch = structuredClone(base.state)
    activityMismatch.config.activityRegistryVersion += 1
    await expect(validateSnapshot(await createSnapshot(activityMismatch))).rejects.toThrow('Unsupported activity registry version')
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
})
