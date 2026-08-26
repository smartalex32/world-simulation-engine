import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const run = promisify(execFile)
const databaseUrl = required('DATABASE_URL')
const output = resolve(required('HOSTED_BACKUP_FILE'))
await run('pg_dump', ['--format=custom', '--file', output, databaseUrl])
await access(output)
await run('pg_restore', ['--list', output])
console.info(`Verified hosted PostgreSQL backup: ${output}`)

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set`)
  return value
}
