import { test } from '@playwright/test'
import { registerWorkbenchTests } from './workbench.suites'

registerWorkbenchTests('authoring', (title, run) => test(title, run))
