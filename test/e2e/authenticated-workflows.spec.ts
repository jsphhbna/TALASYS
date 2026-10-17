import { expect, test, type Page } from "@playwright/test"
import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { mediaRegistryDocumentId } from "../../lib/security/media-auth.ts"
import { normalizeAuditLog } from "../../lib/security/audit-utils.ts"

const projectId = "talasys-e2e"
const password = "Talasys-E2E-Password-2026!"
const testCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "talasys-test-cloud"
const captainSignatureUrl = `https://res.cloudinary.com/${testCloudName}/image/authenticated/s--signature--/v1/talasys/signatures/captain.png`
const claimedRegistrationProofUrl = `https://res.cloudinary.com/${testCloudName}/image/authenticated/v1/talasys/proofs/registration/e2e-claimed-proof.jpg`
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

const testPort = process.env.PLAYWRIGHT_PORT || process.env.PORT || "3000"
const apiBase = `http://127.0.0.1:${testPort}`

test.beforeAll(async () => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed") || initializeApp({ projectId }, "e2e-seed")
  const auth = getAuth(app)
  const db = getFirestore(app)

  // Global system config
  await db.collection("systemConfig").doc("global").set({
    barangayCaptainName: "E2E Captain",
    captainSignatureUrl,
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
  try { await auth.createUser({ uid: "e2e-super", email: "super@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-super").set({ name: "E2E Super Admin", email: "super@example.test", role: "superadmin", status: "Active", isVerified: true, createdAt: Date.now() })
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
    address: "123 Barangay Street, Manila",
    dob: "1990-01-01",
    accountExpiry: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
    createdAt: Date.now(),
  })
  await db.collection("mediaRegistry").doc(mediaRegistryDocumentId(
    testCloudName,
    "image",
    "talasys/proofs/registration/e2e-claimed-proof",
  )).set({
    cloudName: testCloudName,
    resourceType: "image",
    deliveryType: "authenticated",
    publicId: "talasys/proofs/registration/e2e-claimed-proof",
    ownerUid: "e2e-active-resident",
    status: "claimed",
    capabilityHash: null,
    expiresAt: null,
    claimedAt: Date.now(),
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

  // F03 & F04 seeded document requests for production regression verification
  await db.collection("documentRequests").doc("e2e-request-f03-cancelled").set({
    residentId: "e2e-active-resident",
    residentName: "E2E Active Resident",
    documentType: "Barangay Clearance",
    purpose: "Cancelled Test",
    status: "Cancelled",
    requestFor: "self",
    documentFee: 50,
    paymentMethod: "gcash",
    paymentStatus: "unpaid",
    refNumber: "REF-F03-CANCELLED",
    createdAt: Date.now() - 7200000,
  })

  await db.collection("documentRequests").doc("e2e-request-f03-approved").set({
    residentId: "e2e-active-resident",
    residentName: "E2E Active Resident",
    documentType: "Barangay Clearance",
    purpose: "Approved Test",
    status: "Approved",
    requestFor: "self",
    documentFee: 50,
    paymentMethod: "gcash",
    paymentStatus: "unpaid",
    refNumber: "REF-F03-APPROVED",
    createdAt: Date.now() - 3600000,
  })

  await db.collection("documentRequests").doc("e2e-request-f17-live").set({
    residentId: "e2e-active-resident",
    residentName: "E2E Active Resident",
    documentType: "Barangay Clearance",
    purpose: "Live State Consistency Test",
    status: "Approved",
    requestFor: "self",
    documentFee: 75,
    paymentMethod: "gcash",
    paymentStatus: "unpaid",
    refNumber: "REF-F17-LIVE",
    paymentReferenceNumber: "PAY-F17-LIVE",
    createdAt: Date.now() - 2400000,
  })


  await db.collection("documentRequests").doc("e2e-request-f04-zerofee").set({
    residentId: "e2e-active-resident",
    residentName: "E2E Active Resident",
    documentType: "Certificate of Indigency",
    purpose: "Zero Fee Test",
    status: "Awaiting Payment",
    requestFor: "self",
    documentFee: 0,
    paymentMethod: "cash",
    paymentStatus: "unpaid",
    refNumber: "REF-F04-ZEROFEE",
    paymentReferenceNumber: "PAY-F04-ZEROFEE",
    createdAt: Date.now() - 1800000,
  })

  await db.collection("documentRequests").doc("e2e-request-f04-awaiting").set({
    residentId: "e2e-active-resident",
    residentName: "E2E Active Resident",
    documentType: "Proof of Residency",
    purpose: "Awaiting Payment Test",
    status: "Awaiting Payment",
    requestFor: "self",
    documentFee: 50,
    paymentMethod: "cash",
    paymentStatus: "unpaid",
    refNumber: "REF-F04-AWAITING",
    paymentReferenceNumber: "PAY-F04-AWAITING",
    createdAt: Date.now() - 900000,
  })

  // Resubmission lost-response resident & rejected initial registration verification
  try { await auth.createUser({ uid: "e2e-resubmit-resident", email: "resubmit-resident@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-resubmit-resident").set({
    name: "E2E Resubmit Resident",
    firstName: "E2E",
    lastName: "Resubmit",
    email: "resubmit-resident@example.test",
    role: "resident",
    status: "Pending",
    isVerified: false,
    statuses: ["Adult"],
    dateOfBirth: "1995-05-15",
    contactNumber: "09123456789",
    address: "123 Barangay Street",
    hasPendingVerification: false,
    createdAt: Date.now(),
  })
  await db.collection("verifications").doc("e2e-resubmit-rejected").set({
    residentId: "e2e-resubmit-resident",
    name: "E2E Resubmit Resident",
    email: "resubmit-resident@example.test",
    status: "rejected",
    type: "registration",
    rejectionReason: "Initial document unclear. Please upload a clear valid ID.",
    submittedDate: "Today",
    createdAt: Date.now() - 3600000,
    documents: [{
      id: "doc-1",
      name: "Valid Government ID",
      type: "validId",
      url: claimedRegistrationProofUrl,
      status: "Rejected",
      rejectionReason: "Unclear photo",
      uploadDate: "Yesterday",
    }],
  })

  // History denied verification for Milestone E2 history workflow test
  await db.collection("verifications").doc("e2e-history-denied").set({
    residentId: "e2e-history-resident",
    userId: "e2e-history-resident",
    name: "E2E History Denied Resident",
    email: "history-denied@example.test",
    status: "denied",
    type: "registration",
    submittedDate: "Yesterday",
    denialReason: "Fraudulent identification records detected during background check.",
    deniedBy: "E2E Super Admin",
    deniedByUid: "e2e-super",
    deniedAt: Date.now() - 3600000,
    createdAt: Date.now() - 7200000,
    documents: [],
  })
})

test.afterAll(async () => {
  await Promise.all(getApps().filter(app => app.name === "e2e-seed").map(app => deleteApp(app)))
})

test.beforeEach(async ({ page }) => {
  await page.route("https://res.cloudinary.com/**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
    })
  })
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
  await page.getByRole("button", { name: /Reject (Registration|Request)/i }).click()
  await page.getByPlaceholder("Enter rejection reason...").fill("E2E evidence does not meet requirements")
  const operationResponse = page.waitForResponse(response => response.url().includes("/api/admin/operations") && response.request().method() === "POST")
  await page.getByRole("button", { name: /Confirm Reject/i }).click()
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
  await page.getByRole("button", { name: /Approve (Registration|Request)/i }).click()
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
  const db = getFirestore(app)
  try {
    await db.collection("users").doc("e2e-manager").update({ role: "Verification Only" })
    await expect(page).toHaveURL(/\/admin\/dashboard/)
  } finally {
    await db.collection("users").doc("e2e-manager").update({ role: "Resident Management" })
  }
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

  // A genuine pre-registration proof remains viewable through the claimed
  // registry ownership path; the raw protected URL is never returned.
  const claimedProofRes = await request.post("/api/media/view", {
    headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
    data: { mediaUrl: claimedRegistrationProofUrl },
  })
  expect(claimedProofRes.status()).toBe(200)
  const claimedProofBody = await claimedProofRes.json()
  expect(claimedProofBody.authorized).toBe(true)
  expect(claimedProofBody.deliveryUrl).toMatch(/\/authenticated\/s--[a-zA-Z0-9_-]+--\//)
  expect(claimedProofBody.deliveryUrl).not.toBe(claimedRegistrationProofUrl)

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

test("protected official signature uses the media endpoint for allowed roles and never previews the raw URL", async ({ page, request }) => {
  const superToken = await getIdTokenForUser("super@example.test")
  const fullToken = await getIdTokenForUser("full@example.test")
  const viewerToken = await getIdTokenForUser("viewer@example.test")

  for (const token of [superToken, fullToken]) {
    const response = await request.post("/api/media/view", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { mediaUrl: captainSignatureUrl },
    })
    expect(response.status()).toBe(200)
    expect((await response.json()).deliveryUrl).not.toBe(captainSignatureUrl)
  }
  const denied = await request.post("/api/media/view", {
    headers: { Authorization: `Bearer ${viewerToken}`, "Content-Type": "application/json" },
    data: { mediaUrl: captainSignatureUrl },
  })
  expect(denied.status()).toBe(403)

  await login(page, "full")
  const mediaResponse = page.waitForResponse(response => response.url().includes("/api/media/view") && response.request().method() === "POST")
  await page.goto("/admin/generate?requestId=e2e-request-media")
  expect((await mediaResponse).status()).toBe(200)
  const preview = page.getByAltText("Captain Signature")
  await expect(preview).toHaveCount(1)
  await expect(preview).not.toHaveAttribute("src", captainSignatureUrl)
  await expect(preview).toHaveAttribute("src", /\/authenticated\/s--[a-zA-Z0-9_-]+--\//)
})

test("document export waits for protected signatures and fails visibly without marking the request generated", async ({ page }) => {
  await login(page, "full")
  let releaseMedia!: () => void
  let announceMediaRequest!: () => void
  const mediaGate = new Promise<void>(resolve => { releaseMedia = resolve })
  const mediaRequested = new Promise<void>(resolve => { announceMediaRequest = resolve })
  await page.route("**/api/media/view", async route => {
    announceMediaRequest()
    await mediaGate
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Controlled signature service failure" }) })
  })

  await page.goto("/admin/generate?requestId=e2e-request-media")
  await mediaRequested
  const download = page.getByRole("button", { name: "Download PDF" })
  await expect(download).toBeDisabled()
  releaseMedia()
  await expect(download).toBeEnabled()
  await download.click()
  await expect(page.getByRole("region", { name: "Notifications alt+T" }).getByText(/Protected signature unavailable: Controlled signature service failure/i)).toBeVisible()

  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const requestDocument = await getFirestore(app).collection("documentRequests").doc("e2e-request-media").get()
  expect(requestDocument.data()?.hasGenerated).not.toBe(true)
})

test("R13 browser-level lost resubmission response recovery and refresh idempotency", async ({ page }) => {
  // 1. Mock Cloudinary uploads to avoid external network dependencies while returning valid authenticated asset paths
  await page.route(/image\/upload/, async route => {
    const postData = route.request().postData() || ""
    const folderMatch = postData.match(/name="folder"\r?\n\r?\n([^\r\n]+)/)
    const publicIdMatch = postData.match(/name="public_id"\r?\n\r?\n([^\r\n]+)/)
    const folder = folderMatch ? folderMatch[1] : "talasys/proofs"
    const publicId = publicIdMatch ? publicIdMatch[1] : "e2e-resubmit-resident/proof-001"
    const fullPublicId = `${folder}/${publicId}`
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        secure_url: `https://res.cloudinary.com/${testCloudName}/image/authenticated/s--dummy--/${fullPublicId}.jpg`,
        public_id: fullPublicId,
        resource_type: "image",
      }),
    })
  })

  // 2. Intercept registration resubmit: first attempt commits on server but network aborts response (lost response scenario)
  let resubmitAttempts = 0
  let capturedOperationId: string | null = null

  await page.route("**/api/resident/registration/resubmit", async route => {
    resubmitAttempts++
    const body = JSON.parse(route.request().postData() || "{}")
    if (!capturedOperationId) {
      capturedOperationId = body.operationId
    } else {
      // Must replay the identical operationId across retries
      expect(body.operationId).toBe(capturedOperationId)
    }

    if (resubmitAttempts === 1) {
      // Server actually processes and commits the resubmission
      const serverResponse = await route.fetch()
      expect(serverResponse.status()).toBe(200)
      const data = await serverResponse.json()
      expect(data.success).toBe(true)
      expect(data.verificationId).toBeTruthy()

      // Abort connection to simulate network interruption / lost response
      await route.abort("failed")
    } else {
      // Second attempt goes through; server detects pending verification and returns 409 PENDING_VERIFICATION_EXISTS with verificationId
      await route.continue()
    }
  })

  // 3. Login as the rejected resident and navigate to profile
  await login(page, "resubmit-resident", true, /\/resident\/dashboard/)
  await page.goto("/resident/profile")
  await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible()

  // 4. Verify rejection notice and click Upload New Documents
  await expect(page.getByText("Verification Rejected")).toBeVisible()
  await expect(page.getByText(/Initial document unclear/i)).toBeVisible()
  await page.getByRole("button", { name: "Upload New Documents" }).click()

  // 5. Fill reason and select required document
  await expect(page.getByRole("heading", { name: "Request Profile Edit" })).toBeVisible()
  await page.locator("#reason").fill("Resubmitting high resolution valid ID document.")
  await page.locator("#profile-validId").setInputFiles({
    name: "clear-valid-id.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("clear-valid-id-sample-content"),
  })
  await expect(page.getByText("✓ clear-valid-id.jpg")).toBeVisible()

  // 6. Submit first attempt (lost response triggered)
  await page.getByRole("button", { name: "Submit Request" }).click()

  // Expect network error toast; dialog remains open and resubmission attempt preserved in sessionStorage
  await expect(page.getByText(/Network interruption during resubmission/i).first()).toBeVisible()
  expect(resubmitAttempts).toBe(1)

  // 7. Retry submission (second attempt reuses cached attempt and handles 409 authoritative recovery)
  await page.getByRole("button", { name: "Submit Request" }).click()

  // Verify successful recovery toast and dialog closure
  await expect(page.getByText("Registration Resubmitted").first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "Request Profile Edit" })).toBeHidden()
  expect(resubmitAttempts).toBe(2)

  // 8. Authoritative Firestore state verification: exactly ONE pending verification, correct user state & lock
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const pendingVerifs = await db.collection("verifications")
    .where("residentId", "==", "e2e-resubmit-resident")
    .where("status", "==", "pending")
    .get()
  expect(pendingVerifs.size).toBe(1)
  const authoritativeVerifId = pendingVerifs.docs[0].id

  const userDoc = await db.collection("users").doc("e2e-resubmit-resident").get()
  expect(userDoc.data()?.hasPendingVerification).toBe(true)
  expect(userDoc.data()?.pendingVerificationId).toBe(authoritativeVerifId)

  const lockDoc = await db.collection("residentVerificationLocks").doc("e2e-resubmit-resident").get()
  expect(lockDoc.exists).toBe(true)
  expect(lockDoc.data()?.activeVerificationId).toBe(authoritativeVerifId)

  // 9. Browser refresh must not duplicate registration verification or strand state
  await page.reload()
  await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible()
  await expect(page.getByText("Verification Rejected")).toBeHidden()

  const pendingVerifsAfterReload = await db.collection("verifications")
    .where("residentId", "==", "e2e-resubmit-resident")
    .where("status", "==", "pending")
    .get()
  expect(pendingVerifsAfterReload.size).toBe(1)
  expect(pendingVerifsAfterReload.docs[0].id).toBe(authoritativeVerifId)
})

test("F03: Resident payment actions strictly respect lifecycle eligibility across mobile and desktop viewports", async ({ page }) => {
  await login(page, "active-resident", true, /\/resident\/dashboard/)
  await page.goto("/resident/history")
  await expect(page.getByRole("heading", { name: "Request History" })).toBeVisible()

  // Use search input to isolate the F03 seeded requests
  await page.getByPlaceholder(/Search requests/i).fill("REF-F03")

  // 1. Desktop viewport verification (1280x800)
  await page.setViewportSize({ width: 1280, height: 800 })
  const desktopTable = page.locator(".hidden.md\\:block")

  // Desktop table: Cancelled request row must NOT render Pay Now / Receipt / Resubmit
  const desktopCancelledRow = desktopTable.locator("tr", { hasText: "REF-F03-CANCELLED" })
  await expect(desktopCancelledRow).toBeVisible()
  await expect(desktopCancelledRow.getByRole("button", { name: /Pay Now|Receipt|Resubmit/i })).toHaveCount(0)

  // Desktop table: Approved request row MUST render Pay Now button
  const desktopApprovedRow = desktopTable.locator("tr", { hasText: "REF-F03-APPROVED" })
  await expect(desktopApprovedRow).toBeVisible()
  await expect(desktopApprovedRow.getByRole("button", { name: /Pay Now/i })).toBeVisible()

  // 2. Mobile viewport verification (375x667)
  await page.setViewportSize({ width: 375, height: 667 })
  const mobileContainer = page.locator(".md\\:hidden")

  // Mobile card: Cancelled card must NOT render Pay Now / Receipt / Resubmit
  const mobileCancelledCard = mobileContainer.locator("div", { hasText: "REF-F03-CANCELLED" }).first()
  await expect(mobileCancelledCard).toBeVisible()
  await expect(mobileCancelledCard.getByRole("button", { name: /Pay Now|Receipt|Resubmit/i })).toHaveCount(0)

  // Mobile card: Approved card MUST render Pay Now button
  const mobileApprovedCard = mobileContainer.locator("div", { hasText: "REF-F03-APPROVED" }).first()
  await expect(mobileApprovedCard).toBeVisible()
  await expect(mobileApprovedCard.getByRole("button", { name: /Pay Now/i })).toBeVisible()
})

test("F04: Admin payment queue strictly excludes zero-fee requests across queue list and count badge", async ({ page }) => {
  await login(page, "full")
  await page.goto("/admin/requests/payments")
  await expect(page.getByRole("heading", { name: "Payment Process" })).toBeVisible()

  // 1. Zero-fee request must NOT appear in the table
  await expect(page.getByText("PAY-F04-ZEROFEE")).toHaveCount(0)
  await expect(page.getByText("Zero Fee Test")).toHaveCount(0)

  // 2. Legitimate awaiting payment request MUST appear in the table with action button
  const awaitingRow = page.locator("tr", { hasText: "PAY-F04-AWAITING" })
  await expect(awaitingRow).toBeVisible()
  await expect(awaitingRow.getByText("₱50")).toBeVisible()
  await expect(awaitingRow.getByRole("button", { name: "Process Payment" })).toBeVisible()

  // 3. Count badge must reflect only eligible requests (must not include the zero-fee request)
  const countBadge = page.getByText(/Awaiting Payment/i).first()
  await expect(countBadge).toBeVisible()
  const badgeText = await countBadge.textContent()
  expect(badgeText).toBeTruthy()
})

test("F17: Resident payment modal tracks live request updates and disables actions when request becomes paid or deleted", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  await login(page, "active-resident", true, /\/resident\/dashboard/)
  await page.goto("/resident/history")
  await expect(page.getByRole("heading", { name: "Request History" })).toBeVisible()

  // 1. Locate the seeded live test request
  await page.getByPlaceholder(/Search requests/i).fill("REF-F17-LIVE")
  const row = page.locator("tr", { hasText: "REF-F17-LIVE" })
  await expect(row).toBeVisible()

  // 2. Click Pay Now to open the payment modal
  const payButton = row.getByRole("button", { name: /Pay Now/i })
  await expect(payButton).toBeVisible()
  await payButton.click()

  // 3. Modal opens: verify title, amount due, and active GCash tab
  await expect(page.getByRole("heading", { name: "Complete Payment" })).toBeVisible()
  await expect(page.getByText("P75.00")).toBeVisible()
  await page.getByRole("button", { name: "GCash", exact: true }).click()
  const submitButton = page.getByRole("button", { name: "Submit GCash Payment" })
  await expect(submitButton).toBeVisible()
  await expect(submitButton).toBeDisabled() // disabled because ref number is empty

  // Fill in valid GCash reference number
  await page.getByPlaceholder(/13-digit reference number/i).fill("1234567890123")
  await expect(submitButton).toBeEnabled()

  // 4. Concurrently in background: request is confirmed as paid by admin
  await db.collection("documentRequests").doc("e2e-request-f17-live").update({
    paymentStatus: "paid",
    receiptNumber: "REC-2026-F17",
  })

  // 5. Modal re-renders reactively: ineligibility notice appears and submit button is strictly disabled
  await expect(page.getByText(/This request has already been paid and confirmed/i)).toBeVisible()
  await expect(submitButton).toBeDisabled()

  // 6. Concurrently in background: request is deleted
  await db.collection("documentRequests").doc("e2e-request-f17-live").delete()

  // 7. Modal displays graceful Request Unavailable view without allowing stale submission
  await expect(page.getByRole("heading", { name: "Request Unavailable" })).toBeVisible()
  await expect(page.getByText(/This request is no longer accessible or has been removed/i)).toBeVisible()
  const closeButton = page.getByRole("button", { name: "Close", exact: true })
  await expect(closeButton).toBeVisible()
  await closeButton.click()

  // Modal dismisses cleanly
  await expect(page.getByRole("heading", { name: "Request Unavailable" })).toHaveCount(0)
})

test("Milestone E2 Workflow B: Super Admin permanently denies pending registration, resident is soft-deleted, and resident login is blocked", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const auth = getAuth(app)

  // Seed denial resident specifically for this workflow
  try { await auth.createUser({ uid: "e2e-denial-resident", email: "denial-resident@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-denial-resident").set({
    name: "E2E Denial Resident",
    email: "denial-resident@example.test",
    role: "resident",
    status: "Pending",
    isVerified: false,
    hasPendingVerification: true,
    pendingVerificationId: "e2e-denial-verif",
    createdAt: Date.now(),
  })
  await db.collection("verifications").doc("e2e-denial-verif").set({
    residentId: "e2e-denial-resident",
    userId: "e2e-denial-resident",
    name: "E2E Denial Resident",
    email: "denial-resident@example.test",
    status: "pending",
    type: "registration",
    submittedDate: "Today",
    createdAt: Date.now(),
    documents: [],
  })
  await db.collection("residentVerificationLocks").doc("e2e-denial-resident").set({
    residentId: "e2e-denial-resident",
    activeVerificationId: "e2e-denial-verif",
    activeVerificationStatus: "pending",
    createdAt: Date.now(),
  })

  // 1. Super Admin logs in and navigates to verifications
  await login(page, "super", true, /\/superadmin\/dashboard/)
  await page.goto("/admin/verifications")
  await expect(page.getByRole("heading", { name: "New Registrations" })).toBeVisible()

  // 2. Select the denial applicant
  await page.getByText("E2E Denial Resident", { exact: true }).click()

  // 3. Super Admin sees the distinct 'Deny Registration (Permanent)' button
  const denyButton = page.getByRole("button", { name: /Deny Registration \(Permanent\)/i })
  await expect(denyButton).toBeVisible()
  await denyButton.click()

  // 4. Confirmation dialog is presented with consequence warning
  await expect(page.getByText("Deny Resident Registration?")).toBeVisible()
  await expect(page.getByText(/permanently deny the resident's current registration and deactivate their TALASYS account/i)).toBeVisible()

  // 5. Short reason (< 10 chars) keeps submission disabled
  const reasonInput = page.getByPlaceholder(/State the authoritative reason/i)
  await reasonInput.fill("Short")
  const confirmDenyButton = page.getByRole("button", { name: "Permanently Deny Registration" })
  await expect(confirmDenyButton).toBeDisabled()

  // 6. Enter valid authoritative reason and submit
  const denialReason = "Permanent disqualification: Fabricated government identity document detected."
  await reasonInput.fill(denialReason)
  await expect(confirmDenyButton).toBeEnabled()

  const operationPromise = page.waitForResponse(response => response.url().includes("/api/admin/operations") && response.request().method() === "POST")
  await confirmDenyButton.click()
  const opRes = await operationPromise
  expect(opRes.ok()).toBe(true)

  // 7. Verify authoritative database state
  await expect.poll(async () => {
    const user = await db.collection("users").doc("e2e-denial-resident").get()
    return user.data()?.status
  }).toBe("Deleted")

  const finalUser = (await db.collection("users").doc("e2e-denial-resident").get()).data()
  expect(finalUser?.registrationDenied).toBe(true)
  expect(finalUser?.denialReason).toBe(denialReason)
  expect(finalUser?.hasPendingVerification).toBe(false)
  expect(finalUser?.pendingVerificationId).toBe(null)

  const finalVerif = (await db.collection("verifications").doc("e2e-denial-verif").get()).data()
  expect(finalVerif?.status).toBe("denied")
  expect(finalVerif?.denialReason).toBe(denialReason)

  // 8. Resident attempts login: blocked with account deactivation notice
  await page.goto("/auth/login")
  await page.getByLabel("Username or Email").fill("denial-resident@example.test")
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Sign In" }).click()

  await expect(page).toHaveURL(/\/auth\/login/)
  await expect(page.getByText(/deactivated|permission-denied/i)).toBeVisible()
})

test("Milestone E2 Workflow D: Denied registration remains visible in verification history with reason and responsible administrator", async ({ page }) => {
  await login(page, "super", true, /\/superadmin\/dashboard/)
  await page.goto("/admin/verifications/history")
  await expect(page.getByRole("heading", { name: "Verification History" })).toBeVisible()

  // Verify Total Denied KPI card is rendered
  await expect(page.getByText("Total Denied")).toBeVisible()

  // Verify Common Rejection & Denial Reasons card is rendered
  await expect(page.getByText(/Common Rejection & Denial Reasons/i)).toBeVisible()

  // Click current month to expand entries
  const currentMonthName = new Date().toLocaleString("en-US", { month: "short" })
  const monthButton = page.locator("button", { hasText: currentMonthName }).first()
  if (await monthButton.isVisible()) {
    await monthButton.click()
  }

  // The denied record is visible in the breakdown
  await expect(page.getByText(/Permanently Denied|Denied/i).first()).toBeVisible()
})

test("Milestone E02: Active open resident session is authoritatively revoked in real-time when registration is denied", async ({ browser }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed") || initializeApp({ projectId }, "e2e-seed")
  const auth = getAuth(app)
  const db = getFirestore(app)

  const liveUid = "e2e-live-revoked-resident"
  const liveEmail = "live-revoked@example.test"
  const liveVerifId = "e2e-live-revoked-verif"

  // 1. Create a legitimate Pending resident with a verified email
  try {
    await auth.createUser({ uid: liveUid, email: liveEmail, password, emailVerified: true })
  } catch (error: any) {
    if (error.code !== "auth/uid-already-exists") throw error
  }

  await db.collection("users").doc(liveUid).set({
    name: "E2E Live Revoked Resident",
    email: liveEmail,
    role: "resident",
    status: "Pending",
    isVerified: false,
    hasPendingVerification: true,
    pendingVerificationId: liveVerifId,
    createdAt: Date.now(),
  })

  await db.collection("verifications").doc(liveVerifId).set({
    residentId: liveUid,
    userId: liveUid,
    name: "E2E Live Revoked Resident",
    email: liveEmail,
    status: "pending",
    type: "registration",
    submittedDate: "Today",
    createdAt: Date.now(),
    documents: [],
  })

  await db.collection("residentVerificationLocks").doc(liveUid).set({
    residentId: liveUid,
    activeVerificationId: liveVerifId,
    activeVerificationStatus: "pending",
    createdAt: Date.now(),
  })

  // 2. Open the resident's authenticated application session
  const residentContext = await browser.newContext()
  const residentPage = await residentContext.newPage()
  await residentPage.goto("/auth/login")
  await residentPage.getByLabel("Username or Email").fill(liveEmail)
  await residentPage.locator("#password").fill(password)
  await residentPage.getByRole("button", { name: "Sign In" }).click()

  // 3. Confirm the session is active in resident workspace
  await expect(residentPage).toHaveURL(/\/resident\/dashboard/)
  await expect(residentPage.locator("body")).toBeVisible()

  // 4. In another authorized session, Super Admin permanently denies the registration via server-authoritative route
  const superIdToken = await getIdTokenForUser("super@example.test")
  const denyReason = "Fabricated government ID proof detected during security audit."
  const denyRes = await fetch(`${apiBase}/api/admin/operations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${superIdToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "verification.denyRegistration",
      operationId: `op-live-deny-${Date.now()}`,
      targetId: liveVerifId,
      payload: { reason: denyReason },
    }),
  })
  expect(denyRes.ok).toBe(true)

  // 5 & 6. Live session is revoked in real-time, redirecting to login page
  await expect(residentPage).toHaveURL(/\/auth\/login/, { timeout: 15000 })

  // 7. Verify protected Resident routes are inaccessible
  await residentPage.goto("/resident/dashboard")
  await expect(residentPage).toHaveURL(/\/auth\/login/)
  await residentPage.goto("/resident/history")
  await expect(residentPage).toHaveURL(/\/auth\/login/)

  // 8. Verify no stale privileged UI remains interactive
  await expect(residentPage.getByRole("button", { name: "Sign In" })).toBeVisible()

  // 9 & 10. Attempt login: rejected with truthful explanation
  await residentPage.getByLabel("Username or Email").fill(liveEmail)
  await residentPage.locator("#password").fill(password)
  await residentPage.getByRole("button", { name: "Sign In" }).click()
  await expect(residentPage).toHaveURL(/\/auth\/login/)
  await expect(residentPage.getByText(/permanently denied|deactivated|permission-denied/i)).toBeVisible()

  await residentContext.close()
})

// ─── Milestone 9: P01–P07 End-to-End & Responsive Acceptance Tests ───

test("Milestone 9 - P01 & P07: Resident representation request with distinct beneficiary details renders without clipping across viewports (360x800, 390x844, 768x1024, 1280x800, 1440x900)", async ({ page }) => {
  await login(page, "active-resident", true, /\/resident\/dashboard/)

  const viewports = [
    { width: 360, height: 800, name: "mobile-small" },
    { width: 390, height: 844, name: "mobile-standard" },
    { width: 768, height: 1024, name: "tablet" },
    { width: 1280, height: 800, name: "laptop" },
    { width: 1440, height: 900, name: "desktop" },
  ]

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto("/resident/request")
    await expect(page.getByRole("heading", { name: "Request Document" })).toBeVisible()

    // Canonical catalog includes Barangay Clearance
    const clearanceCard = page.locator("[role='button']", { hasText: "Barangay Clearance" }).first()
    await expect(clearanceCard).toBeVisible()

    // Click to open request modal
    await clearanceCard.click()
    await expect(page.getByRole("heading", { name: /Barangay Clearance Request/i })).toBeVisible()

    // Toggle to on-behalf-of representation radio
    await page.getByText("For someone else").click()

    // Beneficiary fields are visible without clipping
    const nameInput = page.getByPlaceholder("Enter full name")
    const contactInput = page.getByPlaceholder("Enter contact number")
    const addressInput = page.getByPlaceholder("Enter the represented person's address")
    const ageInput = page.getByPlaceholder("Enter the represented person's age")

    await expect(nameInput).toBeVisible()
    await expect(contactInput).toBeVisible()
    await expect(addressInput).toBeVisible()
    await expect(ageInput).toBeVisible()

    // Fill beneficiary details
    await nameInput.fill("Pedro Beneficiary")
    await contactInput.fill("09998887777")
    await addressInput.fill("456 Pedro St., Manila")
    await ageInput.fill("28")

    // Values are held cleanly without unexpected resets
    await expect(nameInput).toHaveValue("Pedro Beneficiary")
    await expect(addressInput).toHaveValue("456 Pedro St., Manila")
    await expect(ageInput).toHaveValue("28")

    // Close modal cleanly for next viewport iteration
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("heading", { name: /Barangay Clearance Request/i })).toHaveCount(0)
  }
})

test("Milestone 9 - P01 & P05: Admin generation separates beneficiary identity and preserves first-generation timestamp on reprint", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  const originalTimestamp = 1727481600000 // Sept 28, 2024
  const reqId = "e2e-req-p01-p05-verify"
  const reqDocRef = db.collection("documentRequests").doc(reqId)

  try {
    // Seed a represented request that was already confirmed and generated once on Sept 28
    await reqDocRef.set({
      id: reqId,
      residentId: "e2e-active-resident",
      residentName: "Maria Clara Santos",
      documentType: "Barangay Clearance",
      purpose: "Employment",
      requestFor: "other",
      requestedByName: "Pedro Penduko",
      relationship: "Brother",
      requestedByContact: "09998887777",
      representedAddress: "456 Pedro St., Manila",
      representedAge: 28,
      status: "Approved",
      paymentStatus: "paid",
      beneficiaryReviewStatus: "confirmed",
      beneficiaryConfirmedBy: "E2E Staff",
      beneficiaryConfirmedAt: originalTimestamp,
      confirmedBeneficiaryAddress: "456 Pedro St., Manila",
      confirmedBeneficiaryAge: 28,
      hasGenerated: true,
      generatedAt: originalTimestamp,
      createdAt: originalTimestamp - 3600000,
    })

    // Log in as Full Access admin
    await login(page, "full")
    await page.goto(`/admin/generate?requestId=${reqId}`)
    await expect(page.getByRole("heading", { name: "Generate Documents" })).toBeVisible()

    // 1. P01: Admin Review Banner displays correct separation of identities
    await expect(page.getByText(/Representation Request:/i)).toBeVisible()
    await expect(page.getByText("Pedro Penduko").first()).toBeVisible()
    await expect(page.getByText("PEDRO PENDUKO").first()).toBeVisible()

    // 2. Beneficiary address and age inputs match Pedro's data, NOT Maria's data
    const beneficiaryAddress = page.getByPlaceholder("Enter verified beneficiary address...")
    await expect(beneficiaryAddress).toBeVisible()
    await expect(beneficiaryAddress).toHaveValue("456 Pedro St., Manila")

    const beneficiaryAge = page.getByPlaceholder("Beneficiary age...")
    await expect(beneficiaryAge).toBeVisible()
    await expect(beneficiaryAge).toHaveValue("28")

    // 3. Document preview contains Pedro's details, not Maria's
    const preview = page.locator("[contenteditable]").first()
    await expect(preview).toBeVisible()
    const previewText = await preview.textContent()
    expect(previewText).toContain("PEDRO PENDUKO")
    expect(previewText).toContain("456 Pedro St., Manila")
    expect(previewText).not.toContain("123 Barangay Street")

    // 4. P05: Trigger reprint via server operation and verify original timestamp preservation
    const adminIdToken = await getIdTokenForUser("full@example.test")
    const reprintRes = await fetch(`${apiBase}/api/admin/operations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminIdToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation: "request.markGenerated",
        operationId: `op-reprint-${Date.now()}`,
        targetId: reqId,
        payload: {},
      }),
    })
    expect(reprintRes.ok).toBe(true)

    // Verify in Firestore: generatedAt MUST remain Sept 28, 2024
    const updatedReq = (await reqDocRef.get()).data()
    expect(updatedReq?.generatedAt).toBe(originalTimestamp)
    expect(updatedReq?.reprintCount).toBe(1)
    expect(updatedReq?.lastReprintedAt).toBeGreaterThan(originalTimestamp)
  } finally {
    // F05: Ensure fixture isolation teardown
    await reqDocRef.delete().catch(() => {})
  }
})

test("Milestone 9 - P02 & P06: Super Admin config handles disabling all document types and protects unsaved branding/template edits from Firestore snapshot overwrites", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  // Capture full authoritative initial config snapshot for test isolation hygiene (R07)
  const initialConfigSnapshot = (await db.collection("systemConfig").doc("global").get()).data()

  try {
    await login(page, "super", true, /\/superadmin\/dashboard/)
    await page.goto("/superadmin/config")
    await expect(page.getByRole("heading", { name: "System Configuration" })).toBeVisible()

    // 1. P02: Navigate to Document Types tab and disable all enabled types
    await page.getByRole("button", { name: "Document Types" }).click()
    const disableButtons = page.getByRole("button", { name: "Disable" })
    await disableButtons.first().waitFor({ state: "visible" })
    while ((await disableButtons.count()) > 0) {
      await disableButtons.first().click()
    }

    // Confirm all types disabled in UI and unsaved changes badge is active
    await expect(page.getByText("0 of 10 document types enabled")).toBeVisible()
    await expect(page.getByText("● Unsaved Changes")).toBeVisible()

    // 2. P06: Navigate to Branding tab and edit a field locally
    await page.getByRole("button", { name: "Branding" }).click()
    const brgyInput = page.getByPlaceholder("Barangay Sample")
    await brgyInput.fill("Barangay San Nicolas Local Edit")

    // 3. Concurrently simulate remote Firestore update to an unrelated field (contactNumber)
    await db.collection("systemConfig").doc("global").update({
      contactNumber: "02-8888-7777",
    })

    // 4. Conflict detection: banner appears, but local unsaved edit is NOT overwritten
    await expect(page.getByText(/Server configuration changed in the background/i)).toBeVisible()
    await expect(brgyInput).toHaveValue("Barangay San Nicolas Local Edit")

    // 5. Save all changes
    await page.getByRole("button", { name: "Save All Changes" }).click()
    await page.getByRole("button", { name: "Save Changes" }).click()
    await expect(page.getByText("Changes saved").first()).toBeVisible({ timeout: 10000 })

    // 6. Verify Firestore state: empty documentTypes [] is persisted and branding edit persisted,
    // and remote contactNumber update was safely merged without being lost (R03)
    const finalConfig = (await db.collection("systemConfig").doc("global").get()).data()
    expect(finalConfig?.documentTypes).toEqual([])
    expect(finalConfig?.barangayName).toBe("Barangay San Nicolas Local Edit")
    expect(finalConfig?.contactNumber).toBe("02-8888-7777")
  } finally {
    // R07 Isolation: Restore exact snapshot in finally block, never arbitrary partial enablement
    if (initialConfigSnapshot) {
      await db.collection("systemConfig").doc("global").set(initialConfigSnapshot)
      const restored = (await db.collection("systemConfig").doc("global").get()).data()
      expect(restored?.documentTypes).toEqual(initialConfigSnapshot.documentTypes)
    }
  }
})

// ─── Milestone 7: R01–R07 End-to-End Production Regressions & Defect Detection ───

test("R07 Scenario A & B: Resident representation submission, admin confirmation, preview, and PDF generation", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  // 1. Submit represented-person request through production API
  const residentIdToken = await getIdTokenForUser("active-resident@example.test")
  const idempotencyKey = `r07-rep-${Date.now()}`
  const mediaDocId = mediaRegistryDocumentId(
    testCloudName,
    "image",
    "talasys/letters/e2e-active-resident/auth-letter",
  )
  const mediaDocRef = db.collection("mediaRegistry").doc(mediaDocId)

  // Seed authorized letter asset in media registry for representation requirement
  const authLetterUrl = `https://res.cloudinary.com/${testCloudName}/image/authenticated/s--authletter--/v1/talasys/letters/e2e-active-resident/auth-letter.jpg`
  await mediaDocRef.set({
    cloudName: testCloudName,
    resourceType: "image",
    deliveryType: "authenticated",
    publicId: "talasys/letters/e2e-active-resident/auth-letter",
    ownerUid: "e2e-active-resident",
    status: "claimed",
    capabilityHash: null,
    expiresAt: null,
    claimedAt: Date.now(),
  })

  let reqDocRef: any = null

  try {
    const submitRes = await fetch(`${apiBase}/api/resident/requests/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${residentIdToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        documentType: "Barangay Clearance",
        purpose: "Scholarship",
        requestFor: "other",
        requestedByName: "Elena Santos Represented",
        requestedByContact: "09123456789",
        relationship: "Daughter",
        authorizationLetter: authLetterUrl,
        representedAddress: "Block 10 Lot 12, Barangay Compound",
        representedAge: 19,
        paymentMethod: "cash",
        idempotencyKey,
      }),
    })
    expect(submitRes.ok).toBe(true)

    // Verify in Firestore that representation details are persisted
    const residentDoc = (await db.collection("users").where("email", "==", "active-resident@example.test").get()).docs[0]
    const residentUid = residentDoc.id
    reqDocRef = db.collection("documentRequests").doc(`req_${residentUid}_${idempotencyKey}`)
    const reqDoc = await reqDocRef.get()
    expect(reqDoc.exists).toBe(true)
    const reqData = reqDoc.data()!
    expect(reqData.requestFor).toBe("other")
    expect(reqData.requestedByName).toBe("Elena Santos Represented")
    expect(reqData.representedAddress).toBe("Block 10 Lot 12, Barangay Compound")
    expect(reqData.representedAge).toBe(19)

    // Transition request to Approved so official document can be generated
    await reqDocRef.update({
      status: "Approved",
      paymentStatus: "paid",
    })

    // 2. Admin logs in and opens Generator for this request
    await login(page, "full")
    await page.goto(`/admin/generate?requestId=${reqDoc.id}`)
    await expect(page.getByRole("heading", { name: "Generate Documents" })).toBeVisible()

    // 3. Inspect truthful review badge: shows "Provided (Unreviewed)", not "Verified" (R05)
    await expect(page.getByText("Provided (Unreviewed)").first()).toBeVisible()
    const addrInput = page.getByPlaceholder("Enter verified beneficiary address...")
    await expect(addrInput).toHaveValue("Block 10 Lot 12, Barangay Compound")

    // 4. Admin clicks "Confirm Details" to persistently confirm beneficiary (R06)
    await page.getByRole("button", { name: "Confirm Details" }).click()
    await expect(page.getByText(/Beneficiary details confirmed/i)).toBeVisible()
    await expect(page.getByText("✓ Confirmed by Staff").first()).toBeVisible()

    // Verify Firestore has confirmed issuance details persisted
    const confirmedDoc = (await reqDocRef.get()).data()!
    expect(confirmedDoc.beneficiaryReviewStatus).toBe("confirmed")
    expect(confirmedDoc.confirmedBeneficiaryAddress).toBe("Block 10 Lot 12, Barangay Compound")
    expect(confirmedDoc.confirmedBeneficiaryAge).toBe(19)

    // 5. Verify Document Preview: multi-paragraph structure, no unresolved tokens, Elena's address (R01, R05, R06)
    const preview = page.locator("[contenteditable]").first()
    await expect(preview).toBeVisible()
    const previewText = await preview.textContent()
    expect(previewText).toContain("ELENA SANTOS REPRESENTED")
    expect(previewText).toContain("Block 10 Lot 12, Barangay Compound")
    expect(previewText).not.toContain("{{")

    // 6. F03 Verification: Invalidate badge when editing address
    await addrInput.fill("Block 10 Lot 99 Edited Address")
    await expect(page.getByText("Modified — Requires Reconfirmation").first()).toBeVisible()

    // Attempting issuance without reconfirmation is blocked
    await page.getByRole("button", { name: "Download PDF" }).click()
    await expect(page.getByText(/Beneficiary details were edited and require reconfirmation/i)).toBeVisible()

    // Revert back to confirmed address: badge restores to confirmed
    await addrInput.fill("Block 10 Lot 12, Barangay Compound")
    await expect(page.getByText("✓ Confirmed by Staff").first()).toBeVisible()

    // 7. F06 Verification: Exercise actual Download PDF button, capture browser download event
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download PDF" }).click()
    const download = await downloadPromise

    // Verify suggested filename
    expect(download.suggestedFilename()).toContain("Elena_Santos_Represented.pdf")

    // Read download stream and verify valid PDF magic bytes '%PDF-' (F06)
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    const pdfBuffer = Buffer.concat(chunks)
    expect(pdfBuffer.length).toBeGreaterThan(1000)
    expect(pdfBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-")

    // Verify success toast
    await expect(page.getByText("Document downloaded successfully.")).toBeVisible()

    // Verify authoritative Firestore state reflects issuance snapshot (F02, F06)
    const issuedDoc = (await reqDocRef.get()).data()!
    expect(issuedDoc.hasGenerated).toBe(true)
    expect(typeof issuedDoc.generatedAt).toBe("number")
    expect(issuedDoc.issuanceBeneficiaryAddress).toBe("Block 10 Lot 12, Barangay Compound")
    expect(issuedDoc.issuanceBeneficiaryAge).toBe(19)
    expect(issuedDoc.issuanceBeneficiaryName).toBe("Elena Santos Represented")
  } finally {
    // F05 Teardown: Clean up both media registry and document requests
    await mediaDocRef.delete().catch(() => {})
    if (reqDocRef) {
      await reqDocRef.delete().catch(() => {})
    }
  }
})

test("F06 Scenario: PDF download partial server failure provides truthful warning and preserves download", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  const reqId = `e2e-partial-fail-${Date.now()}`
  const reqDocRef = db.collection("documentRequests").doc(reqId)

  try {
    await reqDocRef.set({
      id: reqId,
      residentId: "e2e-active-resident",
      residentName: "Maria Clara Santos",
      documentType: "Barangay Clearance",
      purpose: "Employment",
      requestFor: "myself",
      status: "Approved",
      paymentStatus: "paid",
      hasGenerated: false,
      createdAt: Date.now(),
    })

    await login(page, "full")
    await page.goto(`/admin/generate?requestId=${reqId}`)
    await expect(page.getByRole("heading", { name: "Generate Documents" })).toBeVisible()

    const preview = page.locator("[contenteditable]").first()
    await expect(preview).toBeVisible()
    await expect(preview).toContainText("E2E ACTIVE RESIDENT")

    // Intercept /api/admin/operations to simulate server failure on request.markGenerated
    await page.route("**/api/admin/operations", async route => {
      const postData = route.request().postDataJSON()
      if (postData?.operation === "request.markGenerated") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Simulated database connection failure" }),
        })
      } else {
        await route.continue()
      }
    })

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download PDF" }).click()
    const download = await downloadPromise

    // PDF was downloaded successfully
    expect(download.suggestedFilename()).toContain(".pdf")

    // Truthful warning toast is shown explaining the partial outcome
    await expect(page.getByText(/PDF was downloaded to your device, but recording official issuance in the database failed/i)).toBeVisible({ timeout: 10000 })

    // User is NOT navigated away, allowing retry or manual action
    expect(page.url()).toContain("/admin/generate")
  } finally {
    await page.unroute("**/api/admin/operations").catch(() => {})
    await reqDocRef.delete().catch(() => {})
  }
})

test("R07 Scenario C: Print workflow pop-up preparation and generation status update", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  const printReqId = `e2e-req-print-${Date.now()}`
  const printDocRef = db.collection("documentRequests").doc(printReqId)

  try {
    await printDocRef.set({
      id: printReqId,
      residentId: "e2e-active-resident",
      residentName: "Maria Clara Santos",
      documentType: "Barangay Clearance",
      purpose: "Job Application",
      requestFor: "myself",
      status: "Approved",
      paymentStatus: "paid",
      hasGenerated: false,
      createdAt: Date.now(),
    })

    await login(page, "full")
    await page.goto(`/admin/generate?requestId=${printReqId}`)
    await expect(page.getByRole("heading", { name: "Generate Documents" })).toBeVisible()

    // 1. Verify pop-up blocked handling: when window.open returns null, user receives informative error toast (R07 C)
    await page.evaluate(() => {
      window.open = () => null
    })
    await page.getByRole("button", { name: "Print Document" }).click()
    await expect(page.getByText(/Pop-up window was blocked by your browser/i)).toBeVisible({ timeout: 10000 })

    // 2. Verify print preparation success when pop-up is allowed:
    await page.evaluate(() => {
      window.open = () => ({
        document: {
          write: () => {},
          close: () => {},
        },
      } as any)
    })
    await page.getByRole("button", { name: "Print Document" }).click()

    // Wait for success toast notification
    await expect(page.getByText(/Document printed successfully/i)).toBeVisible({ timeout: 10000 })

    // Verify in Firestore that hasGenerated is true and generatedAt is recorded (P05)
    const updatedReq = (await printDocRef.get()).data()!
    expect(updatedReq.hasGenerated).toBe(true)
    expect(typeof updatedReq.generatedAt).toBe("number")
  } finally {
    // F05 Teardown: Clean up print request record
    await printDocRef.delete().catch(() => {})
  }
})

test("R07 Scenario D: Concurrent configuration conflict rejection with HTTP 409", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const initialConfig = (await db.collection("systemConfig").doc("global").get()).data()

  try {
    await login(page, "super", true, /\/superadmin\/dashboard/)
    await page.goto("/superadmin/config")
    await expect(page.getByRole("heading", { name: "System Configuration" })).toBeVisible()

    // Admin edits contactNumber locally
    await page.getByRole("button", { name: "Branding" }).click()
    const contactInput = page.getByPlaceholder("(02) 8123-4567")
    await contactInput.fill("02-1111-2222")

    // Another admin updates the same field remotely
    await db.collection("systemConfig").doc("global").update({
      contactNumber: "02-9999-8888",
      version: 99,
    })

    // Admin attempts to save
    await page.getByRole("button", { name: "Save All Changes" }).click()
    await page.getByRole("button", { name: "Save Changes" }).click()

    // 409 Conflict message appears and local draft is preserved (R03)
    await expect(page.getByText(/Configuration conflict/i)).toBeVisible({ timeout: 10000 })
    await expect(contactInput).toHaveValue("02-1111-2222")

    // Server state remains the newer remote update
    const serverConfig = (await db.collection("systemConfig").doc("global").get()).data()!
    expect(serverConfig.contactNumber).toBe("02-9999-8888")
  } finally {
    if (initialConfig) {
      await db.collection("systemConfig").doc("global").set(initialConfig)
    }
  }
})

test("R07 Scenario E: Local configuration edit does not trigger false external conflict warning", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const initialConfig = (await db.collection("systemConfig").doc("global").get()).data()

  try {
    await login(page, "super", true, /\/superadmin\/dashboard/)
    await page.goto("/superadmin/config")
    await expect(page.getByRole("heading", { name: "System Configuration" })).toBeVisible()

    // Admin edits barangayName locally
    await page.getByRole("button", { name: "Branding" }).click()
    const brgyInput = page.getByPlaceholder("Barangay Sample")
    await brgyInput.fill("Barangay San Nicolas Isolated Local Edit")

    // Verify: dirty badge appears
    await expect(page.getByText("● Unsaved Changes")).toBeVisible()

    // Verify: external conflict banner is NOT visible (R02)
    await expect(page.getByText(/Server configuration changed in the background/i)).toHaveCount(0)

    // Click Discard Changes
    await page.getByRole("button", { name: "Discard Changes" }).click()
    await expect(page.getByText("● Unsaved Changes")).toHaveCount(0)
    await expect(brgyInput).not.toHaveValue("Barangay San Nicolas Isolated Local Edit")
  } finally {
    if (initialConfig) {
      await db.collection("systemConfig").doc("global").set(initialConfig)
    }
  }
})

test("R07 Scenario F: View Only admin opening notification preview does not trigger forbidden Firestore writes", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  // Seed an unread notification targeted to admin
  const notifId = `e2e-notif-viewonly-${Date.now()}`
  const notifDocRef = db.collection("notifications").doc(notifId)

  try {
    await notifDocRef.set({
      targetId: "admin",
      type: "info",
      title: "System Maintenance Notice",
      message: "Scheduled maintenance will occur tonight at 11 PM.",
      timestamp: "10m ago",
      isRead: false,
      createdAt: Date.now(),
    })

    // Log in as View Only
    await login(page, "viewer")
    await page.goto("/admin/notifications")
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible()

    // 1. Verify mutation controls are hidden for View Only (R04)
    await expect(page.getByRole("button", { name: "Broadcast Message" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Mark all as read" })).toHaveCount(0)

    // 2. Click the notification card to open preview
    await page.getByText("System Maintenance Notice").first().click()

    // 3. Modal opens with notification details
    await expect(page.getByRole("heading", { name: "Notification Details" })).toBeVisible()
    await expect(page.getByRole("dialog").getByText("Scheduled maintenance will occur tonight at 11 PM.")).toBeVisible()

    // 4. Verify in Firestore: isRead is STILL false! (No forbidden Firestore write attempted - R04)
    const notifDoc = await notifDocRef.get()
    expect(notifDoc.data()?.isRead).toBe(false)
  } finally {
    // F05 Teardown: Clean up notification record
    await notifDocRef.delete().catch(() => {})
  }
})
test("MT01 E2E: Admin can open and reprint completed document request with snapshot fidelity", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  const originalTimestamp = 1727481600000
  const reqId = `e2e-req-mt01-completed-${Date.now()}`
  const reqDocRef = db.collection("documentRequests").doc(reqId)

  try {
    await reqDocRef.set({
      id: reqId,
      residentId: "e2e-active-resident",
      residentName: "Maria Clara Santos",
      documentType: "Barangay Clearance",
      purpose: "Employment",
      status: "Completed",
      paymentStatus: "paid",
      hasGenerated: true,
      generatedAt: originalTimestamp,
      issuanceDate: new Date(originalTimestamp).toISOString(),
      issuanceBeneficiaryAddress: "123 Historic Completed St, Barangay San Nicolas",
      issuanceBeneficiaryAge: 30,
      issuanceBeneficiaryName: "Maria Clara Santos",
      reprintCount: 0,
      createdAt: originalTimestamp - 86400000,
    })

    await login(page, "full")
    await page.goto("/admin/requests")
    await expect(page.getByRole("heading", { name: "Document Requests" })).toBeVisible()

    await page.getByRole("button", { name: "Completed" }).click()

    const row = page.locator(`tr:has-text("${reqId.substring(0, 8).toUpperCase()}")`)
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row.getByRole("button", { name: "Reprint" })).toBeVisible()
    await row.getByRole("button", { name: "Reprint" }).click()

    await page.waitForURL(new RegExp(`/admin/generate\\?requestId=${reqId}`))
    await expect(page.getByText("Reprint Document")).toBeVisible()
    await expect(page.getByText("Archival Reprint Notice (Reconstructed Copy)")).toBeVisible()
    await expect(page.getByRole("button", { name: "Download Reprint PDF" })).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download Reprint PDF" }).click()
    const download = await downloadPromise
    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    const fs = await import("fs")
    const pdfBuffer = fs.readFileSync(downloadPath!)
    expect(pdfBuffer.slice(0, 5).toString()).toBe("%PDF-")

    await expect(page.getByText("Document reprinted and downloaded successfully.")).toBeVisible({ timeout: 10000 })

    const updatedDoc = (await reqDocRef.get()).data()
    expect(updatedDoc?.status).toBe("Completed")
    expect(updatedDoc?.reprintCount).toBe(1)
    expect(updatedDoc?.generatedAt).toBe(originalTimestamp)
    expect(updatedDoc?.issuanceBeneficiaryAddress).toBe("123 Historic Completed St, Barangay San Nicolas")
  } finally {
    await reqDocRef.delete().catch(() => {})
  }
})

// ─── R01: Resident Profile Modal Dismissal & Conflicting Edits Guard ───

test("R01: Resident Profile modal dismissal is strictly guarded and form is locked during active save", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)

  const resUid = "e2e-r01-resident"
  await db.collection("users").doc(resUid).set({
    name: "R01 Dismissal Guard Resident",
    email: "r01-guard@example.test",
    role: "resident",
    status: "Active",
    isVerified: true,
    statuses: ["Resident"],
    address: "100 Initial Street, Manila",
    contactNumber: "09181112233",
    dateOfBirth: "1992-04-10",
    createdAt: Date.now(),
  })

  try {
    await db.collection("users").doc("e2e-manager").set({
      name: "E2E manager",
      email: "manager@example.test",
      role: "Resident Management",
      status: "Active",
      isVerified: true,
      createdAt: Date.now(),
    }, { merge: true })

    await login(page, "manager")
    await page.goto("/admin/residents")
    await expect(page.getByRole("heading", { name: "Resident Management" })).toBeVisible()

    const row = page.getByRole("row").filter({ hasText: "R01 Dismissal Guard Resident" })
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.getByRole("button", { name: "View Profile" }).click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()
    await expect(modal.getByRole("heading", { name: "Resident Profile" })).toBeVisible()

    // Enter edit mode
    await modal.getByRole("button", { name: "Edit Profile" }).click()
    await expect(modal.getByText("Editing Mode")).toBeVisible()

    // Modify address field
    const addressInput = modal.locator('div:has(> label:text-is("Address")) input')
    await addressInput.fill("200 Protected Save Boulevard, Manila")

    // Intercept /api/admin/operations and hold it to simulate backend delay
    let fulfillOperation: () => void = () => {}
    const delayPromise = new Promise<void>(resolve => { fulfillOperation = resolve })

    await page.route("**/api/admin/operations", async route => {
      await delayPromise
      await route.continue()
    })

    const saveBtn = modal.getByRole("button", { name: /Save & Log Changes|Saving Changes/i })
    await saveBtn.click()

    // Verify visible saving state
    await expect(modal.getByText("Saving Changes…")).toBeVisible()
    await expect(saveBtn).toBeDisabled()

    // 1. Dismissal Guard: Escape key press
    await page.keyboard.press("Escape")
    await expect(modal).toBeVisible()

    // 2. Dismissal Guard: Backdrop click (click top-left corner outside modal card)
    await page.mouse.click(10, 10)
    await expect(modal).toBeVisible()

    // 3. Dismissal Guard: Modal close button (✕)
    const closeBtn = modal.getByLabel("Close modal")
    await expect(closeBtn).toBeDisabled()
    await closeBtn.click({ force: true })
    await expect(modal).toBeVisible()

    // 4. Dismissal Guard: Header Cancel button
    const cancelBtn = modal.getByRole("button", { name: "Cancel" })
    await expect(cancelBtn).toBeDisabled()
    await cancelBtn.click({ force: true })
    await expect(modal).toBeVisible()

    // 5. Conflicting edits guard: Inputs must be disabled during flight
    const nameInput = modal.locator('input[placeholder="Full Name"]')
    await expect(nameInput).toBeDisabled()
    await expect(addressInput).toBeDisabled()

    // 6. Duplicate click on save button does nothing
    await saveBtn.click({ force: true })

    // Release backend operation
    fulfillOperation()
    await page.unroute("**/api/admin/operations")

    // Verify modal transitions to view mode on success and persists updated address
    await expect(modal.getByText("View Mode")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("200 Protected Save Boulevard, Manila")).toBeVisible()

    // Normal dismissal is restored
    await closeBtn.click()
    await expect(modal).not.toBeVisible()
  } finally {
    await db.collection("users").doc(resUid).delete().catch(() => {})
  }
})

// ─── R02: Full Admin-to-Resident Photo Removal Notification Delivery ───

test("R02: Full Admin-to-Resident photo removal notification delivery, UI display, and mark-all-read", async ({ page }) => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed")!
  const db = getFirestore(app)
  const auth = getAuth(app)

  const targetUid = "e2e-r02-target"
  const targetEmail = "r02-target@example.test"
  const unrelatedUid = "e2e-r02-unrelated"
  const unrelatedEmail = "r02-unrelated@example.test"

  try { await auth.createUser({ uid: targetUid, email: targetEmail, password, emailVerified: true }) } catch (e: any) { if (e.code !== "auth/uid-already-exists") throw e }
  try { await auth.createUser({ uid: unrelatedUid, email: unrelatedEmail, password, emailVerified: true }) } catch (e: any) { if (e.code !== "auth/uid-already-exists") throw e }

  const initialAvatar = `https://res.cloudinary.com/${testCloudName}/image/authenticated/v1/talasys/avatars/target-avatar.jpg`
  await db.collection("users").doc(targetUid).set({
    name: "R02 Target Resident",
    email: targetEmail,
    role: "resident",
    status: "Active",
    isVerified: true,
    profilePicture: initialAvatar,
    statuses: ["Resident"],
    address: "777 Notification Ave, Manila",
    contactNumber: "09179998877",
    createdAt: Date.now(),
  })
  await db.collection("users").doc(unrelatedUid).set({
    name: "R02 Unrelated Resident",
    email: unrelatedEmail,
    role: "resident",
    status: "Active",
    isVerified: true,
    statuses: ["Resident"],
    address: "888 Privacy St, Manila",
    createdAt: Date.now(),
  })

  // Purge any preexisting notifications
  const existingTargetNotifs = await db.collection("notifications").where("targetId", "==", targetUid).get()
  for (const doc of existingTargetNotifs.docs) await doc.ref.delete()
  const existingUnrelatedNotifs = await db.collection("notifications").where("targetId", "==", unrelatedUid).get()
  for (const doc of existingUnrelatedNotifs.docs) await doc.ref.delete()

  try {
    await db.collection("users").doc("e2e-manager").set({
      name: "E2E manager",
      email: "manager@example.test",
      role: "Resident Management",
      status: "Active",
      isVerified: true,
      createdAt: Date.now(),
    }, { merge: true })

    // 1. Admin login and remove photo
    await login(page, "manager")
    await page.goto("/admin/residents")
    const targetRow = page.getByRole("row").filter({ hasText: "R02 Target Resident" })
    await expect(targetRow).toBeVisible({ timeout: 10000 })
    await targetRow.getByRole("button", { name: "View Profile" }).click()

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()

    await modal.getByRole("button", { name: "Edit Profile" }).click()
    await modal.getByRole("button", { name: "Remove Photo" }).click()
    await expect(modal.getByText("Photo Removal Pending")).toBeVisible()

    const removalReason = "Official ID standard violation: Face covered by dark sunglasses"
    const reasonInput = modal.getByPlaceholder(/Inappropriate content, not a face/i)
    await reasonInput.fill(removalReason)

    const saveBtn = modal.getByRole("button", { name: /Save & Log Changes/i })
    await saveBtn.click()

    await expect(page.getByText("Profile picture removed", { exact: true })).toBeVisible({ timeout: 10000 })

    // 2. Authoritative database verification
    const updatedUserDoc = (await db.collection("users").doc(targetUid).get()).data()
    expect(updatedUserDoc?.profilePicture).toBe("")

    const audits = await db.collection("activityLogs").where("targetId", "==", targetUid).get()
    const photoAudit = audits.docs.find(d => d.data().action === "resident.profilePhoto.remove")
    expect(photoAudit).toBeDefined()
    const normalizedAudit = normalizeAuditLog(photoAudit?.data() as any)
    expect(photoAudit?.data().after?.removePhotoReason || normalizedAudit.details).toContain(removalReason)

    const notifs = await db.collection("notifications").where("targetId", "==", targetUid).get()
    expect(notifs.docs.length).toBe(1)
    const notifData = notifs.docs[0].data()
    expect(notifData.title).toBe("Profile Picture Removed")
    expect(notifData.message).toContain(removalReason)
    expect(notifData.isRead).toBe(false)

    // 3. Authenticate as Target Resident and verify in real resident UI
    await login(page, "r02-target", true, /\/resident\/dashboard/)
    await page.goto("/resident/notifications")
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible()

    const notifItem = page.locator('button:has-text("Profile Picture Removed")')
    await expect(notifItem).toBeVisible({ timeout: 10000 })
    await expect(notifItem).toContainText(removalReason)

    const markAllBtn = page.getByRole("button", { name: /Mark all as read/i })
    await expect(markAllBtn).toBeEnabled()

    // 4. Mark all as read via real UI
    await markAllBtn.click()
    await expect(page.getByText("All notifications have been marked as read.", { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(markAllBtn).toBeDisabled()

    // 5. Refresh page and verify read state persists
    await page.reload()
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible()
    await expect(page.locator('button:has-text("Profile Picture Removed")')).toBeVisible()
    await expect(page.getByRole("button", { name: /Mark all as read/i })).toBeDisabled()

    // 6. Security boundary: Unrelated Resident cannot see target's notification
    await login(page, "r02-unrelated", true, /\/resident\/dashboard/)
    await page.goto("/resident/notifications")
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible()
    await expect(page.locator('button:has-text("Profile Picture Removed")')).not.toBeVisible()
  } finally {
    await db.collection("users").doc(targetUid).delete().catch(() => {})
    await db.collection("users").doc(unrelatedUid).delete().catch(() => {})
    const cleanupNotifs = await db.collection("notifications").where("targetId", "==", targetUid).get()
    for (const doc of cleanupNotifs.docs) await doc.ref.delete().catch(() => {})
  }
})

// ─── R04: Validate Laptop and Resident Mobile Usability and Viewport Geometry ───

test("R04: Comprehensive multi-viewport layout measurements across laptop and mobile", async ({ page }) => {
  test.setTimeout(180000)
  const laptopViewports = [
    { width: 1024, height: 768, label: "1024x768" },
    { width: 1280, height: 720, label: "1280x720" },
    { width: 1280, height: 800, label: "1280x800" },
    { width: 1366, height: 768, label: "1366x768" },
    { width: 1440, height: 900, label: "1440x900" },
    { width: 1920, height: 1080, label: "1920x1080" },
    { width: 1093, height: 614, label: "1366x768@125%" },
  ]

  const mobileViewports = [
    { width: 320, height: 568, label: "320x568" },
    { width: 360, height: 800, label: "360x800" },
    { width: 375, height: 667, label: "375x667" },
    { width: 390, height: 844, label: "390x844" },
    { width: 412, height: 915, label: "412x915" },
    { width: 430, height: 932, label: "430x932" },
  ]

  async function checkLayout(url: string, vp: { width: number; height: number; label: string }, screenshotPath?: string) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(url)
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(300)

    const geo = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth
      const winWidth = window.innerWidth
      const stage = document.getElementById("main-scroll-stage")
      const stageWidth = stage ? stage.scrollWidth : docWidth
      const stageClientWidth = stage ? stage.clientWidth : winWidth
      const sidebar = document.querySelector('aside')
      const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null
      const header = document.querySelector('header')
      const headerRect = header ? header.getBoundingClientRect() : null

      return {
        docWidth,
        winWidth,
        stageWidth,
        stageClientWidth,
        docOverflow: docWidth > winWidth + 1,
        stageOverflow: stage ? stage.scrollWidth > stage.clientWidth + 1 : false,
        sidebarWidth: sidebarRect ? Math.round(sidebarRect.width) : null,
        headerHeight: headerRect ? Math.round(headerRect.height) : null,
      }
    })

    expect(geo.docOverflow, `Document horizontal overflow on ${url} at ${vp.label}: docWidth=${geo.docWidth}, winWidth=${geo.winWidth}`).toBe(false)
    expect(geo.stageOverflow, `Stage horizontal overflow on ${url} at ${vp.label}: stageWidth=${geo.stageWidth}, clientWidth=${geo.stageClientWidth}`).toBe(false)

    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: false })
    }

    return geo
  }

  // 1. Public Landing Page at Laptop & Mobile viewports
  await checkLayout("/", { width: 1366, height: 768, label: "1366x768" }, "docs/screenshots/landing-page-1366x768.png")
  await checkLayout("/", { width: 390, height: 844, label: "390x844" }, "docs/screenshots/landing-page-390x844.png")

  // 2. Admin Workspaces across Laptop viewports
  await login(page, "full")
  const adminRoutes = [
    "/admin/dashboard",
    "/admin/residents",
    "/admin/requests",
    "/admin/logs",
  ]
  for (const vp of laptopViewports) {
    for (const route of adminRoutes) {
      const isRepresentative = vp.width === 1366 && route === "/admin/dashboard"
      await checkLayout(route, vp, isRepresentative ? "docs/screenshots/admin-dashboard-1366x768.png" : undefined)
    }
  }

  // Test Resident Profile Modal geometry inside Admin workspace
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto("/admin/residents")
  const firstRow = page.getByRole("row").filter({ hasText: "E2E Active Resident" })
  if (await firstRow.isVisible()) {
    await firstRow.getByRole("button", { name: "View Profile" }).click()
    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()
    await page.screenshot({ path: "docs/screenshots/admin-residents-modal-1366x768.png" })
    await modal.getByLabel("Close modal").click()
  }

  // 3. Super Admin Navigation Stability across Super Admin transitions
  await login(page, "super", true, /\/superadmin\/dashboard/)
  await page.setViewportSize({ width: 1366, height: 768 })

  const superDashboardGeo = await checkLayout("/superadmin/dashboard", { width: 1366, height: 768, label: "1366x768" })
  const superAdminsGeo = await checkLayout("/superadmin/admins", { width: 1366, height: 768, label: "1366x768" })
  const superConfigGeo = await checkLayout("/superadmin/config", { width: 1366, height: 768, label: "1366x768" })
  const superAuditGeo = await checkLayout("/superadmin/audit", { width: 1366, height: 768, label: "1366x768" }, "docs/screenshots/superadmin-audit-1366x768.png")

  // Sidebar width and header height must remain stable across route transitions
  expect(superDashboardGeo.sidebarWidth).toBe(superAdminsGeo.sidebarWidth)
  expect(superAdminsGeo.sidebarWidth).toBe(superConfigGeo.sidebarWidth)
  expect(superConfigGeo.sidebarWidth).toBe(superAuditGeo.sidebarWidth)
  expect(superDashboardGeo.headerHeight).toBe(superAdminsGeo.headerHeight)
  expect(superAdminsGeo.headerHeight).toBe(superConfigGeo.headerHeight)
  expect(superConfigGeo.headerHeight).toBe(superAuditGeo.headerHeight)

  // 4. Resident Workspaces across all Mobile viewports
  await login(page, "active-resident", true, /\/resident\/dashboard/)
  const residentRoutes = [
    "/resident/dashboard",
    "/resident/profile",
    "/resident/request",
    "/resident/history",
    "/resident/notifications",
  ]
  for (const vp of mobileViewports) {
    for (const route of residentRoutes) {
      let shotPath: string | undefined
      if (vp.width === 390) {
        if (route === "/resident/dashboard") shotPath = "docs/screenshots/resident-dashboard-390x844.png"
        else if (route === "/resident/history") shotPath = "docs/screenshots/resident-history-390x844.png"
        else if (route === "/resident/notifications") shotPath = "docs/screenshots/resident-notifications-390x844.png"
      }
      await checkLayout(route, vp, shotPath)
    }
  }
})
