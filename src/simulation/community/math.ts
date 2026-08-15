export function clampPermille(value: number): number {
  return Math.max(0, Math.min(1000, value))
}

/** Integer division with signed ties away from zero. */
export function symmetricRoundDivision(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator)) throw new Error('numerator must be a safe integer')
  if (!Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('denominator must be a positive safe integer')
  return Math.sign(numerator) * Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator)
}

export function assertPermille(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000) throw new Error(`${name} must be an integer permille between 0 and 1000`)
}

export function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`)
}
