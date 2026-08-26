import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const run = promisify(execFile)
const databaseUrl = required('DATABASE_URL')
const input = resolve(required('HOSTED_BACKUP_FILE'))
await access(input)
if (process.env.HOSTED_RESTORE_CONFIRMED !== 'yes') throw new Error('Refusing restore: set HOSTED_RESTORE_CONFIRMED=yes after confirming the target database')
await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', databaseUrl, input])
console.info(`Restored hosted PostgreSQL backup: ${input}`)

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set`)
  return value
}
