import { existsSync, readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
if (!String(manifest.packageManager ?? '').startsWith('pnpm@')) throw new Error('package.json must pin pnpm in packageManager')
if (!existsSync('pnpm-lock.yaml')) throw new Error('pnpm-lock.yaml is required')
for (const conflicting of ['package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb']) if (existsSync(conflicting)) throw new Error(`Conflicting root lockfile is not allowed: ${conflicting}`)
