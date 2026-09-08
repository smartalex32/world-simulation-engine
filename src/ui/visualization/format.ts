import type { MetricUnit } from './types'

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const signedDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, signDisplay: 'always' })

export function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return 'Not available'
  return Number.isInteger(value) ? integer.format(value) : decimal.format(value)
}

export function formatPermille(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return 'Not available'
  return `${decimal.format(value / 10)}%`
}

export function formatFixedPoint(value: number | undefined, scale = 1000): string {
  if (value === undefined || !Number.isFinite(value) || !Number.isInteger(scale) || scale <= 0) return 'Not available'
  return decimal.format(value / scale)
}

export function formatDelta(value: number | undefined, unit: MetricUnit): string {
  if (value === undefined || !Number.isFinite(value)) return 'Not comparable'
  if (unit === 'permille') return `${signedDecimal.format(value / 10)} pp`
  return signedDecimal.format(value)
}

export function formatDurationTicks(ticks: number | undefined, ticksPerDay = 24): string {
  if (ticks === undefined || !Number.isFinite(ticks) || ticks < 0) return 'Not available'
  const days = Math.floor(ticks / ticksPerDay)
  const hours = Math.round((ticks % ticksPerDay) * (24 / ticksPerDay))
  if (days === 0) return `${hours} h`
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`
}

export function formatTick(tick: number | undefined): string {
  if (tick === undefined || !Number.isInteger(tick) || tick < 0) return 'Not available'
  return `Tick ${integer.format(tick)}`
}

export function formatMetricValue(value: number | undefined, unit: MetricUnit): string {
  if (value === undefined) return 'Not available'
  if (unit === 'permille') return formatPermille(value)
  if (unit === 'fixed-point') return formatFixedPoint(value)
  if (unit === 'ticks') return `${formatNumber(value)} ticks`
  if (unit === 'hours') return `${formatNumber(value)} h`
  if (unit === 'meters') return `${formatNumber(value)} m`
  if (unit === 'kilometers') return `${formatNumber(value)} km`
  if (unit === 'milliseconds') return `${formatNumber(value)} ms`
  return formatNumber(value)
}
