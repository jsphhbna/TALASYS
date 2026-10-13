/**
 * Migration Script: Normalize legacy string timestamps in activity_logs to numeric epoch (#15).
 *
 * Usage:
 *   npx ts-node scripts/migrate-audit-timestamps.ts [--dry-run]
 *
 * Safety & Invariants:
 *   - Idempotent: Skips documents that already have numeric timestamps.
 *   - Dry-run by default unless --commit flag is passed.
 *   - Preserves original values in legacyTimestamp field for safe rollback.
 */

import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

async function runMigration() {
  const isCommit = process.argv.includes("--commit")
  console.log(`Starting audit timestamp migration [Mode: ${isCommit ? "COMMIT" : "DRY-RUN"}]...`)

  if (!getApps().length) {
    // Uses application default credentials or environment
    initializeApp()
  }

  const db = getFirestore()
  const logsRef = db.collection("activity_logs")
  const snapshot = await logsRef.get()

  let inspected = 0
  let migrated = 0
  let skipped = 0

  const batch = db.batch()
  let batchOps = 0

  for (const doc of snapshot.docs) {
    inspected++
    const data = doc.data()
    const currentTs = data.timestamp

    if (typeof currentTs === "string") {
      const parsedNum = Number(currentTs.trim())
      const numericTimestamp = !isNaN(parsedNum) && parsedNum > 0 ? parsedNum : new Date(currentTs).getTime()

      if (!isNaN(numericTimestamp) && numericTimestamp > 0) {
        migrated++
        console.log(`Doc ${doc.id}: String "${currentTs}" -> Number ${numericTimestamp}`)

        if (isCommit) {
          batch.update(doc.ref, {
            timestamp: numericTimestamp,
            legacyTimestamp: currentTs, // preserves original for rollback
            migratedAt: Date.now()
          })
          batchOps++

          if (batchOps >= 400) {
            await batch.commit()
            batchOps = 0
          }
        }
      } else {
        skipped++
        console.warn(`Doc ${doc.id}: Unparseable timestamp "${currentTs}"`)
      }
    } else {
      skipped++
    }
  }

  if (isCommit && batchOps > 0) {
    await batch.commit()
  }

  console.log(`\nMigration completed:`)
  console.log(`- Inspected: ${inspected}`)
  console.log(`- To Migrate: ${migrated}`)
  console.log(`- Skipped / Already Numeric: ${skipped}`)
  if (!isCommit) {
    console.log(`NOTE: Run with --commit to apply changes to Firestore.`)
  }
}

if (require.main === module) {
  runMigration().catch(err => {
    console.error("Migration failed:", err)
    process.exit(1)
  })
}

export { runMigration }
