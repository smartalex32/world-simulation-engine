import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const protectedRoots = ['src/simulation', 'src/contentPacks', 'src/persistence', 'src/hosted', 'src/history', 'src/projection', 'src/worker']
const forbidden = [/\.localeCompare\s*\(/, /Math\.random\s*\(/, /Date\.now\s*\(/, /performance\.now\s*\(/]
const operationalExemptions = new Map([
  ['src/simulation/engine/engine.ts', [/performance\.now\s*\(/g]],
  ['src/simulation/engine/scaleBenchmark.ts', [/performance\.now\s*\(/g]],
  ['src/worker/simulation.worker.ts', [/performance\.now\s*\(/g]],
  ['src/worker/protocol.ts', [/Date\.now\s*\(/g]],
])
const violations = []
for (const root of protectedRoots) visit(root)
if (violations.length) throw new Error(`Unstable deterministic boundary usage:\n${violations.join('\n')}`)

function visit(path) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry); const stat = statSync(full)
    if (stat.isDirectory()) visit(full)
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      const text = readFileSync(full, 'utf8')
      // Only known operational timing/client-ID expressions are exempt. The
      // rest of these files remains protected against unstable ordering and
      // ambient random authority.
      const file = relative('.', full).replaceAll('\\', '/')
      const inspected = (operationalExemptions.get(file) ?? []).reduce((value, exemption) => value.replace(exemption, ''), text)
      for (const pattern of forbidden) if (pattern.test(inspected)) violations.push(`${relative('.', full)}: ${pattern}`)
    }
  }
}
