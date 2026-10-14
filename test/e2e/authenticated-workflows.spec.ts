import { expect, test, type Page } from "@playwright/test"
import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

const projectId = "talasys-e2e"
const password = "Talasys-E2E-Password-2026!"
const identities = {
  viewer: { role: "View Only", allowedRoute: "/admin/residents" },
  verifier: { role: "Verification Only", allowedRoute: "/admin/verifications" },
  processor: { role: "Document Processing", allowedRoute: "/admin/requests" },
  manager: { role: "Resident Management", allowedRoute: "/admin/residents" },
  full: { role: "Full Access", allowedRoute: "/admin/dashboard" },
} as const

async function getIdTokenForUser(email: string): Promise<string> {
  const res = await fetch("http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyB00000000000000000000000000000000", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  if (!res.ok) throw new Error(`Failed to get ID token for ${email}: ${await res.text()}`)
  const data = await res.json()
  return data.idToken
}

test.beforeAll(async () => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed") || initializeApp({ projectId }, "e2e-seed")
  const auth = getAuth(app)
  const db = getFirestore(app)

  // Global system config
  await db.collection("systemConfig").doc("global").set({
    documentTypes: [
      "Barangay Clearance",
      "Certificate of Indigency",
      "Proof of Residency",
      "Funeral Certification",
    ],
    documentFees: {
      "Barangay Clearance": 50,
      "Certificate of Indigency": 0,
      "Proof of Residency": 50,
      "Funeral Certification": 0,
    },
    updatedAt: Date.now(),
  })

  for (const [key, identity] of Object.entries(identities)) {
    const uid = `e2e-${key}`
    const email = `${key}@example.test`
    try { await auth.createUser({ uid, email, password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
    await db.collection("users").doc(uid).set({ name: `E2E ${key}`, email, role: identity.role, status: "Active", isVerified: true, createdAt: Date.now() })
  }
  for (const status of ["Locked", "Deleted"] as const) {
    const key = status.toLowerCase()
    const uid = `e2e-${key}`
    const email = `${key}@example.test`
    try { await auth.createUser({ uid, email, password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
    await db.collection("users").doc(uid).set({ name: `E2E ${status}`, email, role: "Full Access", status, isVerified: true, createdAt: Date.now() })
  }

  // Pending resident for rejection test
  try { await auth.createUser({ uid: "e2e-resident", email: "resident@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-resident").set({ name: "E2E Resident", email: "resident@example.test", role: "resident", status: "Pending", isVerified: false, createdAt: Date.now() })
  await db.collection("verifications").doc("e2e-reject").set({ residentId: "e2e-resident", name: "E2E Resident", email: "resident@example.test", status: "pending", type: "registration", submittedDate: "Today", createdAt: Date.now(), documents: [] })

  // Approval resident for registration approval test
  try { await auth.createUser({ uid: "e2e-approve-resident", email: "approve-resident@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-approve-resident").set({ name: "E2E Approval Resident", email: "approve-resident@example.test", role: "resident", status: "Pending", isVerified: false, createdAt: Date.now() })

  // Managed resident for deactivation test
  await db.collection("users").doc("e2e-managed-resident").set({ name: "E2E Managed Resident", email: "managed@example.test", role: "resident", status: "Active", isVerified: true, statuses: ["Resident"], createdAt: Date.now() })

  // Active resident for UI document request & media viewing
  try { await auth.createUser({ uid: "e2e-active-resident", email: "active-resident@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-active-resident").set({
    name: "E2E Active Resident",
    email: "active-resident@example.test",
    role: "resident",
    status: "Active",
    isVerified: true,
    statuses: ["Resident"],
    accountExpiry: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
    createdAt: Date.now(),
  })

  // Profile-edit resident & verification
  try { await auth.createUser({ uid: "e2e-profile-resident", email: "profile-old@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-profile-resident").set({
    name: "E2E Profile Resident",
    email: "profile-old@example.test",
    role: "resident",
    status: "Active",
    isVerified: true,
    statuses: ["Resident"],
    createdAt: Date.now(),
  })
  await db.collection("verifications").doc("e2e-profile-verif").set({
    residentId: "e2e-profile-resident",
    name: "E2E Profile Resident",
    email: "profile-old@example.test",
    status: "pending",
    type: "profile-edit",
    submittedDate: "Today",
    changes: [
      { field: "Email Address", oldValue: "profile-old@example.test", newValue: "profile-new@example.test" },
      { field: "Full Name", oldValue: "E2E Profile Resident", newValue: "E2E Profile Resident Updated" },
    ],
    createdAt: Date.now(),
    documents: [],
  })

  // Injected failure resident & lock
  try { await auth.createUser({ uid: "e2e-injected-resident", email: "injected-old@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-injected-resident").set({
    name: "E2E Injected Resident",
    email: "injected-old@example.test",
    role: "resident",
    status: "Active",
    isVerified: true,
    statuses: ["Resident"],
    createdAt: Date.now(),
  })
  await db.collection("verifications").doc("e2e-injected-verif").set({
    residentId: "e2e-injected-resident",
    name: "E2E Injected Resident",
    email: "injected-old@example.test",
    status: "pending",
    type: "profile-edit",
    submittedDate: "Today",
    changes: [
      { field: "Email Address", oldValue: "injected-old@example.test", newValue: "injected-new@example.test" },
    ],
    createdAt: Date.now(),
    documents: [],
  })
  await db.collection("identityOperationLocks").doc("e2e-injected-resident").set({
    operationId: "concurrent-blocker",
    attemptId: "other-attempt-id",
    residentId: "e2e-injected-resident",
    status: "reconciliation-required",
    error: "Prior operation failed and requires manual reconciliation.",
    updatedAt: Date.now(),
  })

  // Reactivate resident & verification
  try { await auth.createUser({ uid: "e2e-reactivate-resident", email: "reactivate-resident@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-reactivate-resident").set({
    name: "E2E Reactivate Resident",
    email: "reactivate-resident@example.test",
    role: "resident",
    status: "Expired",
    isVerified: true,
    accountExpiry: new Date(Date.now() - 86400 * 1000).toISOString(),
    createdAt: Date.now(),
  })
  await db.collection("verifications").doc("e2e-reactivate-verif").set({
    residentId: "e2e-reactivate-resident",
    name: "E2E Reactivate Resident",
    email: "reactivate-resident@example.test",
    status: "pending",
    type: "reactivation",
    submittedDate: "Today",
    createdAt: Date.now(),
    documents: [],
  })


  // Protected media request
  const testCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "talasys-test-cloud"
  const receiptUrl = `https://res.cloudinary.com/${testCloudName}/image/authenticated/s--signature--/v1/talasys/receipts/e2e-active-resident/test-receipt.jpg`
  const authLetterUrl = `https://res.cloudinary.com/${testCloudName}/raw/authenticated/s--signature--/v1/talasys/letters/e2e-active-resident/test-letter.pdf`

  await db.collection("documentRequests").doc("e2e-request-media").set({
    residentId: "e2e-active-resident",
    residentName: "E2E Active Resident",
    documentType: "Barangay Clearance",
    purpose: "Employment",
    status: "On Process",
    requestFor: "other",
    requestedByName: "Maria Santos",
    relationship: "parent",
    requestedByContact: "09123456789",
    paymentMethod: "gcash",
    paymentStatus: "pending_verification",
    receiptUrl,
    authorizationLetter: authLetterUrl,
    authorizationLetterUrl: authLetterUrl,
    createdAt: Date.now(),
  })
})

test.afterAll(async () => {
  await Promise.all(getApps().filter(app => app.name === "e2e-seed").map(app => deleteApp(app)))
})

async function login(page: Page, identity: string, expectSuccess = true, expectedUrl: RegExp = /\/admin\/dashboard/) {
  await page.addInitScript(() => localStorage.setItem("adminSecurityDisclaimerShownForever", "true"))
  await page.goto("/auth/login")
  await page.getByLabel("Username or Email").fill(`${identity}@example.test`)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Sign In" }).click()
  if (expectSuccess) await expect(page).toHaveURL(expectedUrl)
}

// ─── Existing 12 Tests ───

for (const [key, identity] of Object.entries(identities)) {
  test(`${identity.role} authenticates with emulator identity and reaches its allowed workspace`, async ({ page }) => {
    await login(page, key)
    await page.goto(identity.allowedRoute)
    await expect(page).toHaveURL(new RegExp(identity.allowedRoute.replaceAll("/", "\\/")))
    await expect(page.locator("body")).toBeVisible()
  })
}

test("specialized roles are redirected away from unrelated direct routes", async ({ page }) => {
  await login(page, "verifier")
  await page.goto("/admin/residents")
  await expect(page).toHaveURL(/\/admin\/dashboard/)
  await page.goto("/admin/verifications")
  await expect(page.getByRole("heading", { name: "New Registrations" })).toBeVisible()
})

test("Verification Only rejection runs through server operation and writes authoritative audit atomically", async ({ page }) => {
  await login(page, "verifier")
  await page.goto("/admin/verifications")
  await page.getByText("E2E Resident", { exact: true }).click()
  await page.getByRole("button", { name: "Reject Request" }).click()
  await page.getByPlaceholder("Enter rejection reason...").fill("E2E evidence does not meet requirements")
  const operationResponse = page.waitForResponse(response => response.url().includes("/api/admin/operations") && response.request().method() === "POST")
  await page.getByRole("button", { name: "Confirm Reject" }).click()
  const response = await operationResponse
  if (!response.ok()) throw new Error(`Rejection operation returned ${response.status()}: ${await response.text()}`)
  await expect(page.getByText("No pending items")).toBeVisible()
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const verification = await db.collection("verifications").doc("e2e-reject").get()
  const audits = await db.collection("activityLogs").where("targetId", "==", "e2e-reject").get()
  expect(verification.data()?.status).toBe("rejected")
  expect(audits.size).toBe(1)
  expect(audits.docs[0].data().authoritative).toBe(true)
})

test("Verification Only approval completes the persisted server workflow", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  await db.collection("verifications").doc("e2e-approve").set({ residentId: "e2e-approve-resident", name: "E2E Approval Resident", email: "approve-resident@example.test", status: "pending", type: "registration", submittedDate: "Today", createdAt: Date.now(), documents: [] })
  await login(page, "verifier")
  await page.goto("/admin/verifications")
  await page.getByText("E2E Approval Resident", { exact: true }).click()
  const operationResponse = page.waitForResponse(response => response.url().includes("/api/admin/verifications/approve") && response.request().method() === "POST")
  await page.getByRole("button", { name: "Approve Request" }).click()
  const response = await operationResponse
  if (!response.ok()) throw new Error(`Approval operation returned ${response.status()}: ${await response.text()}`)
  await expect.poll(async () => (await db.collection("verifications").doc("e2e-approve").get()).data()?.status).toBe("approved")
  expect((await db.collection("users").doc("e2e-approve-resident").get()).data()?.isVerified).toBe(true)
})

test("Resident Management deactivation runs through the typed server operation", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  await login(page, "manager")
  await page.goto("/admin/residents")
  const row = page.getByRole("row").filter({ hasText: "E2E Managed Resident" })
  await row.getByRole("button").nth(1).click()
  await page.getByRole("button", { name: "Deactivate Account" }).click()
  const operationResponse = page.waitForResponse(response => response.url().includes("/api/admin/operations") && response.request().method() === "POST")
  await page.getByRole("button", { name: "Deactivate", exact: true }).click()
  const response = await operationResponse
  if (!response.ok()) throw new Error(`Resident operation returned ${response.status()}: ${await response.text()}`)
  await expect.poll(async () => (await db.collection("users").doc("e2e-managed-resident").get()).data()?.status).toBe("Expired")
})

for (const blocked of ["locked", "deleted"]) {
  test(`${blocked} sessions are rejected and cannot retain an admin workspace`, async ({ page }) => {
    await login(page, blocked, false)
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByText(/locked|deactivated|Authentication service|permission-denied/i)).toBeVisible()
  })
}

test("live role change invalidates the currently open specialized route", async ({ page }) => {
  await login(page, "manager")
  await page.goto("/admin/residents")
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  await getFirestore(app).collection("users").doc("e2e-manager").update({ role: "Verification Only" })
  await expect(page).toHaveURL(/\/admin\/dashboard/)
})

// ─── Additional Authenticated Workflows (Tasks 4 & 5) ───

test("Resident completes a legitimate document request from the actual UI", async ({ page }) => {
  await login(page, "active-resident", true, /\/resident\/dashboard/)
  await page.goto("/resident/request")
  await expect(page.getByRole("heading", { name: "Request Document" })).toBeVisible()

  // Select Certificate of Indigency (Free document)
  await page.getByText("Certificate of Indigency").first().click()
  await expect(page.getByRole("heading", { name: /Certificate of Indigency Request/i })).toBeVisible()

  // Select purpose
  await page.getByRole("combobox").click()
  await page.getByRole("option", { name: "Medical Assistance" }).click()

  // Submit request
  const requestResponse = page.waitForResponse(res => res.url().includes("/api/resident/requests/create") && res.request().method() === "POST")
  await page.getByRole("button", { name: "Continue" }).click()
  const response = await requestResponse
  expect(response.ok()).toBe(true)
  const body = await response.json()
  expect(body.success).toBe(true)

  await expect(page).toHaveURL(/\/resident\/history/)

  // Verify in Firestore
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const userRequests = await db.collection("documentRequests").where("residentId", "==", "e2e-active-resident").where("purpose", "==", "Medical Assistance").get()
  expect(userRequests.empty).toBe(false)
  const createdDoc = userRequests.docs[0].data()
  expect(createdDoc.documentType).toBe("Certificate of Indigency")
  expect(createdDoc.documentFee).toBe(0)
  expect(createdDoc.paymentStatus).toBe("waived")
})

test("Profile-edit approval containing an email change updates both Auth and Firestore", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const auth = getAuth(app)

  await login(page, "verifier")
  await page.goto("/admin/verifications/profile-edits")
  await page.getByText("E2E Profile Resident", { exact: true }).click()

  const operationResponse = page.waitForResponse(response => response.url().includes("/api/admin/verifications/approve") && response.request().method() === "POST")
  await page.getByRole("button", { name: "Approve Request" }).click()
  const response = await operationResponse
  if (!response.ok()) throw new Error(`Profile edit approval returned ${response.status()}: ${await response.text()}`)

  await expect.poll(async () => (await db.collection("verifications").doc("e2e-profile-verif").get()).data()?.status).toBe("approved")
  expect((await db.collection("users").doc("e2e-profile-resident").get()).data()?.email).toBe("profile-new@example.test")
  expect((await auth.getUser("e2e-profile-resident")).email).toBe("profile-new@example.test")
})

test("Injected identity failure produces an error/incomplete state rather than a success message", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  await login(page, "verifier")
  await page.goto("/admin/verifications/profile-edits")
  await page.getByText("E2E Injected Resident", { exact: true }).click()

  const operationResponse = page.waitForResponse(response => response.url().includes("/api/admin/verifications/approve") && response.request().method() === "POST")
  await page.getByRole("button", { name: "Approve Request" }).click()
  const response = await operationResponse

  expect(response.status()).toBe(409)
  const payload = await response.json()
  expect(payload.operationIncomplete || payload.requiresReconciliation).toBe(true)

  await expect(page.getByText(/reconciliation|failed to approve|already being reviewed/i)).toBeVisible()
  await expect(page.getByText("Request approved successfully")).toHaveCount(0)

  const verifDoc = await db.collection("verifications").doc("e2e-injected-verif").get()
  expect(verifDoc.data()?.status).toBe("pending")
})

test("A retry completes safely without duplicate records", async ({ request }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const auth = getAuth(app)

  try { await auth.createUser({ uid: "e2e-retry-resident", email: "retry-resident@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-retry-resident").set({
    name: "E2E Retry Resident",
    email: "retry-resident@example.test",
    role: "resident",
    status: "Pending",
    isVerified: false,
    createdAt: Date.now(),
  })
  await db.collection("verifications").doc("e2e-retry-verif").set({
    residentId: "e2e-retry-resident",
    name: "E2E Retry Resident",
    email: "retry-resident@example.test",
    status: "pending",
    type: "registration",
    submittedDate: "Today",
    createdAt: Date.now(),
    documents: [],
  })

  const verifierToken = await getIdTokenForUser("verifier@example.test")

  const attemptId = "e2e-retry-attempt-1"
  const res1 = await request.post("/api/admin/verifications/approve", {
    headers: { Authorization: `Bearer ${verifierToken}`, "Content-Type": "application/json" },
    data: { verificationId: "e2e-retry-verif", attemptId },
  })
  expect(res1.ok()).toBe(true)

  const auditsBefore = await db.collection("activityLogs").where("targetId", "==", "e2e-retry-resident").get()
  const notifsBefore = await db.collection("notifications").where("targetId", "==", "e2e-retry-resident").get()
  expect(auditsBefore.size).toBe(1)
  expect(notifsBefore.size).toBe(1)

  // Retry with same attemptId
  const res2 = await request.post("/api/admin/verifications/approve", {
    headers: { Authorization: `Bearer ${verifierToken}`, "Content-Type": "application/json" },
    data: { verificationId: "e2e-retry-verif", attemptId },
  })
  expect(res2.ok()).toBe(true)
  const body2 = await res2.json()
  expect(body2.outcome).toBe("completed")

  const auditsAfter = await db.collection("activityLogs").where("targetId", "==", "e2e-retry-resident").get()
  const notifsAfter = await db.collection("notifications").where("targetId", "==", "e2e-retry-resident").get()
  expect(auditsAfter.size).toBe(1)
  expect(notifsAfter.size).toBe(1)
})

test("Verification Only sees only verification navigation/workspace", async ({ page }) => {
  await login(page, "verifier")
  await expect(page.locator("aside nav a[href='/admin/verifications']")).toBeVisible()
  await expect(page.locator("aside nav a[href='/admin/residents']")).toHaveCount(0)
  await expect(page.locator("aside nav a[href='/admin/requests']")).toHaveCount(0)
  await expect(page.locator("aside nav a[href='/admin/generate']")).toHaveCount(0)
  await expect(page.locator("aside nav a[href='/admin/logs']")).toHaveCount(0)
})

test("View Only and unrelated roles cannot mutate identities", async ({ page, request }) => {
  const viewerToken = await getIdTokenForUser("viewer@example.test")
  const processorToken = await getIdTokenForUser("processor@example.test")

  // View Only attempted mutation via API
  const updateRes1 = await request.post("/api/admin/update-resident-email", {
    headers: { Authorization: `Bearer ${viewerToken}`, "Content-Type": "application/json" },
    data: { residentId: "e2e-managed-resident", newEmail: "hacked@example.test" },
  })
  expect(updateRes1.status()).toBe(403)

  const approveRes1 = await request.post("/api/admin/verifications/approve", {
    headers: { Authorization: `Bearer ${viewerToken}`, "Content-Type": "application/json" },
    data: { verificationId: "e2e-reject", attemptId: "viewer-attempt" },
  })
  expect(approveRes1.status()).toBe(403)

  // Document Processing attempted mutation via API
  const updateRes2 = await request.post("/api/admin/update-resident-email", {
    headers: { Authorization: `Bearer ${processorToken}`, "Content-Type": "application/json" },
    data: { residentId: "e2e-managed-resident", newEmail: "hacked@example.test" },
  })
  expect(updateRes2.status()).toBe(403)

  // View Only UI verification: no mutation buttons
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  await db.collection("verifications").doc("e2e-viewer-target").set({
    residentId: "e2e-managed-resident",
    name: "E2E Viewer Target",
    email: "managed@example.test",
    status: "pending",
    type: "registration",
    submittedDate: "Today",
    createdAt: Date.now(),
    documents: [],
  })

  await login(page, "viewer")
  await page.goto("/admin/verifications")
  await page.getByText("E2E Viewer Target", { exact: true }).click()
  await expect(page.getByRole("button", { name: "Approve Request" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Reject Request" })).toHaveCount(0)
})

test("Locked accounts cannot retain mutation access", async ({ request }) => {
  const lockedToken = await getIdTokenForUser("locked@example.test")
  const updateRes = await request.post("/api/admin/update-resident-email", {
    headers: { Authorization: `Bearer ${lockedToken}`, "Content-Type": "application/json" },
    data: { residentId: "e2e-managed-resident", newEmail: "locked-hack@example.test" },
  })
  expect(updateRes.status()).toBe(403)

  const approveRes = await request.post("/api/admin/verifications/approve", {
    headers: { Authorization: `Bearer ${lockedToken}`, "Content-Type": "application/json" },
    data: { verificationId: "e2e-reject", attemptId: "locked-attempt" },
  })
  expect(approveRes.status()).toBe(403)
})

test("Reactivation approval completes successfully and restores account status", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  await login(page, "verifier")
  await page.goto("/admin/verifications/reactivation")
  await page.getByText("E2E Reactivate Resident", { exact: true }).click()
  const operationResponse = page.waitForResponse(response => response.url().includes("/api/admin/verifications/approve") && response.request().method() === "POST")
  await page.getByRole("button", { name: "Approve Request" }).click()
  const response = await operationResponse
  if (!response.ok()) throw new Error(`Reactivation approval returned ${response.status()}: ${await response.text()}`)
  await expect.poll(async () => (await db.collection("verifications").doc("e2e-reactivate-verif").get()).data()?.status).toBe("approved")
  const updatedUser = (await db.collection("users").doc("e2e-reactivate-resident").get()).data()
  expect(updatedUser?.status).toBe("Active")
  expect(updatedUser?.isVerified).toBe(true)
  expect(typeof updatedUser?.accountExpiry).toBe("number")
  expect(updatedUser?.accountExpiry).toBeGreaterThan(Date.now())
})

test("Protected media: authorized owner, admin role, denial, and no raw fallback", async ({ page, request }) => {
  const testCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "talasys-test-cloud"
  const receiptUrl = `https://res.cloudinary.com/${testCloudName}/image/authenticated/s--signature--/v1/talasys/receipts/e2e-active-resident/test-receipt.jpg`
  const authLetterUrl = `https://res.cloudinary.com/${testCloudName}/raw/authenticated/s--signature--/v1/talasys/letters/e2e-active-resident/test-letter.pdf`

  const ownerToken = await getIdTokenForUser("active-resident@example.test")
  const adminToken = await getIdTokenForUser("processor@example.test")
  const unrelatedToken = await getIdTokenForUser("resident@example.test")
  const viewerToken = await getIdTokenForUser("viewer@example.test")
  const lockedToken = await getIdTokenForUser("locked@example.test")

  // 1. Authorized owner access for receiptUrl
  const ownerRes = await request.post("/api/media/view", {
    headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
    data: { mediaUrl: receiptUrl, recordId: "e2e-request-media", recordType: "request" },
  })
  expect(ownerRes.status()).toBe(200)
  const ownerBody = await ownerRes.json()
  expect(ownerBody.authorized).toBe(true)
  expect(ownerBody.deliveryUrl).toMatch(/\/authenticated\/s--[a-zA-Z0-9_-]+--\//)
  expect(ownerBody.deliveryUrl).not.toBe(receiptUrl)

  // 2. Authorized owner access for authorizationLetterUrl
  const letterRes = await request.post("/api/media/view", {
    headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
    data: { mediaUrl: authLetterUrl, recordId: "e2e-request-media", recordType: "request" },
  })
  expect(letterRes.status()).toBe(200)
  const letterBody = await letterRes.json()
  expect(letterBody.authorized).toBe(true)
  expect(letterBody.deliveryUrl).toMatch(/\/authenticated\/s--[a-zA-Z0-9_-]+--\//)

  // 3. Authorized admin access
  const adminRes = await request.post("/api/media/view", {
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    data: { mediaUrl: receiptUrl, recordId: "e2e-request-media", recordType: "request" },
  })
  expect(adminRes.status()).toBe(200)
  const adminBody = await adminRes.json()
  expect(adminBody.authorized).toBe(true)
  expect(adminBody.deliveryUrl).toMatch(/\/authenticated\/s--[a-zA-Z0-9_-]+--\//)

  // 4. Forbidden: Unrelated resident
  const unauthRes = await request.post("/api/media/view", {
    headers: { Authorization: `Bearer ${unrelatedToken}`, "Content-Type": "application/json" },
    data: { mediaUrl: receiptUrl, recordId: "e2e-request-media", recordType: "request" },
  })
  expect(unauthRes.status()).toBe(403)
  const unauthBody = await unauthRes.json()
  expect(unauthBody.deliveryUrl).toBeUndefined()
  expect(JSON.stringify(unauthBody)).not.toContain(receiptUrl)

  // 5. Forbidden: View Only
  const viewerRes = await request.post("/api/media/view", {
    headers: { Authorization: `Bearer ${viewerToken}`, "Content-Type": "application/json" },
    data: { mediaUrl: receiptUrl, recordId: "e2e-request-media", recordType: "request" },
  })
  expect(viewerRes.status()).toBe(403)
  const viewerBody = await viewerRes.json()
  expect(viewerBody.deliveryUrl).toBeUndefined()

  // 6. Forbidden: Locked account
  const lockedRes = await request.post("/api/media/view", {
    headers: { Authorization: `Bearer ${lockedToken}`, "Content-Type": "application/json" },
    data: { mediaUrl: receiptUrl, recordId: "e2e-request-media", recordType: "request" },
  })
  expect(lockedRes.status()).toBe(403)
  const lockedBody = await lockedRes.json()
  expect(lockedBody.deliveryUrl).toBeUndefined()

  // 7. Actual UI execution via resident history modal
  await login(page, "active-resident", true, /\/resident\/dashboard/)
  await page.goto("/resident/history")
  await expect(page.getByRole("heading", { name: "Request History" })).toBeVisible()
  await page.getByRole("button", { name: "Auth Letter" }).first().click()
  await expect(page.getByRole("heading", { name: "Authorization Letter Details" })).toBeVisible()
  await expect(page.getByRole("link", { name: /View PDF/i })).toBeVisible()
})

test("New-data behavior: asset ownership validation and authoritative payment state", async ({ request }) => {
  const residentToken = await getIdTokenForUser("active-resident@example.test")
  const otherResidentId = "e2e-resident"
  const testCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "talasys-test-cloud"

  // Attempt to claim another resident's asset URL
  const stolenAssetUrl = `https://res.cloudinary.com/${testCloudName}/raw/authenticated/s--sig--/v1/talasys/letters/${otherResidentId}/stolen.pdf`
  const stolenRes = await request.post("/api/resident/requests/create", {
    headers: { Authorization: `Bearer ${residentToken}`, "Content-Type": "application/json" },
    data: {
      documentType: "Barangay Clearance",
      purpose: "Employment",
      requestFor: "other",
      requestedByName: "Stolen Person",
      requestedByContact: "09123456789",
      relationship: "parent",
      authorizationLetter: stolenAssetUrl,
      idempotencyKey: "test-idempotency-key-stolen-asset-001",
    },
  })
  expect(stolenRes.status()).toBe(400)
  const stolenBody = await stolenRes.json()
  expect(stolenBody.error).toContain("not an authenticated asset owned by this resident")

  // Client attempts to spoof fee to 0 on paid document
  const spoofFeeRes = await request.post("/api/resident/requests/create", {
    headers: { Authorization: `Bearer ${residentToken}`, "Content-Type": "application/json" },
    data: {
      documentType: "Barangay Clearance",
      purpose: "Employment",
      documentFee: 0,
      paymentMethod: "cash",
      idempotencyKey: "test-idempotency-key-spoof-fee-002",
    },
  })
  expect(spoofFeeRes.status()).toBe(200)
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const createdReq = (await db.collection("documentRequests").doc("req_e2e-active-resident_test-idempotency-key-spoof-fee-002").get()).data()
  // System config fee is 50, so authoritative fee must be 50, not the spoofed 0
  expect(createdReq?.documentFee).toBe(50)
  expect(createdReq?.paymentStatus).toBe("unpaid")
})
