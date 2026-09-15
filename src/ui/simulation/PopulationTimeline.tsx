import type { StatisticSample } from '../../simulation/domain/types'
import { buildTimeSeriesViewModel, Sparkline } from '../visualization'

export function PopulationTimeline({ statistics, tick, population, onHistory }: { statistics: readonly StatisticSample[]; tick: number; population: number; onHistory: () => void }) {
  const samples = statistics.filter((sample) => sample.scope === 'world' && sample.metricId === 'population.count')
  const fromTick = samples.reduce((earliest, sample) => Math.min(earliest, sample.tick), tick)
  const series = buildTimeSeriesViewModel({ id: 'world-population-timeline', label: 'Recorded population', unit: 'count', values: samples, fromTick, toTick: tick, provenance: { source: 'Daily world population samples', cadenceTicks: 24 }, pointLimit: 120 })
  return <div className="population-timeline"><div><span className="eyebrow">YOUR WORLD, THROUGH TIME</span><strong>{population.toLocaleString()} <small>people</small></strong></div><div className="population-timeline-chart">{samples.length ? <Sparkline series={series} width={360} height={32} /> : <span>Population history appears after the first daily sample.</span>}</div><span className="timeline-current-day">Day {Math.floor(tick / 24)}, {(tick % 24).toString().padStart(2, '0')}:00</span><button onClick={onHistory}>Explore history →</button></div>
}
