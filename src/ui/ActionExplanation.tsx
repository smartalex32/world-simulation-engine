import { contributionGroups, type ContributionView } from './personVariables'

interface ActionExplanationProps<T extends ContributionView> {
  action?: string
  probabilityPermille?: number
  targetCellId?: string
  contributions: readonly T[]
  alternatives: readonly { action: string; weight: number }[]
  labelForSource: (sourceId: string | undefined, fallbackLabel: string | undefined) => string
}

export function ActionExplanation<T extends ContributionView>({ action, probabilityPermille, targetCellId, contributions, alternatives, labelForSource }: ActionExplanationProps<T>) {
  return <div className="decision-panel">
    <h3>Why this action?</h3>
    {action && probabilityPermille !== undefined ? <>
      <div className="decision-name"><strong>{action}</strong><span>{(probabilityPermille / 10).toFixed(1)}% selection probability</span></div>
      {targetCellId && <div className="decision-target">Target cell {targetCellId}</div>}
      <div className="contribution-groups">{contributionGroups(contributions).map((group) => <section key={group.id} className="contribution-group" aria-labelledby={`contribution-${group.id}`}>
        <h4 id={`contribution-${group.id}`}>{group.label}</h4>
        {group.contributions.map((contribution, index) => <div key={`${contribution.sourceId ?? group.id}-${index}`} data-source-id={contribution.sourceId}><span>{labelForSource(contribution.sourceId, contribution.label)}</span><strong className={contribution.value >= 0 ? 'positive' : 'negative'}>{contribution.value >= 0 ? '+' : ''}{contribution.value}</strong></div>)}
      </section>)}</div>
      <div className="alternatives"><span>Candidate weights</span>{alternatives.map((entry) => <div key={entry.action}><span>{entry.action}</span><strong>{entry.weight}</strong></div>)}</div>
    </> : <p>No action has been evaluated yet. Advance one hour.</p>}
  </div>
}
