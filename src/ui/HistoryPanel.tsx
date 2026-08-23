import { HISTORY_METRICS, historicalHighlights, metricDelta, metricTimeline, personTimeline } from '../history/history'
import type { SimulationEvent, StatisticSample } from '../simulation/domain/types'

interface HistoryPanelProps {
  events: readonly SimulationEvent[]
  statistics: readonly StatisticSample[]
  selectedPersonId?: string
  onInspectPerson: (personId: string) => void
  onRefresh: () => void
  loading: boolean
}

export function HistoryPanel({ events, statistics, selectedPersonId, onInspectPerson, onRefresh, loading }: HistoryPanelProps) {
  const timeline = selectedPersonId ? personTimeline(events, selectedPersonId, 24) : []
  const highlights = historicalHighlights(events, 12)
  return <section className="history-panel" aria-label="Historical inspection">
    <header className="history-heading">
      <div><span className="eyebrow">HISTORICAL INSPECTION</span><h2>Recorded evidence over time</h2><p>Events and sampled metrics are read from local run history; nothing is inferred.</p></div>
      <button onClick={onRefresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh history'}</button>
    </header>
    <div className="history-grid">
      <section className="history-section">
        <h3>Population and social trends</h3>
        {HISTORY_METRICS.map((metricId) => {
          const samples = metricTimeline(statistics, metricId)
          const latest = samples.at(-1)
          const delta = metricDelta(statistics, metricId)
          return <div className="history-metric" key={metricId}><span>{historyMetricLabel(metricId)}</span><strong>{latest?.value ?? '—'}</strong><small>{latest ? `Tick ${latest.tick}${delta === undefined ? '' : ` · ${signed(delta)} since first sample`}` : 'No daily samples saved yet'}</small></div>
        })}
      </section>
      <section className="history-section">
        <h3>Major recorded events</h3>
        {highlights.length === 0 && <p className="history-empty">No significant recorded events are available yet.</p>}
        <div className="history-event-list">{highlights.map(({ event, reason }) => <HistoryEvent key={event.id} event={event} label={reason.replace('-', ' ')} onInspectPerson={onInspectPerson} />)}</div>
      </section>
      <section className="history-section">
        <h3>{selectedPersonId ? `Timeline · ${selectedPersonId}` : 'Person timeline'}</h3>
        {selectedPersonId ? <>{timeline.length === 0 && <p className="history-empty">No recorded events explicitly involve this person yet.</p>}<div className="history-event-list">{timeline.map((event) => <HistoryEvent key={event.id} event={event} onInspectPerson={onInspectPerson} />)}</div></> : <p className="history-empty">Hook a person to see their exact recorded event timeline.</p>}
      </section>
    </div>
  </section>
}

function HistoryEvent({ event, label, onInspectPerson }: { event: SimulationEvent; label?: string; onInspectPerson: (personId: string) => void }) {
  const people = eventPeople(event)
  return <article className="history-event"><span>Tick {event.tick}</span><strong>{event.type.replaceAll('_', ' ')}</strong>{label && <em>{label}</em>}<div>{people.map((personId) => <button key={personId} onClick={() => onInspectPerson(personId)}>Inspect {personId}</button>)}</div></article>
}

function eventPeople(event: SimulationEvent): string[] {
  const values = Object.entries(event.payload).flatMap(([key, value]) => {
    if (typeof value !== 'string') return []
    if (key === 'parentIds') return value.split(',').map((id) => id.trim()).filter(Boolean)
    return key.endsWith('PersonId') || key === 'personId' || key === 'otherPersonId' ? [value] : []
  })
  return [...new Set(values)].sort()
}

function historyMetricLabel(metricId: string): string {
  return metricId.replace(/^population\./, '').replace(/^resources\./, '').replace(/^social\./, '').replace(/([A-Z])/g, ' $1')
}

function signed(value: number): string { return value > 0 ? `+${value}` : String(value) }
