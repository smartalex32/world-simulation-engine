import { variableGroups, type VariableDefinitionView, type VariableLayer } from './personVariables'

interface PersonVariableSectionsProps {
  definitions: readonly VariableDefinitionView[]
  values: Readonly<Record<string, number>>
  /** Limits rendering to the supplied semantic layers while retaining registry order. */
  layers?: readonly VariableLayer[]
}

const SECTIONS: ReadonlyArray<{ layer: VariableLayer; title: string; description: string }> = [
  { layer: 'state', title: 'Current condition', description: 'Short-term state' },
  { layer: 'need', title: 'Needs', description: 'Current urgency' },
  { layer: 'trait', title: 'Core dispositions', description: 'Persistent tendencies' },
]

export function PersonVariableSections({ definitions, values, layers }: PersonVariableSectionsProps) {
  const visibleLayers = layers ? new Set(layers) : undefined
  return <>
    {SECTIONS.map(({ layer, title, description }) => {
    if (visibleLayers && !visibleLayers.has(layer)) return null
    const groups = variableGroups(definitions, values, layer)
    if (groups.length === 0) return null
    return <section className="variable-section" key={layer} aria-labelledby={`${layer}-variables-heading`}>
      <div className="section-heading"><h3 id={`${layer}-variables-heading`}>{title}</h3><span>{description}</span></div>
      {groups.map((group) => <div className="variable-category" key={group.category}>
        <h4>{group.category}</h4>
        {group.rows.map(({ definition, value, normalized }) => <div className="variable-row" key={definition.id} data-variable-id={definition.id}>
          <div><span>{definition.label}</span><strong>{formatVariable(value, definition)}</strong></div>
          <div className="trait-track" aria-label={`${definition.label}: ${formatVariable(value, definition)}`}><i style={{ width: `${normalized * 100}%` }} /></div>
        </div>)}
      </div>)}
    </section>
    })}
  </>
}

function formatVariable(value: number, definition: VariableDefinitionView): string {
  if (definition.unit === 'permille') return `${(value / 10).toFixed(1)}%`
  return String(value)
}
