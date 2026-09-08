export interface WorkbenchVisualBaseline {
  id: string
  path: string
  anchorRole?: 'heading'
  anchorName: string | RegExp
  state: 'populated' | 'empty' | 'partial' | 'unavailable' | 'error'
}

/** Reviewed screenshot targets. Tests capture these exact deterministic states. */
export const WORKBENCH_VISUAL_BASELINES: readonly WorkbenchVisualBaseline[] = [
  { id: 'world-populated', path: '/', anchorName: 'Seeded Valley', anchorRole: 'heading', state: 'populated' },
  { id: 'person-populated', path: '/?workspace=entities&entity=person%3Aperson-0001&focus=person%3Aperson-0001', anchorName: 'person-0001', anchorRole: 'heading', state: 'populated' },
  { id: 'relationships-empty', path: '/?workspace=entities&entity=person%3Aperson-0001&focus=person%3Aperson-0001&detail=network', anchorName: /Relationships around person-0001/, anchorRole: 'heading', state: 'empty' },
  { id: 'history-empty', path: '/?workspace=history', anchorName: 'Multi-lane recorded evidence', anchorRole: 'heading', state: 'empty' },
  { id: 'simulation-unavailable', path: '/?workspace=simulation', anchorName: /Run /, anchorRole: 'heading', state: 'unavailable' },
  { id: 'analytics-unavailable', path: '/?workspace=analytics', anchorName: 'Conditions and retained trends', anchorRole: 'heading', state: 'unavailable' },
  { id: 'tools-partial', path: '/?workspace=tools', anchorName: /WORLD TOOLS/i, state: 'partial' },
  { id: 'settings-unavailable', path: '/?workspace=settings', anchorName: /WORKBENCH SETTINGS/i, state: 'unavailable' },
  { id: 'invalid-target-error', path: '/?workspace=entities&entity=person%3A%3Cscript%3E', anchorName: /invalid target/i, state: 'error' },
] as const
