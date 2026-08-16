import type { WorkbenchProjection } from '../projection'

/** Keeps the newest non-authoritative map response while always accepting newer simulation data. */
export function mergeWorkbenchProjection(previous: WorkbenchProjection | undefined, incoming: WorkbenchProjection): WorkbenchProjection {
  if (previous?.projectionEpoch === incoming.projectionEpoch && previous.map.revision > incoming.map.revision) return { ...incoming, map: previous.map }
  return incoming
}
