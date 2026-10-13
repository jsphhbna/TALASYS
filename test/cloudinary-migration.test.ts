import test from "node:test"
import assert from "node:assert/strict"
import { executeCloudinaryMigration, planCloudinaryMigration, type MigrationManifest } from "../scripts/migrate-cloudinary-access.ts"

const cloud = "talasys-test"
const image = `https://res.cloudinary.com/${cloud}/image/upload/v1/talasys/proofs/shared.webp`
const rawPdf = `https://res.cloudinary.com/${cloud}/raw/upload/v2/talasys/letters/authorization.pdf`

function manifest(): MigrationManifest {
  return { version: "cloudinary-authenticated-v1", projectId: "fixture-project", cloudName: cloud, updatedAt: "", entries: {} }
}

test("planner covers real payment, authorization, proof and signature fields and deduplicates assets", () => {
  const plan = planCloudinaryMigration([
    { collection: "verifications", id: "v1", data: { documents: [{ name: "ID", url: image }], proofOfResidencyUrl: image } },
    { collection: "documentRequests", id: "r1", data: { gcashScreenshotUrl: image, authorizationLetter: rawPdf } },
    { collection: "systemConfig", id: "global", data: { captainSignatureUrl: `https://res.cloudinary.com/${cloud}/image/upload/talasys/signatures/captain.png`, logoUrl: `https://res.cloudinary.com/${cloud}/image/upload/talasys/branding/logo.png` } },
  ], cloud)
  assert.equal(plan.assets.length, 3)
  const shared = plan.assets.find(asset => asset.publicId === "talasys/proofs/shared")!
  assert.equal(shared.references.length, 3)
  assert.equal(plan.assets.find(asset => asset.publicId.includes("authorization"))?.resourceType, "raw")
  assert.equal(plan.assets.some(asset => asset.publicId.includes("branding")), false)
})

test("resource type comes from URL structure, not a PDF suffix", () => {
  const plan = planCloudinaryMigration([{ collection: "documentRequests", id: "r", data: { authorizationLetter: `https://res.cloudinary.com/${cloud}/image/upload/talasys/letters/scanned.pdf` } }], cloud)
  assert.equal(plan.assets[0].resourceType, "image")
})

test("malformed and foreign-cloud references are rejected", () => {
  const plan = planCloudinaryMigration([
    { collection: "documentRequests", id: "a", data: { authorizationLetter: "https://res.cloudinary.com/foreign/raw/upload/talasys/letters/a.pdf" } },
    { collection: "documentRequests", id: "b", data: { authorizationLetter: "https://example.test/not-cloudinary" } },
  ], cloud)
  assert.equal(plan.assets.length, 0)
  assert.equal(plan.rejected.length, 1)
  assert.match(plan.rejected[0].reason, /foreign-cloud/)
})

test("dry-run plans without provider or Firestore mutations", async () => {
  const plan = planCloudinaryMigration([{ collection: "documentRequests", id: "r", data: { gcashScreenshotUrl: image } }], cloud)
  let mutations = 0
  const result = await executeCloudinaryMigration({
    plan, manifest: manifest(),
    cloudinary: { renameToAuthenticated: async () => { mutations++; return { protectedUrl: "" } }, verify: async () => { mutations++; return { authenticatedExists: true, oldPublicUnavailable: true } } },
    firestore: { projectId: "fixture-project", scan: async () => [], updateReferences: async () => { mutations++ } },
  })
  assert.equal(result.planned, 1)
  assert.equal(mutations, 0)
})

test("commit renames once, updates all references, checkpoints, and verifies", async () => {
  const plan = planCloudinaryMigration([
    { collection: "verifications", id: "v", data: { documents: [{ url: image }] } },
    { collection: "documentRequests", id: "r", data: { gcashScreenshotUrl: image } },
  ], cloud)
  let renames = 0; let updates = 0; let saves = 0
  const result = await executeCloudinaryMigration({
    plan, commit: true, manifest: manifest(), saveManifest: async () => { saves++ },
    cloudinary: { renameToAuthenticated: async () => { renames++; return { protectedUrl: image.replace("/upload/", "/authenticated/") } }, verify: async () => ({ authenticatedExists: true, oldPublicUnavailable: true }) },
    firestore: { projectId: "fixture-project", scan: async () => [], updateReferences: async refs => { updates += refs.length } },
  })
  assert.equal(renames, 1)
  assert.equal(updates, 2)
  assert.equal(result.verified, 1)
  assert.ok(saves >= 3)
})

test("resume after Cloudinary success skips rename and completes Firestore", async () => {
  const plan = planCloudinaryMigration([{ collection: "documentRequests", id: "r", data: { authorizationLetter: rawPdf } }], cloud)
  const state = manifest()
  const asset = plan.assets[0]
  state.entries[asset.key] = { ...asset, protectedUrl: rawPdf.replace("/upload/", "/authenticated/"), status: "cloudinary-migrated" }
  let renames = 0; let updates = 0
  const result = await executeCloudinaryMigration({
    plan, commit: true, manifest: state,
    cloudinary: { renameToAuthenticated: async () => { renames++; return { protectedUrl: "" } }, verify: async () => ({ authenticatedExists: true, oldPublicUnavailable: true }) },
    firestore: { projectId: "fixture-project", scan: async () => [], updateReferences: async () => { updates++ } },
  })
  assert.equal(renames, 0)
  assert.equal(updates, 1)
  assert.equal(result.verified, 1)
})

test("verification failure prevents false success and remains resumable", async () => {
  const plan = planCloudinaryMigration([{ collection: "documentRequests", id: "r", data: { gcashScreenshotUrl: image } }], cloud)
  const state = manifest()
  await assert.rejects(() => executeCloudinaryMigration({
    plan, commit: true, manifest: state,
    cloudinary: { renameToAuthenticated: async () => ({ protectedUrl: image.replace("/upload/", "/authenticated/") }), verify: async () => ({ authenticatedExists: true, oldPublicUnavailable: false }) },
    firestore: { projectId: "fixture-project", scan: async () => [], updateReferences: async () => {} },
  }), /failed assets/)
  assert.equal(Object.values(state.entries)[0].status, "firestore-updated")
})
