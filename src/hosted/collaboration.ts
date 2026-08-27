import { createHash, randomBytes } from 'node:crypto'
import argon2 from 'argon2'

/** Noncanonical hosted identity and session primitives.  Password material is
 * never persisted in a simulation record or exposed by an API projection. */
export interface HostedAccount { id: string; email: string; passwordHash: string; createdAt: string }
export interface HostedSession { id: string; accountId: string; tokenHash: string; expiresAt: string; createdAt: string }
export type WorldRole = 'owner' | 'editor' | 'viewer'
export interface WorldAccess { worldId: string; accountId: string; role: WorldRole }
export interface DraftLease { worldId: string; leaseId: string; holderAccountId: string; revision: number; expiresAt: string }
export interface DraftAuditEntry { id: string; worldId: string; actorAccountId: string; action: string; revision: number; createdAt: string }

export function requireRole(access: WorldAccess | undefined, ...roles: readonly WorldRole[]): WorldAccess {
  if (!access || !roles.includes(access.role)) throw new Error('Shared world authorization failed')
  return access
}
export function assertActiveLease(lease: DraftLease | undefined, accountId: string, leaseId: string, expectedRevision: number, now: string): DraftLease {
  if (!lease || lease.expiresAt <= now) throw new Error('Draft editing lease is unavailable')
  if (lease.holderAccountId !== accountId || lease.leaseId !== leaseId) throw new Error('Draft editing lease is not held by this account')
  if (lease.revision !== expectedRevision) throw new Error(`Draft revision is stale; current revision is ${lease.revision}`)
  return lease
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256) throw new Error('Password must be 12 through 256 characters')
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 })
}
export async function verifyPassword(hash: string, password: string): Promise<boolean> { return argon2.verify(hash, password) }
export function createSessionToken(): string { return randomBytes(32).toString('base64url') }
export function hashSessionToken(token: string): string { return createHash('sha256').update(token).digest('hex') }
