import { describe, expect, it } from 'vitest'
import { schema, type Infer } from './schema'

describe('schema-first codecs', () => {
  const contract = schema.object({ kind: schema.literal('sample'), id: schema.string({ minLength: 1 }), count: schema.optional(schema.number({ integer: true, minimum: 1 })) })
  type Contract = Infer<typeof contract>

  it('uses one definition for inferred types, strict runtime validation, and JSON Schema', () => {
    const decoded: Contract = contract.decode({ kind: 'sample', id: 'a', count: 2 })
    expect(decoded).toEqual({ kind: 'sample', id: 'a', count: 2 })
    expect(contract.schema).toMatchObject({ type: 'object', required: ['kind', 'id'], additionalProperties: false })
    expect(() => contract.decode({ kind: 'sample', id: '', surprise: true })).toThrow()
  })
})
