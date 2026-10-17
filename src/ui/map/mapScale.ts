export interface MapScaleBar {
  distanceMeters: number
  pixelWidth: number
  label: string
}

/** Returns a 1/2/5 scale whose drawn width matches the displayed distance. */
export function mapScaleBar(hexRadiusMeters: number, hexRadiusPixels: number, viewportScale: number): MapScaleBar {
  const metersPerPixel = hexRadiusMeters / Math.max(Number.EPSILON, hexRadiusPixels * viewportScale)
  const targetDistance = metersPerPixel * 80
  const exponent = Math.floor(Math.log10(Math.max(targetDistance, Number.MIN_VALUE)))
  const candidates = [-1, 0, 1].flatMap((offset) => [1, 2, 5].map((factor) => factor * 10 ** (exponent + offset)))
  const distanceMeters = candidates.reduce((best, candidate) => Math.abs(candidate / metersPerPixel - 80) < Math.abs(best / metersPerPixel - 80) ? candidate : best)
  return { distanceMeters, pixelWidth: distanceMeters / metersPerPixel, label: distanceMeters >= 1000 ? `${format(distanceMeters / 1000)} km` : `${format(distanceMeters)} m` }
}

function format(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '') }
