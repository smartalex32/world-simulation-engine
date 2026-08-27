import { createHash, randomBytes } from 'node:crypto'
import argon2 from 'argon2'

/** Noncanonical hosted identity and session primitives.  Password material is
 * never persisted in a simulation record or exposed by an API projection. */
export interface HostedAccount { id: string; email: string; passwordHash: string; createdAt: string }
export interface HostedSession { id: string; accountId: string; tokenHash: string; expiresAt: string; createdAt: string }
export type WorldRole = 'owner' | 'editor' | 'viewer'

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256) throw new Error('Password must be 12 through 256 characters')
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 })
}
export async function verifyPassword(hash: string, password: string): Promise<boolean> { return argon2.verify(hash, password) }
export function createSessionToken(): string { return randomBytes(32).toString('base64url') }
export function hashSessionToken(token: string): string { return createHash('sha256').update(token).digest('hex') }
