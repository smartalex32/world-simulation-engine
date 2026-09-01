import { test } from '@playwright/test'
import { registerWorkbenchTests } from './workbench.suites'

registerWorkbenchTests('inspection', (title, run) => test(title, run))
