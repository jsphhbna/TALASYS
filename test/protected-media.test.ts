import test from "node:test"
import assert from "node:assert/strict"
import { canAccessMedia, generateSignedDeliveryUrl, parseCloudinaryAsset, sameCloudinaryAsset } from "../lib/security/media-auth.ts"

const cloud = "example-cloud"
const proof = `https://res.cloudinary.com/${cloud}/image/authenticated/v1/talasys/proofs/resident-id.webp`

test("exact canonical identity rejects substring and foreign-cloud matches", () => {
  assert.equal(sameCloudinaryAsset(proof, proof.replace("/authenticated/", "/upload/")), true)
  assert.equal(sameCloudinaryAsset(proof, proof.replace("resident-id.webp", "resident-id.webp-copy.webp")), false)
  assert.equal(sameCloudinaryAsset(proof, proof.replace(cloud, "foreign-cloud")), false)
})

test("Cloudinary URL structure controls image/raw resource type", () => {
  assert.equal(parseCloudinaryAsset(`https://res.cloudinary.com/${cloud}/image/upload/talasys/proofs/scan.pdf`).resourceType, "image")
  assert.equal(parseCloudinaryAsset(`https://res.cloudinary.com/${cloud}/raw/upload/talasys/letters/scan.pdf`).resourceType, "raw")
})

test("owners and scoped roles are allowed while unrelated, locked, and View Only callers are denied", () => {
  assert.equal(canAccessMedia({ publicId: proof, callerUid: "owner", callerRole: "resident", ownerUid: "owner" }).authorized, true)
  assert.equal(canAccessMedia({ publicId: proof, callerUid: "other", callerRole: "resident", ownerUid: "owner" }).authorized, false)
  assert.equal(canAccessMedia({ publicId: proof, callerUid: "verification", callerRole: "Verification Only", ownerUid: "owner" }).authorized, true)
  assert.equal(canAccessMedia({ publicId: proof.replace("proofs", "receipts"), callerUid: "documents", callerRole: "Document Processing", ownerUid: "owner" }).authorized, true)
  assert.equal(canAccessMedia({ publicId: proof, callerUid: "view", callerRole: "View Only", ownerUid: "owner" }).authorized, false)
  assert.equal(canAccessMedia({ publicId: proof, callerUid: "owner", callerRole: "resident", callerStatus: "Locked", ownerUid: "owner" }).authorized, false)
})

test("official SDK produces authenticated signed URL without false expiry token", () => {
  const result = generateSignedDeliveryUrl(proof, cloud, "fixture-secret")
  assert.match(result.deliveryUrl, /\/image\/authenticated\/s--[^/]+--\/v1\/talasys\/proofs\/resident-id\.webp/)
  assert.equal(result.deliveryUrl.includes("__cld_token__"), false)
  assert.equal(result.expiresAt, null)
})
