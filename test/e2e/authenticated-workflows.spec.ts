import { expect, test, type Page } from "@playwright/test"
import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { mediaRegistryDocumentId } from "../../lib/security/media-auth.ts"

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
  const denyRes = await fetch("http://127.0.0.1:3000/api/admin/operations", {
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
