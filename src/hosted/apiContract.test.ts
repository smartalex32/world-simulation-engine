import { describe, expect, it } from 'vitest'
import { API_REQUEST_CODECS, PUBLIC_API_ROUTES, openApiDocument, operationSchemas } from './apiContract'
import { HOSTED_RUN_COMMAND_CODECS, decodeHostedRunCommand } from '../runtime/hostedCommandContract'

const commandExamples = {
  STEP: { type: 'STEP', requestId: 'request-1', count: 2 },
  PAUSE: { type: 'PAUSE', requestId: 'request-1' },
  SET_SPEED: { type: 'SET_SPEED', requestId: 'request-1', ticksPerBatch: 2 },
  SET_VIEWPORT: {
    type: 'SET_VIEWPORT', requestId: 'request-1',
    viewport: { revision: 0, bounds: { minQ: -1, maxQ: 1, minR: -1, maxR: 1 }, projectedHexRadius: 4, overlay: 'terrain' },
  },
  REQUEST_SNAPSHOT: { type: 'REQUEST_SNAPSHOT', requestId: 'request-1' },
  RESET: { type: 'RESET', requestId: 'request-1' },
  MATERIALIZE_COHORT: { type: 'MATERIALIZE_COHORT', requestId: 'request-1', cohortId: 'cohort-1', populationCount: 4 },
  DEMATERIALIZE_PEOPLE: { type: 'DEMATERIALIZE_PEOPLE', requestId: 'request-1', personIds: ['person-1'] },
  SET_PROTECTED_PEOPLE: { type: 'SET_PROTECTED_PEOPLE', requestId: 'request-1', personIds: ['person-1'] },
} as const

describe('public API contract', () => {
  it('documents every declared route and its request and response schemas', () => {
    const document = openApiDocument() as { paths: Record<string, Record<string, { operationId: string; requestBody?: unknown; responses: unknown }>> }
    const operations = Object.values(document.paths).flatMap(Object.values)

    expect(operations).toHaveLength(PUBLIC_API_ROUTES.length)
    for (const route of PUBLIC_API_ROUTES) {
      const operation = document.paths[route.path]?.[route.method]
      expect(operation?.operationId).toBe(route.operationId)
      expect(operation?.responses).toBeDefined()
      expect(operation?.requestBody !== undefined).toBe('request' in route)
    }
    expect(operationSchemas(document)).not.toContain(undefined)
  })

  it('publishes and decodes every hosted command variant from the same codecs', () => {
    expect(Object.keys(HOSTED_RUN_COMMAND_CODECS).sort()).toEqual(Object.keys(commandExamples).sort())
    for (const [type, example] of Object.entries(commandExamples)) {
      expect(decodeHostedRunCommand(example)).toEqual(example)
      expect(HOSTED_RUN_COMMAND_CODECS[type as keyof typeof HOSTED_RUN_COMMAND_CODECS].schema).toBeDefined()
    }
    expect(() => decodeHostedRunCommand({ type: 'UNKNOWN', requestId: 'request-1' })).toThrow()
    expect(() => decodeHostedRunCommand({ ...commandExamples.PAUSE, ignored: true })).toThrow()
  })

  it('keeps all request validators schema-backed and strict', () => {
    for (const contract of Object.values(API_REQUEST_CODECS)) expect(contract.schema).toBeDefined()
    expect(() => API_REQUEST_CODECS.createSession.decode({ email: 'person@example.test', password: 'secret', ignored: true })).toThrow('declared property')
  })
})
