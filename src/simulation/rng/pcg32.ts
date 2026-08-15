import type { RandomStreamSnapshot } from '../domain/types'

const MASK_64 = (1n << 64n) - 1n
const MULTIPLIER = 6364136223846793005n
const DEFAULT_SEQUENCE = 1442695040888963407n

export function hashSeed(value: string): bigint {
  let hash = 14695981039346656037n
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte)
    hash = (hash * 1099511628211n) & MASK_64
  }
  return hash
}

export class Pcg32 {
  private state = 0n
  private readonly increment: bigint

  constructor(seed: bigint, sequence = DEFAULT_SEQUENCE) {
    this.increment = ((sequence << 1n) | 1n) & MASK_64
    this.nextUint32()
    this.state = (this.state + seed) & MASK_64
    this.nextUint32()
  }

  static restore(snapshot: RandomStreamSnapshot): Pcg32 {
    const instance = Object.create(Pcg32.prototype) as Pcg32
    instance.state = BigInt(`0x${snapshot.stateHex}`)
    Object.defineProperty(instance, 'increment', { value: BigInt(`0x${snapshot.incrementHex}`), writable: false })
    return instance
  }

  nextUint32(): number {
    const oldState = this.state
    this.state = (oldState * MULTIPLIER + this.increment) & MASK_64
    const xorshifted = Number((((oldState >> 18n) ^ oldState) >> 27n) & 0xffff_ffffn) >>> 0
    const rotation = Number(oldState >> 59n)
    return ((xorshifted >>> rotation) | (xorshifted << ((-rotation) & 31))) >>> 0
  }

  nextInt(exclusiveMax: number): number {
    if (!Number.isSafeInteger(exclusiveMax) || exclusiveMax <= 0 || exclusiveMax > 0x1_0000_0000) {
      throw new RangeError('exclusiveMax must be an integer between 1 and 2^32')
    }
    const threshold = (0x1_0000_0000 - exclusiveMax) % exclusiveMax
    let value = this.nextUint32()
    while (value < threshold) value = this.nextUint32()
    return value % exclusiveMax
  }

  snapshot(name: string): RandomStreamSnapshot {
    return {
      name,
      stateHex: this.state.toString(16).padStart(16, '0'),
      incrementHex: this.increment.toString(16).padStart(16, '0'),
    }
  }
}

export class RandomProvider {
  private readonly streams = new Map<string, Pcg32>()

  constructor(private readonly rootSeed: string, snapshots: RandomStreamSnapshot[] = []) {
    for (const snapshot of snapshots) this.streams.set(snapshot.name, Pcg32.restore(snapshot))
  }

  stream(name: string): Pcg32 {
    let stream = this.streams.get(name)
    if (!stream) {
      stream = new Pcg32(hashSeed(`${this.rootSeed}\u001f${name}`), hashSeed(name))
      this.streams.set(name, stream)
    }
    return stream
  }

  snapshot(): RandomStreamSnapshot[] {
    return [...this.streams.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, stream]) => stream.snapshot(name))
  }
}
