/**
 * Normalize activityLogs.timestamp to epoch milliseconds.
 *
 * Conversion policy (audit-timestamp-v1):
 * - finite epoch-millisecond numbers are already normalized and are skipped;
 * - epoch-second numbers/numeric strings are multiplied by 1,000;
 * - other numeric strings are interpreted as epoch milliseconds;
 * - Firestore Timestamp-like values use toMillis();
 * - non-numeric strings must be parseable by Date.parse();
 * - zero, negative, non-finite, or otherwise invalid values are skipped.
 *
 * The CLI is DRY-RUN unless --commit is supplied. It reads documents in ID
 * order, supports --start-after/--limit, commits fresh batches of at most 400,
 * and stores the original value once in migrationHistory.auditTimestampV1.
 *
 * Rollback: export/backup activityLogs first. For each migrated record restore
 * `migrationHistory.auditTimestampV1.original` to `timestamp`, then remove only
 * that history key after verifying the restored value. Never bulk-delete the
 * whole migrationHistory map.
 */

import { loadOperatorEnv } from "./operator-env.ts"
import { COLLECTION_ACTIVITY_LOGS } from "../lib/constants.ts"

export const AUDIT_TIMESTAMP_MIGRATION = "auditTimestampV1"
export const AUDIT_TIMESTAMP_POLICY = "audit-timestamp-v1"
export const DEFAULT_BATCH_SIZE = 400

export interface AuditRecord {
  id: string
  timestamp: unknown
  migrationHistory?: Record<string, unknown>
}

export interface AuditTimestampAdapter {
  readonly projectId: string
  readPage(options: { startAfter?: string; limit: number }): Promise<AuditRecord[]>
  commit(updates: AuditTimestampUpdate[]): Promise<void>
}

export interface AuditTimestampUpdate {
  id: string
  timestamp: number
  history: { original: unknown; migratedAt: number; policy: string }
}

export interface MigrationResult {
  mode: "dry-run" | "commit"
  projectId: string
  collection: string
  inspected: number
  eligible: number
  written: number
  skipped: Record<string, number>
  lastDocumentId?: string
  committedChunks: number
}

export function normalizeAuditTimestamp(value: unknown):
  | { ok: true; milliseconds: number; kind: string }
  | { ok: false; reason: string } {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: "invalid-number" }
    if (value >= 100_000_000_000) return { ok: false, reason: "already-normalized" }
    if (value >= 1_000_000_000) return { ok: true, milliseconds: Math.trunc(value * 1000), kind: "epoch-seconds" }
    return { ok: false, reason: "ambiguous-number" }
  }

  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    const milliseconds = (value as { toMillis(): number }).toMillis()
    return Number.isFinite(milliseconds) && milliseconds > 0
      ? { ok: true, milliseconds: Math.trunc(milliseconds), kind: "firestore-timestamp" }
      : { ok: false, reason: "invalid-firestore-timestamp" }
  }

  if (typeof value !== "string" || !value.trim()) return { ok: false, reason: "missing-or-unsupported" }
  const trimmed = value.trim()
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (!Number.isFinite(numeric) || numeric <= 0) return { ok: false, reason: "invalid-numeric-string" }
    const milliseconds = numeric < 100_000_000_000 ? numeric * 1000 : numeric
    return { ok: true, milliseconds: Math.trunc(milliseconds), kind: numeric < 100_000_000_000 ? "numeric-epoch-seconds" : "numeric-epoch-milliseconds" }
  }
  const milliseconds = Date.parse(trimmed)
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? { ok: true, milliseconds, kind: "date-string" }
    : { ok: false, reason: "unparseable-string" }
}

export async function migrateAuditTimestamps(options: {
  adapter: AuditTimestampAdapter
  commit?: boolean
  startAfter?: string
  limit?: number
  pageSize?: number
  batchSize?: number
  now?: () => number
  log?: (message: string) => void
}): Promise<MigrationResult> {
  const mode = options.commit ? "commit" : "dry-run"
  const maximum = Math.max(0, options.limit ?? 10_000)
  const pageSize = Math.min(500, Math.max(1, options.pageSize ?? 400))
  const batchSize = Math.min(400, Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE))
  const result: MigrationResult = {
    mode,
    projectId: options.adapter.projectId,
    collection: COLLECTION_ACTIVITY_LOGS,
    inspected: 0,
    eligible: 0,
    written: 0,
    skipped: {},
    committedChunks: 0,
  }
  let cursor = options.startAfter
  let pending: AuditTimestampUpdate[] = []
  const skip = (reason: string) => { result.skipped[reason] = (result.skipped[reason] || 0) + 1 }

  const flush = async () => {
    if (!options.commit || pending.length === 0) return
    const chunk = pending
    pending = [] // a committed chunk is never reused
    try {
      await options.adapter.commit(chunk)
      result.written += chunk.length
      result.committedChunks++
    } catch (cause) {
      const error = new Error(`Commit failed after ${result.written}/${result.eligible} eligible writes; last document ${result.lastDocumentId || "none"}`)
      ;(error as Error & { cause?: unknown; partialResult?: MigrationResult }).cause = cause
      ;(error as Error & { partialResult?: MigrationResult }).partialResult = result
      throw error
    }
  }

  while (result.inspected < maximum) {
    const records = await options.adapter.readPage({ startAfter: cursor, limit: Math.min(pageSize, maximum - result.inspected) })
    if (records.length === 0) break
    for (const record of records) {
      result.inspected++
      result.lastDocumentId = record.id
      cursor = record.id
      const normalized = normalizeAuditTimestamp(record.timestamp)
      if (!normalized.ok) { skip(normalized.reason); continue }
      if (record.migrationHistory?.[AUDIT_TIMESTAMP_MIGRATION]) { skip("history-already-present"); continue }
      result.eligible++
      options.log?.(`${record.id}: ${normalized.kind} -> ${normalized.milliseconds}`)
      pending.push({
        id: record.id,
        timestamp: normalized.milliseconds,
        history: { original: record.timestamp, migratedAt: (options.now || Date.now)(), policy: AUDIT_TIMESTAMP_POLICY },
      })
      if (pending.length >= batchSize) await flush()
    }
    if (records.length < pageSize) break
  }
  await flush()
  return result
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function createFirestoreAdapter(): Promise<AuditTimestampAdapter> {
  loadOperatorEnv()
  const [{ cert, getApps, initializeApp, applicationDefault }, { getFirestore, FieldPath }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore"),
  ])
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, "\n")
  if (!projectId) throw new Error("Missing FIREBASE_ADMIN_PROJECT_ID (or FIREBASE_PROJECT_ID).")
  if (!getApps().length) {
    initializeApp({
      projectId,
      credential: clientEmail && privateKey ? cert({ projectId, clientEmail, privateKey }) : applicationDefault(),
    })
  }
  const db = getFirestore()
  return {
    projectId,
    async readPage({ startAfter, limit }) {
      let query: FirebaseFirestore.Query = db.collection(COLLECTION_ACTIVITY_LOGS).orderBy(FieldPath.documentId()).limit(limit)
      if (startAfter) query = query.startAfter(startAfter)
      const snapshot = await query.get()
      return snapshot.docs.map(doc => ({ id: doc.id, timestamp: doc.get("timestamp"), migrationHistory: doc.get("migrationHistory") }))
    },
    async commit(updates) {
      const batch = db.batch()
      for (const update of updates) {
        batch.update(db.collection(COLLECTION_ACTIVITY_LOGS).doc(update.id), {
          timestamp: update.timestamp,
          [`migrationHistory.${AUDIT_TIMESTAMP_MIGRATION}`]: update.history,
        })
      }
      await batch.commit()
    },
  }
}

export async function runAuditTimestampCli(): Promise<MigrationResult> {
  const adapter = await createFirestoreAdapter()
  const commit = process.argv.includes("--commit")
  const limit = Number(readArg("limit") || "10000")
  const startAfter = readArg("start-after")
  console.log(`TALASYS audit timestamp migration | project=${adapter.projectId} | collection=${COLLECTION_ACTIVITY_LOGS} | mode=${commit ? "COMMIT" : "DRY-RUN"}`)
  const result = await migrateAuditTimestamps({ adapter, commit, limit, startAfter, log: console.log })
  console.log(JSON.stringify(result, null, 2))
  if (!commit) console.log("Dry-run made zero writes. Re-run with --commit only after reviewing output and backup/rollback readiness.")
  return result
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrate-audit-timestamps.ts")) {
  runAuditTimestampCli().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    if ((error as { partialResult?: MigrationResult })?.partialResult) console.error(JSON.stringify((error as { partialResult: MigrationResult }).partialResult, null, 2))
    process.exitCode = 1
  })
}
