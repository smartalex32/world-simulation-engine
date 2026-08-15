/** Deterministic exposure supplied from canonical parent/child co-presence only. */
export const PARENT_CURIOSITY_EXPOSURE_CHANNEL = 'exposure.parent.curiosity-modeling' as const
export const PARENT_CURIOSITY_EXPERIENCE_TYPE = 'experience.parent.curiosity-modeling' as const
export const PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS = 720

export interface ParentCuriosityExposureAccumulator {
  readonly channelId: typeof PARENT_CURIOSITY_EXPOSURE_CHANNEL
  readonly windowStartTick: number
  readonly recipientHours: number
  readonly sourceHours: number
  readonly weightedSourceValueHours: number
  /** Canonical sorted union of parents actually co-present in this window. */
  readonly sourcePersonIds: readonly string[]
  readonly lastExposureTick?: number
}

/** A parent already established by the caller as co-present with the recipient. */
export interface CanonicalCoPresentParentCuriositySource {
  readonly parentId: string
  readonly curiosityPermille: number
}

export interface ParentCuriosityExposureSample {
  readonly accumulator: ParentCuriosityExposureAccumulator
  readonly tick: number
  readonly coPresentParents: readonly CanonicalCoPresentParentCuriositySource[]
}

export interface ParentCuriosityModelingExperience {
  readonly type: typeof PARENT_CURIOSITY_EXPERIENCE_TYPE
  readonly channelId: typeof PARENT_CURIOSITY_EXPOSURE_CHANNEL
  readonly recipientId: string
  readonly sourcePersonIds: readonly string[]
  readonly windowStartTick: number
  readonly windowEndTick: number
  readonly recipientHours: number
  readonly sourceHours: number
  readonly sourceMeanPermille: number
  readonly exposureStrengthPermille: number
}

export interface CompletedParentCuriosityExposureWindow {
  readonly experience?: ParentCuriosityModelingExperience
  readonly accumulator: ParentCuriosityExposureAccumulator
}

export function createParentCuriosityExposureAccumulator(windowStartTick: number): ParentCuriosityExposureAccumulator {
  assertSafeNonNegativeInteger(windowStartTick, 'windowStartTick')
  return { channelId: PARENT_CURIOSITY_EXPOSURE_CHANNEL, windowStartTick, recipientHours: 0, sourceHours: 0, weightedSourceValueHours: 0, sourcePersonIds: [] }
}

/** Adds one recipient hour and one source-hour per canonical co-present parent. Empty input is a no-op. */
export function accumulateParentCuriosityExposure(sample: ParentCuriosityExposureSample): ParentCuriosityExposureAccumulator {
  const { accumulator, tick, coPresentParents } = sample
  validateAccumulator(accumulator)
  assertSafeNonNegativeInteger(tick, 'tick')
  if (accumulator.lastExposureTick !== undefined && tick <= accumulator.lastExposureTick) {
    throw new Error(`Exposure tick ${tick} must be greater than last exposure tick ${accumulator.lastExposureTick}`)
  }
  validateCanonicalParents(coPresentParents)
  if (coPresentParents.length === 0) return accumulator
  const sourceHours = coPresentParents.length
  const weightedSourceValueHours = coPresentParents.reduce((total, parent) => total + parent.curiosityPermille, 0)
  return {
    ...accumulator,
    recipientHours: accumulator.recipientHours + 1,
    sourceHours: accumulator.sourceHours + sourceHours,
    weightedSourceValueHours: accumulator.weightedSourceValueHours + weightedSourceValueHours,
    sourcePersonIds: sortedUnique([...accumulator.sourcePersonIds, ...coPresentParents.map(({ parentId }) => parentId)]),
    lastExposureTick: tick,
  }
}

/** Closes exactly one 720-hour window and resets it, emitting only real exposure. */
export function completeParentCuriosityExposureWindow(
  accumulator: ParentCuriosityExposureAccumulator,
  nextWindowStartTick: number,
  recipientId: string,
): CompletedParentCuriosityExposureWindow {
  validateAccumulator(accumulator)
  assertSafeNonNegativeInteger(nextWindowStartTick, 'nextWindowStartTick')
  if (nextWindowStartTick - accumulator.windowStartTick !== PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS) {
    throw new Error(`Parent curiosity exposure windows must span exactly ${PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS} ticks`)
  }
  if (!recipientId) throw new Error('recipientId is required')
  const reset = createParentCuriosityExposureAccumulator(nextWindowStartTick)
  if (accumulator.sourceHours === 0) return { accumulator: reset }
  return {
    experience: {
      type: PARENT_CURIOSITY_EXPERIENCE_TYPE,
      channelId: PARENT_CURIOSITY_EXPOSURE_CHANNEL,
      recipientId,
      sourcePersonIds: accumulator.sourcePersonIds,
      windowStartTick: accumulator.windowStartTick,
      windowEndTick: nextWindowStartTick - 1,
      recipientHours: accumulator.recipientHours,
      sourceHours: accumulator.sourceHours,
      sourceMeanPermille: symmetricRoundDivision(accumulator.weightedSourceValueHours, accumulator.sourceHours),
      exposureStrengthPermille: Math.min(1000, Math.floor(accumulator.sourceHours * 1000 / PARENT_CURIOSITY_EXPOSURE_WINDOW_TICKS)),
    },
    accumulator: reset,
  }
}

/** Integer division with ties rounded away from zero, for exact signed arithmetic. */
export function symmetricRoundDivision(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator)) throw new Error('numerator must be a safe integer')
  if (!Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('denominator must be a positive safe integer')
  return Math.sign(numerator) * Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator)
}

function validateAccumulator(accumulator: ParentCuriosityExposureAccumulator): void {
  if (accumulator.channelId !== PARENT_CURIOSITY_EXPOSURE_CHANNEL) throw new Error('Unexpected exposure channel')
  assertSafeNonNegativeInteger(accumulator.windowStartTick, 'windowStartTick')
  assertSafeNonNegativeInteger(accumulator.recipientHours, 'recipientHours')
  assertSafeNonNegativeInteger(accumulator.sourceHours, 'sourceHours')
  assertSafeNonNegativeInteger(accumulator.weightedSourceValueHours, 'weightedSourceValueHours')
  if (accumulator.sourceHours > accumulator.recipientHours * 2) throw new Error('sourceHours cannot exceed two canonical parent sources per recipient hour')
  if (accumulator.lastExposureTick !== undefined) assertSafeNonNegativeInteger(accumulator.lastExposureTick, 'lastExposureTick')
  if (!isSortedUnique(accumulator.sourcePersonIds)) throw new Error('sourcePersonIds must be sorted and unique')
}

function validateCanonicalParents(parents: readonly CanonicalCoPresentParentCuriositySource[]): void {
  if (parents.length > 2) throw new Error('At most two canonical parent sources may be supplied per recipient hour')
  if (!isSortedUnique(parents.map(({ parentId }) => parentId))) throw new Error('Canonical parent sources must be strictly ordered by parentId')
  for (const parent of parents) {
    if (!parent.parentId) throw new Error('Canonical parent source requires parentId')
    assertPermille(parent.curiosityPermille, `curiosityPermille for ${parent.parentId}`)
  }
}

function sortedUnique(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)].sort((first, second) => first < second ? -1 : first > second ? 1 : 0)
}

function isSortedUnique(ids: readonly string[]): boolean {
  return ids.every((id, index) => Boolean(id) && (index === 0 || ids[index - 1]! < id))
}

function assertPermille(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000) throw new Error(`${name} must be an integer permille value between 0 and 1000`)
}

function assertSafeNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`)
}
