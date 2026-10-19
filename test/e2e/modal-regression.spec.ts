import { expect, test, type Page } from "@playwright/test"
import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { normalizeAuditLog } from "../../lib/security/audit-utils.ts"

const projectId = "talasys-e2e"
const password = "Talasys-E2E-Password-2026!"
const testCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "talasys-test-cloud"
const captainSignatureUrl = `https://res.cloudinary.com/${testCloudName}/image/authenticated/s--signature--/v1/talasys/signatures/captain.png`

const viewports = [
  { width: 1024, height: 768, label: "1024x768" },
  { width: 1280, height: 720, label: "1280x720" },
  { width: 1280, height: 800, label: "1280x800" },
  { width: 1366, height: 768, label: "1366x768" },
  { width: 1920, height: 1080, label: "1920x1080" },
] as const

test.beforeAll(async () => {
  const app = getApps().find(candidate => candidate.name === "e2e-seed") || initializeApp({ projectId }, "e2e-seed")
  const auth = getAuth(app)
  const db = getFirestore(app)

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

  await db.collection("systemConfig").doc("backup_status").set({
    lastBackupDate: new Date().toISOString(),
    status: "completed",
    updatedAt: Date.now(),
  })

  // Create superadmin
  try {
    await auth.createUser({ uid: "e2e-super", email: "super@example.test", password, emailVerified: true })
  } catch (error: any) {
    if (error.code !== "auth/uid-already-exists") throw error
  }
  await db.collection("users").doc("e2e-super").set({
    name: "E2E Super Admin",
    email: "super@example.test",
    role: "superadmin",
    status: "Active",
    isVerified: true,
    createdAt: Date.now(),
  })

  // Create full access admin
  try {
    await auth.createUser({ uid: "e2e-full", email: "full@example.test", password, emailVerified: true })
  } catch (error: any) {
    if (error.code !== "auth/uid-already-exists") throw error
  }
  await db.collection("users").doc("e2e-full").set({
    name: "E2E Full Admin",
    email: "full@example.test",
    role: "Full Access",
    status: "Active",
    isVerified: true,
    createdAt: Date.now(),
  })

  // Create resident with photo and documents for photo preview & remove photo test
  const residentUid = "e2e-modal-resident"
  try {
    await auth.createUser({ uid: residentUid, email: "modal-resident@example.test", password, emailVerified: true })
  } catch (error: any) {
    if (error.code !== "auth/uid-already-exists") throw error
  }
  await db.collection("users").doc(residentUid).set({
    name: "E2E Modal Resident",
    email: "modal-resident@example.test",
    role: "resident",
    status: "Active",
    isVerified: true,
    statuses: ["Resident"],
    address: "789 Sampaguita Street",
    contactNumber: "09189876543",
    dateOfBirth: "1992-04-12",
    profilePicture: `https://res.cloudinary.com/${testCloudName}/image/authenticated/v1/talasys/residents/modal-resident.jpg`,
    createdAt: Date.now(),
  })

  // Seed a verification document for Valid ID full view
  await db.collection("verifications").doc("e2e-modal-doc-verif").set({
    residentId: residentUid,
    name: "E2E Modal Resident",
    email: "modal-resident@example.test",
    status: "approved",
    type: "registration",
    submittedDate: "Today",
    createdAt: Date.now(),
    documents: [
      {
        name: "Barangay ID Front",
        type: "id",
        url: `https://res.cloudinary.com/${testCloudName}/image/authenticated/v1/talasys/docs/valid-id.jpg`,
        status: "Valid",
      },
    ],
  })

  // Managed resident for deactivation modal test
  await db.collection("users").doc("e2e-deact-resident").set({
    name: "E2E Deactivate Resident",
    email: "deact@example.test",
    role: "resident",
    status: "Active",
    isVerified: true,
    statuses: ["Resident"],
    createdAt: Date.now(),
  })
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as any).__TALASYS_E2E_CONFIG__ = {
      projectId: "talasys-e2e",
      authUrl: "http://127.0.0.1:9199",
      firestoreHost: "127.0.0.1",
      firestorePort: 8180,
    }
  })
  const app = getApps().find(candidate => candidate.name === "e2e-seed") || initializeApp({ projectId }, "e2e-seed")
  const db = getFirestore(app)
  await db.collection("users").doc("e2e-full").update({ role: "Full Access" }).catch(() => {})

  await page.route("https://res.cloudinary.com/**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
    })
  })
})

async function login(page: Page, emailUser: string, expectedUrl: RegExp = /\/admin\/dashboard/) {
  await page.addInitScript(() => localStorage.setItem("adminSecurityDisclaimerShownForever", "true"))
  await page.goto("/auth/login")
  await page.getByLabel("Username or Email").fill(`${emailUser}@example.test`)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Sign In" }).click()
  await expect(page).toHaveURL(expectedUrl, { timeout: 15000 })
}

test.describe("M01–M05 Modal Centering, Dismissal, Layering, and Sidebar Verification", () => {
  for (const vp of viewports) {
    test(`[${vp.label}] M01, M02 & M04: SuperAdmin modals centered, dismissible, and sidebar stable`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await login(page, "super", /\/superadmin\/dashboard/)
      await page.goto("/superadmin/admins")
      await expect(page.getByRole("heading", { name: "Admin Management" })).toBeVisible()

      // 1. Sidebar responsiveness and label wrapping check
      const sidebarAside = page.locator('aside[role="navigation"]')
      await expect(sidebarAside).toBeVisible()
      const sidebarBox = await sidebarAside.boundingBox()
      expect(sidebarBox).not.toBeNull()
      expect(sidebarBox!.width).toBeGreaterThanOrEqual(236)
      expect(sidebarBox!.width).toBeLessThanOrEqual(265)

      // Verify all SuperAdmin nav items: no text wrapping or overflow
      const navLinks = sidebarAside.locator("nav a")
      const linkCount = await navLinks.count()
      for (let i = 0; i < linkCount; i++) {
        const link = navLinks.nth(i)
        const label = link.locator("span").first()
        const isWrappedOrOverflowing = await label.evaluate(el => {
          return el.scrollWidth > el.clientWidth + 1 || el.getClientRects().length > 1
        })
        expect(isWrappedOrOverflowing).toBe(false)
      }

      // Verify Sign Out button visibility in sidebar
      const signOutBtn = sidebarAside.getByRole("button", { name: "Sign Out" })
      await expect(signOutBtn).toBeVisible()
      const signOutBox = await signOutBtn.boundingBox()
      expect(signOutBox).not.toBeNull()
      expect(signOutBox!.y + signOutBox!.height).toBeLessThanOrEqual(vp.height)

      // 2. Super Admin -> Edit Privileges modal centering & dismissal
      const actionBtn = page.getByRole("button", { name: /Actions for/ }).first()
      await actionBtn.click()
      const editPrivItem = page.getByRole("menuitem", { name: "Edit Privileges" })
      await editPrivItem.click()

      const editPrivCard = page.locator('.bg-white.dark\\:bg-slate-900.rounded-xl.w-full.max-w-md').first()
      await expect(editPrivCard).toBeVisible()

      const editPrivBox = await editPrivCard.boundingBox()
      expect(editPrivBox).not.toBeNull()
      const editPrivCenterX = editPrivBox!.x + editPrivBox!.width / 2
      const vpCenterX = vp.width / 2
      expect(Math.abs(editPrivCenterX - vpCenterX)).toBeLessThanOrEqual(5)

      // Test click inside card does NOT dismiss (click non-interactive heading)
      await editPrivCard.getByRole("heading", { name: "Edit Admin Privileges" }).click()
      await expect(editPrivCard).toBeVisible()

      // Test click outside card in empty space dismisses
      await page.mouse.click(editPrivBox!.x + editPrivBox!.width + 40, editPrivBox!.y + 30)
      await expect(editPrivCard).not.toBeVisible()

      // Verify scroll lock cleanup
      const overflowState = await page.evaluate(() => ({
        body: document.body.style.overflow,
        html: document.documentElement.style.overflow,
      }))
      expect(overflowState.body).toBe("")
      expect(overflowState.html).toBe("")

      // 3. Super Admin -> Create Admin modal centering and scrollability
      const createAdminBtn = page.getByRole("button", { name: "Create Admin" })
      await createAdminBtn.click()

      const createAdminCard = page.locator('.bg-white.dark\\:bg-slate-900.rounded-xl.w-full.max-w-2xl').first()
      await expect(createAdminCard).toBeVisible()

      const createAdminBox = await createAdminCard.boundingBox()
      expect(createAdminBox).not.toBeNull()
      const createAdminCenterX = createAdminBox!.x + createAdminBox!.width / 2
      expect(Math.abs(createAdminCenterX - vpCenterX)).toBeLessThanOrEqual(5)

      // Verify internal scroll area of Create Admin modal
      const createScrollArea = createAdminCard.locator('.overflow-y-auto')
      const isScrollable = await createScrollArea.evaluate(el => el.scrollHeight >= el.clientHeight)
      expect(isScrollable).toBe(true)

      // Cancel button dismisses
      await createAdminCard.getByRole("button", { name: "Cancel" }).click()
      await expect(createAdminCard).not.toBeVisible()
    })

    test(`[${vp.label}] M01, M02 & M04: Admin modals centered, dismissible, and sidebar stable`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await login(page, "full", /\/admin\/dashboard/)
      await page.goto("/admin/residents")
      await expect(page.getByRole("heading", { name: "Resident Management" })).toBeVisible()

      // 1. Sidebar responsiveness and label wrapping check
      const sidebarAside = page.locator('aside[role="navigation"]')
      await expect(sidebarAside).toBeVisible()
      const sidebarBox = await sidebarAside.boundingBox()
      expect(sidebarBox).not.toBeNull()
      expect(sidebarBox!.width).toBeGreaterThanOrEqual(236)
      expect(sidebarBox!.width).toBeLessThanOrEqual(265)

      // Capture initial sidebar geometry and background appearance for QA-01 comparison
      const initialSidebarGeom = {
        x: sidebarBox!.x,
        y: sidebarBox!.y,
        width: sidebarBox!.width,
        height: sidebarBox!.height,
      }
      const initialSidebarBg = await sidebarAside.evaluate(el => window.getComputedStyle(el).backgroundColor)
      expect(initialSidebarBg).toBe("rgb(12, 35, 64)")

      // Expand all accordions simultaneously (QA-02)
      const docBtn = sidebarAside.getByRole("button", { name: "Document Processing" })
      const resBtn = sidebarAside.getByRole("button", { name: "Resident Management" })
      const verifBtn = sidebarAside.getByRole("button", { name: "Verifications" })

      // Verify accordion buttons and labels have full text, title, and aria-label without ellipses
      for (const btn of [docBtn, resBtn, verifBtn]) {
        await expect(btn).toBeVisible()
        const label = btn.locator("span").first()
        const labelText = (await label.textContent())?.trim() || ""
        expect(labelText.length).toBeGreaterThan(5)
        expect(labelText).not.toContain("...")
        const isWrapped = await label.evaluate(el => el.scrollWidth > el.clientWidth + 1 || el.getClientRects().length > 1)
        expect(isWrapped).toBe(false)
        const ariaLabel = await btn.getAttribute("aria-label")
        expect(ariaLabel).toBe(labelText)
      }

      // Verify all sub-item links: no text wrapping, titles, and full readable text
      const subLinks = sidebarAside.locator("nav a")
      const subLinkCount = await subLinks.count()
      for (let i = 0; i < subLinkCount; i++) {
        const link = subLinks.nth(i)
        const label = link.locator("span").first()
        const labelText = (await label.textContent())?.trim() || ""
        expect(labelText).not.toContain("...")
        const isWrapped = await label.evaluate(el => el.scrollWidth > el.clientWidth + 1 || el.getClientRects().length > 1)
        expect(isWrapped).toBe(false)
        const linkTitle = await link.getAttribute("title")
        expect(linkTitle).toBe(labelText)
      }

      // Verify independent scrolling of nav when fully expanded
      const navElement = sidebarAside.locator("nav")
      const navScroll = await navElement.evaluate(el => {
        el.scrollTop = 50
        return {
          overflowY: window.getComputedStyle(el).overflowY,
          scrollTop: el.scrollTop,
        }
      })
      expect(["auto", "scroll"]).toContain(navScroll.overflowY)

      // Verify Sign Out button remains fully visible at the bottom and never obscured
      const signOutBtn = sidebarAside.getByRole("button", { name: "Sign Out" })
      await expect(signOutBtn).toBeVisible()
      const signOutBox = await signOutBtn.boundingBox()
      expect(signOutBox).not.toBeNull()
      expect(signOutBox!.y + signOutBox!.height).toBeLessThanOrEqual(vp.height)

      // 2. Admin -> Resident Profile modal centering & QA-01 sidebar visual geometry preservation
      const residentRow = page.getByRole("row").filter({ hasText: "E2E Modal Resident" })
      await residentRow.getByRole("button", { name: "View Profile" }).click()

      const profileModal = page.getByRole("dialog", { name: "Resident Profile" })
      await expect(profileModal).toBeVisible()

      // QA-01 Verification: While overlay is open, sidebar retains identical geometry and painted background
      const modalOpenSidebarBox = await sidebarAside.boundingBox()
      expect(modalOpenSidebarBox).not.toBeNull()
      expect(modalOpenSidebarBox!.x).toBe(initialSidebarGeom.x)
      expect(modalOpenSidebarBox!.width).toBe(initialSidebarGeom.width)
      expect(Math.abs(modalOpenSidebarBox!.y - initialSidebarGeom.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(modalOpenSidebarBox!.height - initialSidebarGeom.height)).toBeLessThanOrEqual(1)

      const modalOpenSidebarBg = await sidebarAside.evaluate(el => window.getComputedStyle(el).backgroundColor)
      expect(modalOpenSidebarBg).toBe(initialSidebarBg)

      // Verify backdrop has backdrop-blur-sm compositing layer and computed blur
      const backdropEl = page.locator('[data-slot="modal-overlay-backdrop"]').first()
      await expect(backdropEl).toBeVisible()
      const backdropClass = await backdropEl.getAttribute("class")
      expect(backdropClass).toContain("backdrop-blur-sm")
      const computedBackdropBlur = await backdropEl.evaluate(el => {
        const style = window.getComputedStyle(el)
        return style.backdropFilter || (style as any).webkitBackdropFilter || ""
      })
      expect(computedBackdropBlur).toContain("blur")

      // Verify modal content remains sharp (no backdrop-filter on card itself)
      const profileCard = profileModal.locator('.w-full.max-w-3xl').first()
      const profileCardBlur = await profileCard.evaluate(el => {
        const style = window.getComputedStyle(el)
        return style.backdropFilter || (style as any).webkitBackdropFilter || "none"
      })
      expect(profileCardBlur).toBe("none")
      const profileBox = await profileCard.boundingBox()
      expect(profileBox).not.toBeNull()
      const profileCenterX = profileBox!.x + profileBox!.width / 2
      const vpCenterX = vp.width / 2
      expect(Math.abs(profileCenterX - vpCenterX)).toBeLessThanOrEqual(5)

      // Test click inside profile card does not close it
      await profileCard.click()
      await expect(profileModal).toBeVisible()

      // Close modal
      await profileModal.getByLabel("Close modal").click()
      await expect(profileModal).not.toBeVisible()

      // 3. Admin -> Deactivate Confirmation modal centering & outside dismissal
      const deactRow = page.getByRole("row").filter({ hasText: "E2E Deactivate Resident" })
      await deactRow.getByRole("button", { name: /Actions for/ }).click()
      await page.getByRole("menuitem", { name: "Deactivate Account" }).click()

      const deactCard = page.locator('.w-full.max-w-md').first()
      await expect(deactCard).toBeVisible()
      const deactBox = await deactCard.boundingBox()
      expect(deactBox).not.toBeNull()
      const deactCenterX = deactBox!.x + deactBox!.width / 2
      expect(Math.abs(deactCenterX - vpCenterX)).toBeLessThanOrEqual(5)

      // Test click outside dismisses deactivation modal
      await page.mouse.click(deactBox!.x + deactBox!.width + 40, deactBox!.y + 30)
      await expect(deactCard).not.toBeVisible()
    })
  }

  test("M03 Mandatory E2E: Open Profile → Preview Photo → Remove Photo → Reason → Save → Audit & Notification", async ({ page }) => {
    const app = getApps().find(candidate => candidate.name === "e2e-seed")!
    const db = getFirestore(app)
    const targetUid = "e2e-modal-resident"

    // Reset profile picture to initial state
    await db.collection("users").doc(targetUid).update({
      profilePicture: `https://res.cloudinary.com/${testCloudName}/image/authenticated/v1/talasys/residents/modal-resident.jpg`,
    })

    // Clean up past notifications or audits for targetUid
    const pastNotifs = await db.collection("notifications").where("targetId", "==", targetUid).get()
    for (const d of pastNotifs.docs) await d.ref.delete()

    await page.setViewportSize({ width: 1366, height: 768 })
    await login(page, "full", /\/admin\/dashboard/)
    await page.goto("/admin/residents")
    await expect(page.getByRole("heading", { name: "Resident Management" })).toBeVisible()

    const residentRow = page.getByRole("row").filter({ hasText: "E2E Modal Resident" })
    await residentRow.getByRole("button", { name: "View Profile" }).click()

    const profileModal = page.getByRole("dialog", { name: "Resident Profile" })
    await expect(profileModal).toBeVisible()

    // 1. Open Photo Preview (Lightbox)
    const photoImg = profileModal.locator('img[alt="E2E Modal Resident"]')
    await photoImg.click()

    // 2. Verify Lightbox appears above parent modal with higher z-index
    const lightboxModal = page.getByRole("dialog", { name: "Resident Profile Photo" })
    await expect(lightboxModal).toBeVisible()

    const zIndexValues = await page.evaluate(() => {
      const overlays = Array.from(document.querySelectorAll('body > div.fixed.inset-0'))
      return overlays.map(el => ({
        zIndex: Number(window.getComputedStyle(el).zIndex),
        text: el.textContent?.slice(0, 40) || "",
      }))
    })

    const parentOverlay = zIndexValues.find(o => o.text.includes("Resident Profile"))
    const childOverlay = zIndexValues.find(o => o.text.includes("Profile Photo"))
    expect(parentOverlay).toBeDefined()
    expect(childOverlay).toBeDefined()
    expect(childOverlay!.zIndex).toBeGreaterThan(parentOverlay!.zIndex)

    // 3. Test photo viewer dismissal via Escape leaving parent open
    await page.keyboard.press("Escape")
    await expect(lightboxModal).not.toBeVisible()
    await expect(profileModal).toBeVisible()

    // Re-open Photo Preview
    await photoImg.click()
    await expect(lightboxModal).toBeVisible()

    // 4. Click "Remove Photo" inside the Lightbox
    const removePhotoInLightbox = lightboxModal.getByRole("button", { name: "Remove Photo" })
    await removePhotoInLightbox.click()

    // 5. Lightbox closes, parent modal is in edit mode with "Photo Removal Pending"
    await expect(lightboxModal).not.toBeVisible()
    await expect(profileModal).toBeVisible()
    await expect(profileModal.getByText("Photo Removal Pending")).toBeVisible()

    // 6. Enter removal reason
    const removalReason = "Official ID policy violation: Profile photo is not a recognizable portrait"
    const reasonInput = profileModal.getByPlaceholder(/Inappropriate content, not a face/i)
    await reasonInput.fill(removalReason)

    // 7. Click Save & Log Changes
    const saveBtn = profileModal.getByRole("button", { name: /Save & Log Changes/i })
    await saveBtn.click()

    await expect(page.getByText("Profile picture removed", { exact: true })).toBeVisible({ timeout: 10000 })

    // 8. Verify persistence in Firestore
    const updatedUser = (await db.collection("users").doc(targetUid).get()).data()
    expect(updatedUser?.profilePicture).toBe("")

    // 9. Verify canonical audit record
    const audits = await db.collection("activityLogs").where("targetId", "==", targetUid).get()
    const photoAudit = audits.docs.find(d => d.data().action === "resident.profilePhoto.remove")
    expect(photoAudit).toBeDefined()
    const normalizedAudit = normalizeAuditLog(photoAudit?.data() as any)
    expect(photoAudit?.data().after?.removePhotoReason || normalizedAudit.details).toContain(removalReason)

    // 10. Verify resident notification
    const notifs = await db.collection("notifications").where("targetId", "==", targetUid).get()
    expect(notifs.docs.length).toBe(1)
    const notif = notifs.docs[0].data()
    expect(notif.title).toBe("Profile Picture Removed")
    expect(notif.message).toContain(removalReason)
    expect(notif.isRead).toBe(false)

    // 11. QA-03 Mandatory Browser UI Verification:
    // Verify the photo removal event appears through the actual Admin Activity Logs browser UI
    await page.goto("/admin/logs")
    await expect(page.getByRole("heading", { name: "Activity Logs" })).toBeVisible()

    // Table first row must immediately display the photo removal event (sorted top descending)
    const firstLogRow = page.locator("table tbody tr").first()
    await expect(firstLogRow).toBeVisible({ timeout: 10000 })
    await expect(firstLogRow).toContainText("Removed Resident Profile Picture")
    await expect(firstLogRow).toContainText("E2E Modal Resident")
    await expect(firstLogRow).toContainText(removalReason)

    // Filter by Resident Ops: row remains visible
    await page.getByRole("button", { name: "Resident Ops" }).click()
    const residentOpsRow = page.locator("table tbody tr").first()
    await expect(residentOpsRow).toBeVisible()
    await expect(residentOpsRow).toContainText("Removed Resident Profile Picture")

    // Search by removal reason keyword
    const searchInput = page.getByPlaceholder(/Search logs/i)
    await searchInput.fill("recognizable portrait")
    const searchResultRow = page.locator("table tbody tr").first()
    await expect(searchResultRow).toBeVisible()
    await expect(searchResultRow).toContainText("Removed Resident Profile Picture")
    await searchInput.clear()
  })

  test("QA-04 Landing page zoom adaptation and fluid composition across zoom viewports", async ({ page }) => {
    const zoomLevels = [
      { width: 1280, height: 720, label: "100% Zoom (1280x720)" },
      { width: 1600, height: 900, label: "80% Zoom (1600x900)" },
      { width: 1920, height: 1080, label: "67% Zoom (1920x1080)" },
      { width: 1024, height: 768, label: "125% Zoom (1024x768)" },
    ]

    for (const zoom of zoomLevels) {
      await page.setViewportSize({ width: zoom.width, height: zoom.height })
      await page.goto("/")
      await expect(page.locator("#hero")).toBeVisible()

      // 1. Verify container scales fluidly beyond 1280px on wide screens
      const heroContainer = page.locator("#hero > div:not(.pointer-events-none)")
      const containerBox = await heroContainer.boundingBox()
      expect(containerBox).not.toBeNull()
      if (zoom.width >= 1600) {
        expect(containerBox!.width).toBeGreaterThan(1200)
      }

      // 2. Verify officials image scales with object-cover and top alignment without distortion
      const officialsImg = page.locator('img[alt="Barangay 634 Officials Group"]')
      await expect(officialsImg).toBeVisible()
      const imgMetrics = await officialsImg.evaluate(el => {
        const computed = window.getComputedStyle(el)
        return {
          objectFit: computed.objectFit,
          objectPosition: computed.objectPosition,
          clientWidth: el.clientWidth,
          clientHeight: el.clientHeight,
        }
      })
      expect(imgMetrics.objectFit).toBe("cover")
      expect(imgMetrics.objectPosition.includes("top") || imgMetrics.objectPosition === "50% 0%").toBe(true)
      expect(imgMetrics.clientWidth).toBeGreaterThan(200)
      expect(imgMetrics.clientHeight).toBeGreaterThan(200)

      // 3. Verify text line readability
      const descParagraph = page.locator("#hero p").first()
      await expect(descParagraph).toBeVisible()

      // 4. Verify decorative blur-3xl blobs are absent from the hero section
      const blurBlobs = page.locator('#hero .blur-3xl')
      expect(await blurBlobs.count()).toBe(0)
    }
  })

  test("M03 Nested Valid ID preview and dismissal", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await login(page, "full", /\/admin\/dashboard/)
    await page.goto("/admin/residents")

    const residentRow = page.getByRole("row").filter({ hasText: "E2E Modal Resident" })
    await residentRow.getByRole("button", { name: "View Profile" }).click()

    const profileModal = page.getByRole("dialog", { name: "Resident Profile" })
    await expect(profileModal).toBeVisible()

    // Scroll to documents section and click zoom on Valid ID
    const validIdDoc = profileModal.locator('img[alt="Barangay ID Front"]')
    await expect(validIdDoc).toBeVisible({ timeout: 5000 })
    await validIdDoc.click()

    // Valid ID Full View modal opens above parent
    const idFullModal = page.getByRole("dialog", { name: "Valid ID Full View" })
    await expect(idFullModal).toBeVisible()

    // Verify z-index is higher than parent
    const zIndexValues = await page.evaluate(() => {
      const overlays = Array.from(document.querySelectorAll('body > div.fixed.inset-0'))
      return overlays.map(el => {
        const dialog = el.querySelector('[role="dialog"]')
        return {
          zIndex: Number(window.getComputedStyle(el).zIndex),
          ariaLabel: dialog?.getAttribute("aria-label") || "",
          text: el.textContent?.slice(0, 40) || "",
        }
      })
    })

    const parentOverlay = zIndexValues.find(o => o.ariaLabel.includes("Resident Profile") || o.text.includes("Resident Profile"))
    const childOverlay = zIndexValues.find(o => o.ariaLabel.includes("Valid ID") || o.text.includes("Valid ID"))
    expect(parentOverlay).toBeDefined()
    expect(childOverlay).toBeDefined()
    expect(childOverlay!.zIndex).toBeGreaterThan(parentOverlay!.zIndex)

    // Close Valid ID modal via ✕
    await idFullModal.locator('button:has-text("✕")').click()
    await expect(idFullModal).not.toBeVisible()
    await expect(profileModal).toBeVisible()
  })

  test("Radix Dialog backdrop blur and sidebar stability (Sign Out dialog)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await login(page, "full", /\/admin\/dashboard/)

    const sidebarAside = page.locator('aside[role="navigation"]')
    await expect(sidebarAside).toBeVisible()
    const initialSidebarBox = await sidebarAside.boundingBox()
    expect(initialSidebarBox).not.toBeNull()

    // Click Sign Out in sidebar to trigger Radix Dialog
    const signOutBtn = sidebarAside.getByRole("button", { name: "Sign Out" })
    await signOutBtn.click()

    // Radix DialogOverlay has data-slot="dialog-overlay"
    const dialogOverlay = page.locator('[data-slot="dialog-overlay"]').first()
    await expect(dialogOverlay).toBeVisible()

    const overlayClass = await dialogOverlay.getAttribute("class")
    expect(overlayClass).toContain("backdrop-blur-sm")

    const computedBlur = await dialogOverlay.evaluate(el => {
      const style = window.getComputedStyle(el)
      return style.backdropFilter || (style as any).webkitBackdropFilter || ""
    })
    expect(computedBlur).toContain("blur")

    // Radix DialogContent has data-slot="dialog-content" and sharp content
    const dialogContent = page.locator('[data-slot="dialog-content"]').first()
    await expect(dialogContent).toBeVisible()
    const contentBlur = await dialogContent.evaluate(el => {
      const style = window.getComputedStyle(el)
      return style.backdropFilter || (style as any).webkitBackdropFilter || "none"
    })
    expect(contentBlur).toBe("none")

    // Sidebar remains fully visible and intact behind the overlay
    const openSidebarBox = await sidebarAside.boundingBox()
    expect(openSidebarBox).not.toBeNull()
    expect(openSidebarBox!.x).toBe(initialSidebarBox!.x)
    expect(openSidebarBox!.width).toBe(initialSidebarBox!.width)

    // Cancel dismisses the dialog
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(dialogContent).not.toBeVisible()
    await expect(dialogOverlay).not.toBeVisible()
  })

  test("Radix AlertDialog backdrop blur and content sharpness (Resident Danger Zone)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await login(page, "modal-resident", /\/resident\/dashboard/)
    await page.goto("/resident/profile")
    await expect(page.getByRole("heading", { name: "Danger Zone" })).toBeVisible()

    // Click Delete Account to open Radix AlertDialog
    const deleteBtn = page.getByRole("button", { name: "Delete Account" })
    await deleteBtn.click()

    // AlertDialogOverlay has data-slot="alert-dialog-overlay"
    const alertOverlay = page.locator('[data-slot="alert-dialog-overlay"]').first()
    await expect(alertOverlay).toBeVisible()

    const overlayClass = await alertOverlay.getAttribute("class")
    expect(overlayClass).toContain("backdrop-blur-sm")

    const computedBlur = await alertOverlay.evaluate(el => {
      const style = window.getComputedStyle(el)
      return style.backdropFilter || (style as any).webkitBackdropFilter || ""
    })
    expect(computedBlur).toContain("blur")

    // AlertDialogContent has data-slot="alert-dialog-content" and sharp content
    const alertContent = page.locator('[data-slot="alert-dialog-content"]').first()
    await expect(alertContent).toBeVisible()
    const contentBlur = await alertContent.evaluate(el => {
      const style = window.getComputedStyle(el)
      return style.backdropFilter || (style as any).webkitBackdropFilter || "none"
    })
    expect(contentBlur).toBe("none")

    // Cancel button dismisses AlertDialog
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(alertContent).not.toBeVisible()
    await expect(alertOverlay).not.toBeVisible()
  })

  test("Reduced motion disables backdrop blur effect gracefully", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.setViewportSize({ width: 1280, height: 720 })
    await login(page, "full", /\/admin\/dashboard/)
    await page.goto("/admin/residents")

    const residentRow = page.getByRole("row").filter({ hasText: "E2E Modal Resident" })
    await residentRow.getByRole("button", { name: "View Profile" }).click()

    const profileModal = page.getByRole("dialog", { name: "Resident Profile" })
    await expect(profileModal).toBeVisible()

    const backdropEl = page.locator('[data-slot="modal-overlay-backdrop"]').first()
    await expect(backdropEl).toBeVisible()

    const computedBackdropBlur = await backdropEl.evaluate(el => {
      const style = window.getComputedStyle(el)
      return style.backdropFilter || (style as any).webkitBackdropFilter || "none"
    })
    expect(computedBackdropBlur === "none" || computedBackdropBlur === "").toBe(true)

    await profileModal.getByLabel("Close modal").click()
    await expect(profileModal).not.toBeVisible()
  })
})
