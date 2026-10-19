/**
 * Migrate historical sensitive Cloudinary assets from `upload` to
 * `authenticated`, then update every Firestore reference.
 *
 * Defaults to DRY-RUN. `--commit` is required for mutations. The local manifest
 * is a recovery checkpoint and is intentionally gitignored because it contains
 * sensitive URLs. Production execution is a separate operator action.
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { v2 as cloudinarySdk } from "cloudinary"
import { parseCloudinaryAsset } from "../lib/security/media-auth.ts"
import { loadOperatorEnv } from "./operator-env.ts"

export const CLOUDINARY_MIGRATION_VERSION = "cloudinary-authenticated-v1"
export const CLOUDINARY_COLLECTIONS = ["verifications", "documentRequests", "users", "systemConfig"] as const

export interface FirestoreRecord { collection: string; id: string; data: Record<string, any> }
export interface AssetReference { collection: string; docId: string; path: string; originalUrl: string }
export interface MigrationAsset {
  key: string
  cloudName: string
  publicId: string
  resourceType: "image" | "video" | "raw"
  deliveryType: "upload" | "private" | "authenticated"
  format?: string
  version?: string
  references: AssetReference[]
}
export interface RejectedReference extends AssetReference { reason: string }
export interface MigrationPlan { assets: MigrationAsset[]; rejected: RejectedReference[] }
export interface ManifestEntry extends MigrationAsset {
  protectedUrl: string
  status: "planned" | "intent-recorded" | "cloudinary-migrated" | "provider-completed" | "firestore-updated" | "verified" | "failed"
  failure?: { stage: string; message: string; at: string; attempts: number }
  error?: string // legacy v1 manifests are upgraded in memory
}
export interface MigrationManifest {
  version: string
  projectId: string
  cloudName: string
  updatedAt: string
  entries: Record<string, ManifestEntry>
}
export interface CloudinaryMigrationAdapter {
  renameToAuthenticated(asset: MigrationAsset): Promise<{ protectedUrl: string }>
  resolve?(asset: MigrationAsset): Promise<{ state: "source" | "authenticated" | "ambiguous"; protectedUrl?: string }>
  verify(asset: MigrationAsset, protectedUrl: string): Promise<{ authenticatedExists: boolean; authorizedDeliveryWorks?: boolean; oldPublicUnavailable?: boolean; originals?: Array<{ url: string; status: "unavailable" | "public" | "ambiguous"; httpStatus?: number }> }>
}
export interface FirestoreMigrationAdapter {
  readonly projectId: string
  scan(collection: string, limit: number): Promise<FirestoreRecord[]>
  updateReferences(references: AssetReference[], protectedUrl: string): Promise<void>
}

const directFields: Record<string, string[]> = {
  verifications: ["idPhotoUrl", "selfiePhotoUrl", "proofOfResidencyUrl", "profilePicture", "newProfilePicture"],
  documentRequests: ["receiptUrl", "gcashScreenshotUrl", "authorizationLetterUrl", "authorizationLetter"],
  users: ["idPhotoUrl", "selfiePhotoUrl", "proofOfResidencyUrl", "profilePicture", "photoURL"],
  systemConfig: ["captainSignatureUrl", "secretarySignatureUrl", "officialSignatureUrl"],
}

export const CLOUDINARY_MIGRATION_LIMITS = { maxUrlLength: 4096, maxArrayItems: 100, maxReferencesPerAsset: 500, maxAssets: 10_000 } as const

function collect(record: FirestoreRecord): AssetReference[] {
  const references: AssetReference[] = []
  const add = (path: string, value: unknown) => {
    if (typeof value === "string" && value.includes("res.cloudinary.com")) references.push({ collection: record.collection, docId: record.id, path, originalUrl: value })
  }
  for (const field of directFields[record.collection] || []) add(field, record.data[field])
  if (record.collection === "verifications") {
    if (Array.isArray(record.data.documents)) record.data.documents.slice(0, CLOUDINARY_MIGRATION_LIMITS.maxArrayItems).forEach((item: any, index: number) => add(`documents.${index}.url`, item?.url))
    if (Array.isArray(record.data.changes)) record.data.changes.slice(0, CLOUDINARY_MIGRATION_LIMITS.maxArrayItems).forEach((item: any, index: number) => {
      if (/photo|picture|proof|document|signature/i.test(String(item?.field || ""))) add(`changes.${index}.newValue`, item?.newValue)
    })
  }
  return references
}

function isSensitivePublicId(publicId: string): boolean {
  return ["talasys/proofs/", "talasys/receipts/", "talasys/letters/", "talasys/signatures/", "talasys/residents/"].some(prefix => publicId.startsWith(prefix))
}

export function planCloudinaryMigration(records: FirestoreRecord[], expectedCloudName: string): MigrationPlan {
  const assets = new Map<string, MigrationAsset>()
  const rejected: RejectedReference[] = []
  for (const record of records) {
    for (const reference of collect(record)) {
      if (reference.originalUrl.length > CLOUDINARY_MIGRATION_LIMITS.maxUrlLength) { rejected.push({ ...reference, reason: "url-too-long" }); continue }
      const parsed = parseCloudinaryAsset(reference.originalUrl)
      if (!parsed.cloudName || !parsed.publicId || !reference.originalUrl.startsWith("https://res.cloudinary.com/")) {
        rejected.push({ ...reference, reason: "malformed-cloudinary-url" }); continue
      }
      if (parsed.cloudName !== expectedCloudName) {
        rejected.push({ ...reference, reason: `foreign-cloud:${parsed.cloudName}` }); continue
      }
      if (!isSensitivePublicId(parsed.publicId)) continue // unrelated branding/public assets remain public
      const key = `${parsed.cloudName}:${parsed.resourceType}:${parsed.deliveryType}:${parsed.publicId}`
      const existing = assets.get(key)
      if (existing) {
        if (!existing.references.some(item => item.collection === reference.collection && item.docId === reference.docId && item.path === reference.path)) {
          if (existing.references.length >= CLOUDINARY_MIGRATION_LIMITS.maxReferencesPerAsset) { rejected.push({ ...reference, reason: "asset-reference-limit-exceeded" }); continue }
          existing.references.push(reference)
        }
      } else if (assets.size >= CLOUDINARY_MIGRATION_LIMITS.maxAssets) rejected.push({ ...reference, reason: "asset-limit-exceeded" })
      else assets.set(key, { key, cloudName: parsed.cloudName, publicId: parsed.publicId, resourceType: parsed.resourceType, deliveryType: parsed.deliveryType, format: parsed.format, version: parsed.version, references: [reference] })
    }
  }
  return { assets: [...assets.values()], rejected }
}

export async function executeCloudinaryMigration(options: {
  plan: MigrationPlan
  cloudinary: CloudinaryMigrationAdapter
  firestore: FirestoreMigrationAdapter
  commit?: boolean
  manifest: MigrationManifest
  saveManifest?: (manifest: MigrationManifest) => Promise<void>
}): Promise<{ planned: number; migrated: number; verified: number; failed: number; rejected: number }> {
  if (options.manifest.version !== CLOUDINARY_MIGRATION_VERSION || options.manifest.projectId !== options.firestore.projectId) throw new Error("Manifest version/project identity does not match the migration target")
  for (const [key, entry] of Object.entries(options.manifest.entries)) {
    if (key !== entry.key || entry.cloudName !== options.manifest.cloudName || !Array.isArray(entry.references) || !entry.references.length) throw new Error(`Invalid manifest entry metadata: ${key}`)
  }
  const work = new Map(options.plan.assets.map(asset => [asset.key, asset]))
  for (const entry of Object.values(options.manifest.entries)) if (!work.has(entry.key)) work.set(entry.key, entry)
  const result = { planned: work.size, migrated: 0, verified: 0, failed: 0, rejected: options.plan.rejected.length }
  if (!options.commit) return result
  for (const asset of work.values()) {
    let entry = options.manifest.entries[asset.key]
    if (entry?.status === "verified") { result.verified++; continue }
    try {
      if (entry?.status === "failed") entry.status = entry.protectedUrl ? "cloudinary-migrated" : "planned"
      if (!entry || entry.status === "planned") {
        entry = { ...asset, protectedUrl: entry?.protectedUrl || "", status: "intent-recorded" }
        options.manifest.entries[asset.key] = entry
        await options.saveManifest?.(options.manifest) // durable intent before provider mutation
      }
      if (entry.status === "intent-recorded") {
        let renamed: { protectedUrl: string }
        if (asset.deliveryType === "authenticated") renamed = { protectedUrl: entry.protectedUrl || asset.references[0].originalUrl.replace(`/${asset.deliveryType}/`, "/authenticated/") }
        else if (options.cloudinary.resolve) {
          const resolved = await options.cloudinary.resolve(asset)
          if (resolved.state === "ambiguous") throw new Error("provider state is ambiguous; refusing to repeat rename")
          renamed = resolved.state === "authenticated" && resolved.protectedUrl ? { protectedUrl: resolved.protectedUrl } : await options.cloudinary.renameToAuthenticated(asset)
        } else renamed = await options.cloudinary.renameToAuthenticated(asset)
        entry.protectedUrl = renamed.protectedUrl
        entry.status = "provider-completed"
        delete entry.failure; delete entry.error
        await options.saveManifest?.(options.manifest)
        result.migrated++
      }
      if (entry.status === "cloudinary-migrated" || entry.status === "provider-completed") {
        await options.firestore.updateReferences(entry.references, entry.protectedUrl)
        entry.status = "firestore-updated"
        await options.saveManifest?.(options.manifest)
      }
      const verification = await options.cloudinary.verify(asset, entry.protectedUrl)
      const originals = verification.originals || asset.references.map(reference => ({ url: reference.originalUrl, status: verification.oldPublicUnavailable ? "unavailable" as const : "public" as const }))
      const allOriginalsUnavailable = originals.length > 0 && originals.every(item => item.status === "unavailable")
      if (!verification.authenticatedExists || verification.authorizedDeliveryWorks === false || !allOriginalsUnavailable) {
        throw new Error(`verification failed: authenticatedExists=${verification.authenticatedExists}, authorizedDeliveryWorks=${verification.authorizedDeliveryWorks !== false}, originals=${originals.map(item => `${item.status}:${"httpStatus" in item ? item.httpStatus || "n/a" : "n/a"}`).join(",")}`)
      }
      entry.status = "verified"
      delete entry.failure; delete entry.error
      await options.saveManifest?.(options.manifest)
      result.verified++
    } catch (error) {
      const current = options.manifest.entries[asset.key] || ({ ...asset, protectedUrl: "", status: "planned" } as ManifestEntry)
      const message = error instanceof Error ? error.message : String(error)
      current.failure = { stage: current.status, message, at: new Date().toISOString(), attempts: (current.failure?.attempts || 0) + 1 }
      delete current.error
      options.manifest.entries[asset.key] = current
      await options.saveManifest?.(options.manifest)
      result.failed++
    }
  }
  if (result.failed || result.rejected) throw Object.assign(new Error(`Migration has ${result.failed} failed assets and ${result.rejected} rejected references`), { result })
  return result
}

function cloudinarySignature(params: Record<string, string | number | boolean>, apiSecret: string): string {
  const value = Object.entries(params).filter(([, item]) => item !== "").sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${key}=${item}`).join("&")
  return createHash("sha1").update(value + apiSecret).digest("hex")
}

function protectedUrl(asset: MigrationAsset): string {
  const version = asset.version ? `${asset.version}/` : ""
  const format = asset.format ? `.${asset.format}` : ""
  return `https://res.cloudinary.com/${asset.cloudName}/${asset.resourceType}/authenticated/${version}${asset.publicId}${format}`
}

function createCloudinaryAdapter(cloudName: string, apiKey: string, apiSecret: string): CloudinaryMigrationAdapter {
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")
  cloudinarySdk.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
  const resourceEndpoint = (asset: MigrationAsset, type: string) => {
    const encoded = asset.publicId.split("/").map(encodeURIComponent).join("/")
    return `https://api.cloudinary.com/v1_1/${cloudName}/resources/${asset.resourceType}/${type}/${encoded}`
  }
  const adminState = async (asset: MigrationAsset, type: string) => {
    const response = await requestWithRetry(resourceEndpoint(asset, type), { headers: { Authorization: `Basic ${basic}` } })
    if (response.kind === "response" && response.status >= 200 && response.status < 300) return "exists" as const
    if (response.kind === "response" && response.status === 404) return "missing" as const
    return "ambiguous" as const
  }
  return {
    async resolve(asset) {
      const [source, authenticated] = await Promise.all([adminState(asset, asset.deliveryType), adminState(asset, "authenticated")])
      if (authenticated === "exists" && source === "missing") return { state: "authenticated", protectedUrl: protectedUrl(asset) }
      if (source === "exists" && authenticated === "missing") return { state: "source" }
      return { state: "ambiguous" }
    },
    async renameToAuthenticated(asset) {
      const timestamp = Math.floor(Date.now() / 1000)
      const params = { from_public_id: asset.publicId, to_public_id: asset.publicId, type: asset.deliveryType, to_type: "authenticated", invalidate: true, timestamp }
      const body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])), api_key: apiKey, signature: cloudinarySignature(params, apiSecret) })
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${asset.resourceType}/rename`, { method: "POST", body })
      if (!response.ok) throw new Error(`Cloudinary rename failed (${response.status}): ${await response.text()}`)
      return { protectedUrl: protectedUrl(asset) }
    },
    async verify(asset, newUrl) {
      const authenticatedState = await adminState(asset, "authenticated")
      const signedUrl = cloudinarySdk.url(asset.publicId, { resource_type: asset.resourceType, type: "authenticated", secure: true, sign_url: true, version: asset.version ? Number(String(asset.version).replace(/^v/, "")) : undefined, format: asset.format })
      const authorized = await classifyDelivery(signedUrl)
      const uniqueOriginals = [...new Set(asset.references.map(reference => reference.originalUrl))]
      const originals = await Promise.all(uniqueOriginals.map(async url => ({ url, ...(await classifyDelivery(url)) })))
      return {
        authenticatedExists: authenticatedState === "exists" && newUrl.includes("/authenticated/"),
        authorizedDeliveryWorks: authorized.status === "public",
        originals,
      }
    },
  }
}

type RetryResult = { kind: "response"; status: number } | { kind: "network-error" }

async function requestWithRetry(url: string, init: RequestInit, attempts = 3): Promise<RetryResult> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, cache: "no-store", redirect: "follow" })
      if ((response.status === 429 || response.status >= 500) && attempt < attempts - 1) continue
      return { kind: "response", status: response.status }
    } catch {
      if (attempt === attempts - 1) return { kind: "network-error" }
    }
  }
  return { kind: "network-error" }
}

async function classifyDelivery(url: string): Promise<{ status: "unavailable" | "public" | "ambiguous"; httpStatus?: number }> {
  const result = await requestWithRetry(url, { method: "HEAD" })
  if (result.kind === "network-error") return { status: "ambiguous" }
  if (result.status >= 200 && result.status < 300) return { status: "public", httpStatus: result.status }
  if ([401, 403, 404].includes(result.status)) return { status: "unavailable", httpStatus: result.status }
  return { status: "ambiguous", httpStatus: result.status }
}

function setPath(target: any, path: string, value: string) {
  const parts = path.split(".")
  let current = target
  for (let index = 0; index < parts.length - 1; index++) current = current[Number.isNaN(Number(parts[index])) ? parts[index] : Number(parts[index])]
  const final = parts.at(-1)!
  current[Number.isNaN(Number(final)) ? final : Number(final)] = value
}

function getPath(target: any, path: string) {
  return path.split(".").reduce((value, part) => value?.[Number.isNaN(Number(part)) ? part : Number(part)], target)
}

export async function createFirestoreAdapter(): Promise<FirestoreMigrationAdapter> {
  const [{ cert, getApps, initializeApp, applicationDefault }, { getFirestore, FieldPath }] = await Promise.all([import("firebase-admin/app"), import("firebase-admin/firestore")])
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, "\n")
  if (!projectId) throw new Error("Missing Firebase project ID")
  if (!getApps().length) initializeApp({ projectId, credential: clientEmail && privateKey ? cert({ projectId, clientEmail, privateKey }) : applicationDefault() })
  const db = getFirestore()
  return {
    projectId,
    async scan(collection, limit) {
      const snapshot = await db.collection(collection).orderBy(FieldPath.documentId()).limit(limit).get()
      return snapshot.docs.map(doc => ({ collection, id: doc.id, data: doc.data() }))
    },
    async updateReferences(references, newUrl) {
      const grouped = new Map<string, AssetReference[]>()
      for (const reference of references) grouped.set(`${reference.collection}/${reference.docId}`, [...(grouped.get(`${reference.collection}/${reference.docId}`) || []), reference])
      await db.runTransaction(async transaction => {
        const loaded: Array<{ ref: any; data: Record<string, any>; refs: AssetReference[]; key: string }> = []
        for (const [key, refs] of grouped) {
          const slash = key.indexOf("/"); const collection = key.slice(0, slash); const id = key.slice(slash + 1)
          const ref = db.collection(collection).doc(id); const snapshot = await transaction.get(ref)
          if (!snapshot.exists) throw new Error(`Referenced document disappeared: ${key}`)
          loaded.push({ ref, data: snapshot.data()!, refs, key })
        }
        // Firestore requires every transaction read to happen before the first
        // write. Revalidate each exact path to avoid overwriting a concurrent
        // user/provider update with a stale scan result.
        for (const { ref, data, refs, key } of loaded) {
          for (const item of refs) {
            const current = getPath(data, item.path)
            if (current !== item.originalUrl && current !== newUrl) throw new Error(`Reference changed since scan: ${key}:${item.path}`)
          }
          for (const item of refs) {
            setPath(data, item.path, newUrl)
          }
          transaction.set(ref, data)
        }
      })
    },
  }
}

async function saveManifest(path: string, manifest: MigrationManifest) {
  manifest.updatedAt = new Date().toISOString()
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, JSON.stringify(manifest, null, 2), "utf8")
  await rename(temporary, path)
}

export async function runCloudinaryMigrationCli() {
  loadOperatorEnv()
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY || process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Missing Cloudinary cloud name/API key/API secret")
  const firestore = await createFirestoreAdapter()
  const limitArg = process.argv.indexOf("--limit")
  const limit = Number(limitArg >= 0 ? process.argv[limitArg + 1] : "10000")
  const manifestArg = process.argv.indexOf("--manifest")
  const manifestPath = resolve(manifestArg >= 0 ? process.argv[manifestArg + 1] : ".talasys-migrations/cloudinary-manifest.json")
  const records = (await Promise.all(CLOUDINARY_COLLECTIONS.map(collection => firestore.scan(collection, limit)))).flat()
  const plan = planCloudinaryMigration(records, cloudName)
  let manifest: MigrationManifest = { version: CLOUDINARY_MIGRATION_VERSION, projectId: firestore.projectId, cloudName, updatedAt: new Date().toISOString(), entries: {} }
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")) } catch (error: any) { if (error?.code !== "ENOENT") throw error }
  if (manifest.version !== CLOUDINARY_MIGRATION_VERSION) throw new Error(`Unsupported manifest version: ${manifest.version}`)
  if (manifest.projectId !== firestore.projectId || manifest.cloudName !== cloudName) throw new Error("Manifest project/cloud identity does not match configured targets")
  for (const [key, entry] of Object.entries(manifest.entries || {})) {
    if (entry.key !== key || entry.cloudName !== cloudName || !Array.isArray(entry.references) || !entry.references.length) throw new Error(`Invalid manifest entry metadata: ${key}`)
  }
  console.log(`TALASYS Cloudinary migration | project=${firestore.projectId} | cloud=${cloudName} | mode=${process.argv.includes("--commit") ? "COMMIT" : "DRY-RUN"} | assets=${plan.assets.length} | rejected=${plan.rejected.length}`)
  const result = await executeCloudinaryMigration({ plan, cloudinary: createCloudinaryAdapter(cloudName, apiKey, apiSecret), firestore, commit: process.argv.includes("--commit"), manifest, saveManifest: value => saveManifest(manifestPath, value) })
  console.log(JSON.stringify(result, null, 2))
  return result
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrate-cloudinary-access.ts")) {
  runCloudinaryMigrationCli().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
