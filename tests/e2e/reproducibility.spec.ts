import { test } from '@playwright/test'
import { registerWorkbenchTests } from './workbench.suites'

registerWorkbenchTests('reproducibility', (title, run) => test(title, run))
