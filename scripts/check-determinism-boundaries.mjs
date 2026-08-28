import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const protectedRoots = ['src/simulation', 'src/contentPacks', 'src/persistence', 'src/hosted', 'src/history', 'src/projection', 'src/worker']
const forbidden = [/\.localeCompare\s*\(/, /Math\.random\s*\(/, /Date\.now\s*\(/, /performance\.now\s*\(/]
const violations = []
for (const root of protectedRoots) visit(root)
if (violations.length) throw new Error(`Unstable deterministic boundary usage:\n${violations.join('\n')}`)

function visit(path) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry); const stat = statSync(full)
    if (stat.isDirectory()) visit(full)
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      const text = readFileSync(full, 'utf8')
      // Worker frame pacing, client mutation IDs, and benchmark timing are
      // non-authoritative operational concerns; all simulation inputs/outputs
      // remain behind the protected engine and persistence boundaries.
      if (full.endsWith('scaleBenchmark.ts') || full.endsWith('simulation.worker.ts') || full.endsWith('protocol.ts')) continue
      for (const pattern of forbidden) if (pattern.test(text)) violations.push(`${relative('.', full)}: ${pattern}`)
    }
  }
}
