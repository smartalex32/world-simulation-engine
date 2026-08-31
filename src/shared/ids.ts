import { schema, type Codec } from './schema'

declare const idKind: unique symbol
export type OpaqueId<Kind extends string> = string & { readonly [idKind]: Kind }

/** Adds compile-time domain identity after the stable wire representation is validated. */
export function opaqueId<Kind extends string>(kind: Kind): Codec<OpaqueId<Kind>> {
  const wire = schema.string({ minLength: 1, pattern: '^[a-zA-Z0-9_-]+$' })
  return schema.custom<OpaqueId<Kind>>({ ...wire.schema, title: kind }, (value, path) => wire.decode(value, path) as OpaqueId<Kind>)
}
