import { test } from '@playwright/test'
import { registerWorkbenchTests } from './workbench.suites'

registerWorkbenchTests('quality', (title, run) => test(title, run))
