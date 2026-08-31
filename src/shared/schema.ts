export type JsonSchema = Readonly<Record<string, unknown>>

export interface Codec<T> {
  readonly schema: JsonSchema
  decode(value: unknown, path?: string): T
}

export interface AsyncCodec<T> {
  readonly schema: JsonSchema
  decode(value: unknown, path?: string): Promise<T>
}

export type Infer<C> = C extends Codec<infer T> ? T : never

interface OptionalCodec<T> extends Codec<T | undefined> { readonly optional: true }
type Shape = Readonly<Record<string, Codec<unknown>>>
type OptionalKey<S extends Shape> = { [K in keyof S]: S[K] extends OptionalCodec<unknown> ? K : never }[keyof S]
type RequiredKey<S extends Shape> = Exclude<keyof S, OptionalKey<S>>
type ObjectValue<S extends Shape> = { [K in RequiredKey<S>]: Infer<S[K]> } & { [K in OptionalKey<S>]?: Exclude<Infer<S[K]>, undefined> }

function codec<T>(schema: JsonSchema, decode: (value: unknown, path: string) => T): Codec<T> {
  return { schema: Object.freeze(schema), decode: (value, path = '$') => decode(value, path) }
}

function fail(path: string, expectation: string): never { throw new Error(`${path} must be ${expectation}`) }

export const schema = {
  unknown: (): Codec<unknown> => codec({}, (value) => structuredClone(value)),
  string: (options: { minLength?: number; pattern?: string; format?: string } = {}): Codec<string> => codec({ type: 'string', ...options }, (value, path) => {
    if (typeof value !== 'string' || options.minLength !== undefined && value.length < options.minLength || options.pattern !== undefined && !new RegExp(options.pattern).test(value)) fail(path, 'a valid string')
    return value
  }),
  number: (options: { integer?: boolean; minimum?: number; maximum?: number } = {}): Codec<number> => codec({ type: options.integer ? 'integer' : 'number', ...(options.minimum === undefined ? {} : { minimum: options.minimum }), ...(options.maximum === undefined ? {} : { maximum: options.maximum }) }, (value, path) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || options.integer && !Number.isSafeInteger(value) || options.minimum !== undefined && value < options.minimum || options.maximum !== undefined && value > options.maximum) fail(path, options.integer ? 'a valid integer' : 'a valid number')
    return value
  }),
  boolean: (): Codec<boolean> => codec({ type: 'boolean' }, (value, path) => typeof value === 'boolean' ? value : fail(path, 'a boolean')),
  literal: <const T extends string | number | boolean | null>(expected: T): Codec<T> => codec({ const: expected }, (value, path) => value === expected ? expected : fail(path, JSON.stringify(expected))),
  enum: <const T extends readonly [string, ...string[]]>(values: T): Codec<T[number]> => codec({ type: 'string', enum: values }, (value, path) => typeof value === 'string' && values.includes(value) ? value as T[number] : fail(path, `one of ${values.join(', ')}`)),
  optional: <T>(inner: Codec<T>): OptionalCodec<T> => ({ optional: true, schema: inner.schema, decode: (value, path = '$') => value === undefined ? undefined : inner.decode(value, path) }),
  array: <T>(item: Codec<T>, options: { minItems?: number; maxItems?: number } = {}): Codec<T[]> => codec({ type: 'array', items: item.schema, ...options }, (value, path) => {
    if (!Array.isArray(value) || options.minItems !== undefined && value.length < options.minItems || options.maxItems !== undefined && value.length > options.maxItems) fail(path, 'a valid array')
    return value.map((entry, index) => item.decode(entry, `${path}[${index}]`))
  }),
  object: <S extends Shape>(shape: S, options: { additionalProperties?: boolean } = {}): Codec<ObjectValue<S>> => {
    const optional = new Set(Object.entries(shape).filter(([, value]) => 'optional' in value).map(([key]) => key))
    const required = Object.keys(shape).filter((key) => !optional.has(key))
    return codec({ type: 'object', properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, value.schema])), required, additionalProperties: options.additionalProperties ?? false }, (value, path) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'an object')
      const input = value as Record<string, unknown>
      if (!options.additionalProperties) for (const key of Object.keys(input)) if (!(key in shape)) fail(`${path}.${key}`, 'a declared property')
      const output: Record<string, unknown> = {}
      for (const [key, field] of Object.entries(shape)) {
        const decoded = field.decode(input[key], `${path}.${key}`)
        if (decoded !== undefined) output[key] = decoded
      }
      return output as ObjectValue<S>
    })
  },
  union: <C extends readonly Codec<unknown>[]>(variants: C): Codec<Infer<C[number]>> => codec({ oneOf: variants.map((variant) => variant.schema) }, (value, path) => {
    const failures: string[] = []
    for (const variant of variants) try { return variant.decode(value, path) as Infer<C[number]> } catch (error) { failures.push(error instanceof Error ? error.message : String(error)) }
    throw new Error(`${path} does not match any contract variant: ${failures.join('; ')}`)
  }),
  record: <T>(valueCodec: Codec<T>): Codec<Record<string, T>> => codec({ type: 'object', additionalProperties: valueCodec.schema }, (value, path) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'an object record')
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, valueCodec.decode(entry, `${path}.${key}`)]))
  }),
  custom: <T>(jsonSchema: JsonSchema, decode: (value: unknown, path: string) => T): Codec<T> => codec(jsonSchema, decode),
  asyncCustom: <T>(jsonSchema: JsonSchema, decode: (value: unknown, path: string) => Promise<T>): AsyncCodec<T> => ({
    schema: Object.freeze(jsonSchema), decode: (value, path = '$') => decode(value, path),
  }),
}
