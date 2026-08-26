import { PostgresHostedRunStore } from '../src/hosted/postgres'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL must be set')
const backup = process.env.HOSTED_MIGRATION_BACKUP_FILE
if (!backup) throw new Error('Refusing hosted migration: HOSTED_MIGRATION_BACKUP_FILE must name a verified backup')
const backupPath = resolve(backup)
await access(backupPath)
await promisify(execFile)('pg_restore', ['--list', backupPath])
const store = await PostgresHostedRunStore.connect(databaseUrl)
try {
  await store.initialize()
  console.info('Hosted PostgreSQL schema is current and connection verification succeeded.')
} finally { await store.close() }
