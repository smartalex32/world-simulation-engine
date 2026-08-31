export type CanonicalValidationSubsystem = 'world' | 'population' | 'markets' | 'organizations' | 'governance' | 'disputes' | 'relationships' | 'counters' | 'randomStreams' | 'households' | 'infrastructure' | 'economy' | 'communities'

/** A stable, machine-readable error emitted at canonical state boundaries. */
export class CanonicalSimulationValidationError extends Error {
  constructor(readonly detail: { subsystem: CanonicalValidationSubsystem; path: string; code: string; message: string }) {
    super(detail.message)
    this.name = 'CanonicalSimulationValidationError'
  }
}

export function failCanonicalValidation(subsystem: CanonicalValidationSubsystem, path: string, code: string, message: string): never {
  throw new CanonicalSimulationValidationError({ subsystem, path, code, message })
}
