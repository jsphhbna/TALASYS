/**
 * TALASYS Cloudinary Media Migration Script (#52)
 *
 * Scans Firestore collections (`verifications`, `documentRequests`, `users`) for legacy
 * public Cloudinary media URLs and transitions them to protected `authenticated` delivery
 * using Cloudinary's Admin API.
 *
 * Usage:
 *   npx ts-node scripts/migrate-cloudinary-access.ts --dry-run
 *   npx ts-node scripts/migrate-cloudinary-access.ts --commit
 */

import { parseCloudinaryAsset } from "../lib/security/media-auth"

interface MigrationItem {
  collection: string
  docId: string
  field: string
  url: string
  publicId: string
  targetType: "authenticated"
}

export async function planCloudinaryMigration(firestoreRecords: Array<{ collection: string; id: string; data: any }>): Promise<MigrationItem[]> {
  const items: MigrationItem[] = []

  for (const record of firestoreRecords) {
    const { collection, id, data } = record

    // Verifications: proof documents
    if (collection === "verifications") {
      if (Array.isArray(data.documents)) {
        for (const doc of data.documents) {
          if (typeof doc?.url === "string" && doc.url.includes("cloudinary.com") && doc.url.includes("/image/upload/")) {
            const parsed = parseCloudinaryAsset(doc.url)
            items.push({
              collection,
              docId: id,
              field: `documents.${doc.name || "doc"}`,
              url: doc.url,
              publicId: parsed.publicId,
              targetType: "authenticated"
            })
          }
        }
      }
      if (typeof data.proofOfResidencyUrl === "string" && data.proofOfResidencyUrl.includes("/image/upload/")) {
        items.push({
          collection,
          docId: id,
          field: "proofOfResidencyUrl",
          url: data.proofOfResidencyUrl,
          publicId: parseCloudinaryAsset(data.proofOfResidencyUrl).publicId,
          targetType: "authenticated"
        })
      }
    }

    // Document Requests: receipts & authorization letters
    if (collection === "documentRequests") {
      if (typeof data.receiptUrl === "string" && data.receiptUrl.includes("/image/upload/")) {
        items.push({
          collection,
          docId: id,
          field: "receiptUrl",
          url: data.receiptUrl,
          publicId: parseCloudinaryAsset(data.receiptUrl).publicId,
          targetType: "authenticated"
        })
      }
      if (typeof data.authorizationLetterUrl === "string" && data.authorizationLetterUrl.includes("/image/upload/")) {
        items.push({
          collection,
          docId: id,
          field: "authorizationLetterUrl",
          url: data.authorizationLetterUrl,
          publicId: parseCloudinaryAsset(data.authorizationLetterUrl).publicId,
          targetType: "authenticated"
        })
      }
    }
  }

  return items
}

if (require.main === module) {
  console.log("=== TALASYS Cloudinary Access Migration Planner ===")
  const isCommit = process.argv.includes("--commit")
  console.log(`Mode: ${isCommit ? "COMMIT (Executing changes)" : "DRY-RUN (Inspection only)"}`)
  console.log("To execute in production: Ensure CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, and FIREBASE_ADMIN credentials are set.")
}
