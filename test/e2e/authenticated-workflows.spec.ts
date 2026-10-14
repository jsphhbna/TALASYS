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

test.beforeAll(async () => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed") || initializeApp({ projectId }, "e2e-seed")
  const auth = getAuth(app)
  const db = getFirestore(app)
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
  try { await auth.createUser({ uid: "e2e-resident", email: "resident@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-resident").set({ name: "E2E Resident", email: "resident@example.test", role: "resident", status: "Pending", isVerified: false, createdAt: Date.now() })
  try { await auth.createUser({ uid: "e2e-approve-resident", email: "approve-resident@example.test", password, emailVerified: true }) } catch (error: any) { if (error.code !== "auth/uid-already-exists") throw error }
  await db.collection("users").doc("e2e-approve-resident").set({ name: "E2E Approval Resident", email: "approve-resident@example.test", role: "resident", status: "Pending", isVerified: false, createdAt: Date.now() })
  await db.collection("users").doc("e2e-managed-resident").set({ name: "E2E Managed Resident", email: "managed@example.test", role: "resident", status: "Active", isVerified: true, statuses: ["Resident"], createdAt: Date.now() })
  await db.collection("verifications").doc("e2e-reject").set({ residentId: "e2e-resident", name: "E2E Resident", email: "resident@example.test", status: "pending", type: "registration", submittedDate: "Today", createdAt: Date.now(), documents: [] })
})

test.afterAll(async () => {
  await Promise.all(getApps().filter(app => app.name === "e2e-seed").map(app => deleteApp(app)))
})

async function login(page: Page, identity: string, expectSuccess = true) {
  await page.addInitScript(() => localStorage.setItem("adminSecurityDisclaimerShownForever", "true"))
  await page.goto("/auth/login")
  await page.getByLabel("Username or Email").fill(`${identity}@example.test`)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Sign In" }).click()
  if (expectSuccess) await expect(page).toHaveURL(/\/admin\/dashboard/)
}

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
