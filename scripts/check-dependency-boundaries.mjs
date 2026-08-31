import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'

const sourceRoot = resolve('src')
const violations = []

visit(sourceRoot)
if (violations.length > 0) throw new Error(`Dependency boundary violations:\n${violations.join('\n')}`)

function visit(directory) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) visit(full)
    else if (/\.(?:ts|tsx)$/.test(entry)) inspect(full)
  }
}

function inspect(file) {
  if (/\.(?:test|integration\.test)\.tsx?$/.test(file)) return
  const text = readFileSync(file, 'utf8')
  const importer = slash(relative(sourceRoot, file))
  for (const match of text.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    const specifier = match[1]
    if (!specifier.startsWith('.')) continue
    const imported = slash(relative(sourceRoot, normalize(resolve(dirname(file), specifier))))
    const reason = forbiddenReason(importer, imported)
    if (reason) violations.push(`${importer} -> ${specifier}: ${reason}`)
  }
}

function forbiddenReason(importer, imported) {
  if (importer.startsWith('shared/') && !imported.startsWith('shared/')) return 'shared contracts must be environment-neutral'
  if (importer.startsWith('simulation/') && /^(?:ui|worker|persistence|hosted|projection)\//.test(imported)) return 'simulation authority cannot depend on delivery or persistence layers'
  if (importer.startsWith('runtime/') && /^(?:ui|worker|persistence|hosted)\//.test(imported)) return 'runtime contracts cannot depend on adapters'
  if (importer.startsWith('contentPacks/') && imported.startsWith('simulation/serialization/')) return 'content packs cannot depend on snapshot serialization'
  if (importer.startsWith('ui/') && imported.startsWith('simulation/engine/')) return 'UI must use worker/client contracts instead of engine internals'
  return undefined
}

function slash(value) { return value.split(sep).join('/') }
