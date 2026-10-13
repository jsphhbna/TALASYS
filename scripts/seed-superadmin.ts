/** Initial Super Admin provisioning tool. Not needed for ordinary deployments. */
import { randomUUID } from "node:crypto"
import { stdin, stdout } from "node:process"
import { loadOperatorEnv } from "./operator-env.ts"
import { COLLECTION_ACTIVITY_LOGS, COLLECTION_USERS } from "../lib/constants.ts"

export interface ProvisioningAdapter {
  readonly projectId: string
  findAuthUser(email: string): Promise<{ uid: string; email?: string; displayName?: string } | null>
  createAuthUser(input: { email: string; password: string; displayName: string }): Promise<{ uid: string }>
  updateAuthUser(uid: string, changes: { password?: string; displayName?: string; emailVerified?: boolean }): Promise<void>
  deleteAuthUser(uid: string): Promise<void>
  readProfile(uid: string): Promise<Record<string, unknown> | null>
  recordIntent(operation: Record<string, unknown>): Promise<void>
  finalize(input: { operationId: string; uid: string; profile?: Record<string, unknown>; event: Record<string, unknown> }): Promise<void>
  recordFailure(operationId: string, message: string, compensated: boolean): Promise<void>
}

export interface ProvisioningInput {
  email: string
  password?: string
  name?: string
  promoteExisting?: boolean
  resetPassword?: boolean
  operatorId: string
  operationId?: string
  now?: () => number
}

export async function provisionSuperAdmin(adapter: ProvisioningAdapter, input: ProvisioningInput) {
  const email = input.email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid email address is required")
  if (input.password && input.password.length < 12) throw new Error("Password must contain at least 12 characters")
  const existing = await adapter.findAuthUser(email)
  if (existing && !input.promoteExisting && !input.resetPassword) {
    throw new Error("Account already exists. No changes made. Use --promote-existing and/or --reset-password only after intentional review.")
  }
  if (!existing && !input.password) throw new Error("A password is required when creating a new account")
  if (existing && input.resetPassword && !input.password) throw new Error("A password is required with --reset-password")

  const now = (input.now || Date.now)()
  const operationId = input.operationId || randomUUID()
  const mode = existing ? "modify-existing" : "create-new"
  await adapter.recordIntent({ id: operationId, mode, email, existingUid: existing?.uid || null, promoteExisting: !!input.promoteExisting, resetPassword: !!input.resetPassword, operatorId: input.operatorId, status: "pending", createdAt: now })

  let uid = existing?.uid
  let created = false
  try {
    if (!existing) {
      const name = input.name?.trim() || "Super Admin"
      uid = (await adapter.createAuthUser({ email, password: input.password!, displayName: name })).uid
      created = true
    } else if (input.resetPassword || input.name) {
      await adapter.updateAuthUser(existing.uid, {
        ...(input.resetPassword ? { password: input.password } : {}),
        ...(input.name?.trim() ? { displayName: input.name.trim() } : {}),
        emailVerified: true,
      })
    }

    const oldProfile = uid ? await adapter.readProfile(uid) : null
    let profile: Record<string, unknown> | undefined
    if (created || input.promoteExisting) {
      const name = input.name?.trim() || (oldProfile?.name as string | undefined) || existing?.displayName || "Super Admin"
      const initials = name.split(/\s+/).filter(Boolean).map(part => part[0].toUpperCase()).slice(0, 2).join("") || "SA"
      profile = {
        ...(oldProfile || {}), // preserve all existing profile/contact/address fields
        id: uid,
        email,
        role: "superadmin",
        status: "Active",
        isVerified: true,
        name,
        initials: (oldProfile?.initials as string | undefined) || initials,
        updatedAt: now,
        ...(!oldProfile ? { createdAt: now } : {}),
      }
    }
    await adapter.finalize({
      operationId,
      uid: uid!,
      profile,
      event: { actor: { id: input.operatorId, role: "operator" }, action: created ? "Provisioned Super Admin" : "Modified Super Admin Provisioning", actionType: "Security Administration", targetId: uid, targetEmail: email, changes: { created, promoted: !!input.promoteExisting, passwordReset: !!input.resetPassword, nameChanged: !!input.name }, timestamp: now, createdAt: now },
    })
    return { operationId, uid, mode, created, promoted: !!input.promoteExisting, passwordReset: !!input.resetPassword }
  } catch (error) {
    let compensated = false
    if (created && uid) {
      try { await adapter.deleteAuthUser(uid); compensated = true } catch { /* pending intent remains for reconciliation */ }
    }
    await adapter.recordFailure(operationId, error instanceof Error ? error.message : String(error), compensated).catch(() => {})
    throw Object.assign(new Error(`Provisioning failed; operation ${operationId} requires ${compensated ? "no Auth cleanup" : "reconciliation"}`), { cause: error, operationId, compensated })
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set(argv.filter(value => value.startsWith("--") && !["--email", "--name"].includes(value)))
  const value = (name: string) => { const index = argv.indexOf(`--${name}`); return index >= 0 ? argv[index + 1] : undefined }
  return { email: value("email"), name: value("name"), promoteExisting: flags.has("--promote-existing"), resetPassword: flags.has("--reset-password"), help: flags.has("--help") || flags.has("-h") }
}

async function hiddenPassword(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") throw new Error("Interactive terminal required for hidden password input. Do not pass passwords on the command line.")
  stdout.write(prompt)
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8")
  return new Promise((resolve, reject) => {
    let value = ""
    const cleanup = () => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData); stdout.write("\n") }
    const onData = (chunk: string) => {
      if (chunk === "\u0003") { cleanup(); reject(new Error("Cancelled")); return }
      if (chunk === "\r" || chunk === "\n") { cleanup(); resolve(value); return }
      if (chunk === "\u007f" || chunk === "\b") { value = value.slice(0, -1); return }
      value += chunk
    }
    stdin.on("data", onData)
  })
}

async function createAdapter(): Promise<ProvisioningAdapter> {
  const [{ cert, getApps, initializeApp, applicationDefault }, { getAuth }, { getFirestore }] = await Promise.all([import("firebase-admin/app"), import("firebase-admin/auth"), import("firebase-admin/firestore")])
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, "\n")
  if (!projectId) throw new Error("Missing Firebase project ID")
  if (!getApps().length) initializeApp({ projectId, credential: clientEmail && privateKey ? cert({ projectId, clientEmail, privateKey }) : applicationDefault() })
  const auth = getAuth(); const db = getFirestore()
  return {
    projectId,
    async findAuthUser(email) { try { const user = await auth.getUserByEmail(email); return { uid: user.uid, email: user.email, displayName: user.displayName } } catch (error: any) { if (error?.code === "auth/user-not-found") return null; throw error } },
    async createAuthUser(input) { return auth.createUser({ ...input, emailVerified: true }) },
    async updateAuthUser(uid, changes) { await auth.updateUser(uid, changes) },
    async deleteAuthUser(uid) { await auth.deleteUser(uid) },
    async readProfile(uid) { const snapshot = await db.collection(COLLECTION_USERS).doc(uid).get(); return snapshot.exists ? snapshot.data()! : null },
    async recordIntent(operation) { await db.collection("provisioningOperations").doc(operation.id as string).create(operation) },
    async finalize({ operationId, uid, profile, event }) { const batch = db.batch(); if (profile) batch.set(db.collection(COLLECTION_USERS).doc(uid), profile); batch.create(db.collection(COLLECTION_ACTIVITY_LOGS).doc(), event); batch.update(db.collection("provisioningOperations").doc(operationId), { status: "completed", completedAt: Date.now(), uid }); await batch.commit() },
    async recordFailure(operationId, message, compensated) { await db.collection("provisioningOperations").doc(operationId).update({ status: compensated ? "compensated" : "reconciliation-required", error: message, updatedAt: Date.now() }) },
  }
}

export async function runSeedSuperAdminCli() {
  const args = parseArgs()
  if (args.help || !args.email) {
    console.log("Usage: npm run seed:superadmin -- --email <email> [--name <name>] [--promote-existing] [--reset-password]\nPasswords are prompted without echo. Existing accounts are rejected unless an explicit modify flag is supplied. This bootstrap is unnecessary for ordinary deployments once an operator exists.")
    if (!args.help) process.exitCode = 1
    return
  }
  loadOperatorEnv()
  const needsPassword = args.resetPassword || true // create-new status is discovered after adapter lookup
  const password = needsPassword ? await hiddenPassword("Password (hidden; leave blank when promoting without reset): ") : undefined
  const adapter = await createAdapter()
  console.log(`Target Firebase project: ${adapter.projectId}`)
  const result = await provisionSuperAdmin(adapter, { email: args.email, password: password || undefined, name: args.name, promoteExisting: args.promoteExisting, resetPassword: args.resetPassword, operatorId: process.env.USERNAME || process.env.USER || "local-operator" })
  console.log(JSON.stringify(result, null, 2))
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed-superadmin.ts")) runSeedSuperAdminCli().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
