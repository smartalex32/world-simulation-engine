import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from './worldCreation'
import { exportWorldDraftBundle, importWorldDraftBundle } from './worldDraftBundle'
import { createWorldDraftRecord } from './worldDraft'

describe('world draft bundle contract', () => {
  it('round-trips a detached versioned authored world', () => {
    const record = createWorldDraftRecord('portable-draft', defaultWorldCreationRequest('portable-seed'))
    const bundle = exportWorldDraftBundle(record)
    expect(importWorldDraftBundle(JSON.parse(JSON.stringify(bundle)))).toEqual(record)
  })

  it('rejects incompatible format and generator contracts', () => {
    const bundle = exportWorldDraftBundle(createWorldDraftRecord('portable-draft', defaultWorldCreationRequest('portable-seed')))
    expect(() => importWorldDraftBundle({ ...bundle, bundleVersion: 2 })).toThrow(/bundle version/)
    expect(() => importWorldDraftBundle({ ...bundle, worldGeneratorVersion: 2 })).toThrow(/generator version/)
    expect(() => importWorldDraftBundle({ ...bundle, format: 'other' })).toThrow(/format/)
  })
})
