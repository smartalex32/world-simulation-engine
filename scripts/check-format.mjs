import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const roots = ['src', 'scripts', 'tests']
const violations = []
for (const root of roots) visit(root)
if (violations.length) throw new Error(`Formatting violations:\n${violations.join('\n')}`)

function visit(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry); const stat = statSync(path)
    if (stat.isDirectory()) visit(path)
    else if (/\.(?:ts|tsx|mjs)$/.test(entry)) inspect(path)
  }
}

function inspect(path) {
  const text = readFileSync(path, 'utf8')
  if (!text.endsWith('\n')) violations.push(`${relative('.', path)}: missing final newline`)
  text.split(/\r?\n/).forEach((line, index) => { if (/[ \t]+$/.test(line)) violations.push(`${relative('.', path)}:${index + 1}: trailing whitespace`) })
}
