import { test } from '@playwright/test'
import { registerWorkbenchTests } from './workbench.suites'

registerWorkbenchTests('navigation', (title, run) => test(title, run))
