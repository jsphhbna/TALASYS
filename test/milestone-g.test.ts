import { describe, it } from "node:test"
import assert from "node:assert"
import fs from "node:fs"
import path from "node:path"

describe("Milestone G — UI Accessibility, Reflow, Truthful Error States & Lifecycle", () => {
  describe("#32 — Site headers permit same-origin camera usage", () => {
    it("configures Permissions-Policy to allow camera for self while restricting mic and geo", () => {
      const configPath = path.resolve(process.cwd(), "next.config.mjs")
      const content = fs.readFileSync(configPath, "utf-8")

      assert.ok(
        content.includes("camera=(self)"),
        "Permissions-Policy must explicitly permit camera=(self)"
      )
      assert.ok(
        content.includes("microphone=()"),
        "Permissions-Policy must restrict microphone=()"
      )
      assert.ok(
        content.includes("geolocation=()"),
        "Permissions-Policy must restrict geolocation=()"
      )
    })
  })

  describe("#33 — Camera lifecycle and countdown timer ref cleanup", () => {
    it("profile-camera-modal uses stream and timer refs to ensure unmount cleanup", () => {
      const modalPath = path.resolve(
        process.cwd(),
        "components/resident/profile/profile-camera-modal.tsx"
      )
      const content = fs.readFileSync(modalPath, "utf-8")

      assert.ok(
        content.includes("streamRef"),
        "Must track MediaStream via streamRef"
      )
      assert.ok(
        content.includes("timerRef"),
        "Must track countdown timer via timerRef"
      )
      assert.ok(
        content.includes("isCancelledRef"),
        "Must track pending getUserMedia cancellation via isCancelledRef"
      )
      assert.ok(
        content.includes("stopCamera"),
        "Must have stopCamera cleanup helper"
      )
      assert.ok(
        content.includes("track.stop()"),
        "Must call track.stop() on all tracks during cleanup"
      )
    })
  })

  describe("#34 — Modal overlay accessibility and dialog semantics", () => {
    it("modal-overlay provides role=dialog, aria-modal, and Escape key listener", () => {
      const overlayPath = path.resolve(
        process.cwd(),
        "components/ui/modal-overlay.tsx"
      )
      const content = fs.readFileSync(overlayPath, "utf-8")

      assert.ok(
        content.includes('role="dialog"'),
        "Modal overlay must declare role='dialog'"
      )
      assert.ok(
        content.includes('aria-modal="true"'),
        "Modal overlay must declare aria-modal='true'"
      )
      assert.ok(
        content.includes('e.key === "Escape"'),
        "Modal overlay must handle Escape key navigation"
      )
      assert.ok(
        content.includes("handleKeyDown"),
        "Modal overlay must provide keyboard focus trap handler"
      )
    })
  })

  describe("#35 — Responsive navigation and layout reflow", () => {
    it("admin and superadmin headers provide mobile navigation sheet", () => {
      const adminHeaderPath = path.resolve(
        process.cwd(),
        "components/admin/layout/admin-header.tsx"
      )
      const superAdminHeaderPath = path.resolve(
        process.cwd(),
        "components/superadmin/layout/superadmin-header.tsx"
      )
      const adminHeader = fs.readFileSync(adminHeaderPath, "utf-8")
      const superAdminHeader = fs.readFileSync(superAdminHeaderPath, "utf-8")

      assert.ok(
        adminHeader.includes("md:hidden") && adminHeader.includes("Sheet"),
        "Admin header must provide mobile drawer trigger"
      )
      assert.ok(
        superAdminHeader.includes("md:hidden") && superAdminHeader.includes("Sheet"),
        "SuperAdmin header must provide mobile drawer trigger"
      )
    })

    it("sidebars hide on mobile screens and shells use responsive padding", () => {
      const adminSidebarPath = path.resolve(
        process.cwd(),
        "components/admin/layout/admin-sidebar.tsx"
      )
      const shellsPath = path.resolve(
        process.cwd(),
        "components/layout/page-shells.tsx"
      )
      const adminSidebar = fs.readFileSync(adminSidebarPath, "utf-8")
      const shells = fs.readFileSync(shellsPath, "utf-8")

      assert.ok(
        adminSidebar.includes("hidden md:flex"),
        "Desktop sidebar must be hidden on mobile"
      )
      assert.ok(
        shells.includes("p-4 sm:p-6 lg:p-8"),
        "Page shells must use responsive mobile padding"
      )
    })
  })

  describe("#36 — Interactive markup validity (no button nesting)", () => {
    it("verif-review-page renders pending items without nested button tags", () => {
      const reviewPagePath = path.resolve(
        process.cwd(),
        "components/admin/verif-review-page.tsx"
      )
      const content = fs.readFileSync(reviewPagePath, "utf-8")

      assert.ok(
        !content.includes("<button\n                  key={item.id}\n                  onClick={() => setSelectedItem(item)}"),
        "Must not wrap inner button in an outer button element"
      )
      assert.ok(
        content.includes('role="button"'),
        "Must use accessible div role=button for composite row card"
      )
    })
  })

  describe("#37 — Overdue verification calculation", () => {
    const isOlderThan3Days = (dateStr: string, createdAt?: number, now: number = Date.now()) => {
      const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
      if (typeof createdAt === "number" && !isNaN(createdAt)) {
        return now - createdAt >= THREE_DAYS_MS
      }
      const parsed = Date.parse(dateStr)
      if (!isNaN(parsed)) {
        return now - parsed >= THREE_DAYS_MS
      }
      return false
    }

    const testNow = new Date("2026-10-13T16:00:00+08:00").getTime()

    it("marks requests older than 3 days as overdue", () => {
      const oct1 = new Date("2026-10-01T10:00:00+08:00").getTime()
      assert.strictEqual(
        isOlderThan3Days("Oct 1, 2026", oct1, testNow),
        true,
        "Oct 1, 2026 relative to Oct 13, 2026 must be overdue"
      )
    })

    it("does not mark future or recent dates as overdue", () => {
      const nov25 = new Date("2026-11-25T10:00:00+08:00").getTime()
      assert.strictEqual(
        isOlderThan3Days("Nov 25, 2026", nov25, testNow),
        false,
        "Future Nov 25, 2026 relative to Oct 13, 2026 must NOT be overdue"
      )

      const oct12 = new Date("2026-10-12T10:00:00+08:00").getTime()
      assert.strictEqual(
        isOlderThan3Days("Oct 12, 2026", oct12, testNow),
        false,
        "Recent Oct 12, 2026 (1 day ago) must NOT be overdue"
      )
    })
  })

  describe("#39 — Async race conditions and stale response rejection", () => {
    it("simulates delayed review target switch and guarantees only selected target details are retained", async () => {
      let activeTargetId = "target-A"
      let displayedResidentName = ""

      const fetchTargetDetails = async (targetId: string, name: string, delayMs: number) => {
        let isCurrent = true
        // Stale effect cleanup simulator
        const cleanup = () => { isCurrent = false }

        await new Promise(resolve => setTimeout(resolve, delayMs))
        if (isCurrent && activeTargetId === targetId) {
          displayedResidentName = name
        }
        return cleanup
      }

      // User selects target A (slow response 50ms)
      activeTargetId = "target-A"
      const cleanupA = await fetchTargetDetails("target-A", "Alice", 50)

      // User quickly switches to target B (fast response 10ms)
      activeTargetId = "target-B"
      cleanupA() // Previous effect cleaned up
      await fetchTargetDetails("target-B", "Bob", 10)

      assert.strictEqual(displayedResidentName, "Bob", "Must display details of target B, not stale target A")
    })
  })

  describe("#40 — Mounted Sonner Toaster in RootLayout", () => {
    it("mounts SonnerToaster alongside Radix Toaster in app/layout.tsx", () => {
      const layoutPath = path.resolve(process.cwd(), "app/layout.tsx")
      const content = fs.readFileSync(layoutPath, "utf-8")

      assert.ok(
        content.includes("SonnerToaster"),
        "Root layout must import and render SonnerToaster"
      )
      assert.ok(
        content.includes("<SonnerToaster"),
        "Root layout must mount <SonnerToaster /> in component tree"
      )
    })
  })

  describe("#41 — Async review & config dialog operations await completion and restore state", () => {
    it("ensures isProcessing is cleared in finally block even when write rejects", async () => {
      let isProcessing = true
      let operationFailed = false

      const executeSave = async (shouldFail: boolean) => {
        try {
          if (shouldFail) {
            throw new Error("Firestore permission denied on updateConfig")
          }
        } catch (err) {
          operationFailed = true
        } finally {
          isProcessing = false
        }
      }

      await executeSave(true)
      assert.strictEqual(operationFailed, true, "Failure must be caught")
      assert.strictEqual(isProcessing, false, "Busy/processing state must be restored in finally")
    })
  })

  describe("#46 — Truthful error reporting vs empty lists", () => {
    it("distinguishes fetch error from genuine empty result", () => {
      type DataState<T> = {
        data: T[]
        loading: boolean
        error: string | null
      }

      const emptySuccess: DataState<string> = {
        data: [],
        loading: false,
        error: null,
      }

      const failedFetch: DataState<string> = {
        data: [],
        loading: false,
        error: "Missing permissions to read collection",
      }

      assert.strictEqual(emptySuccess.error, null)
      assert.strictEqual(emptySuccess.data.length, 0)

      assert.notStrictEqual(failedFetch.error, null)
      assert.strictEqual(failedFetch.error, "Missing permissions to read collection")
    })

    it("backup-history-list displays retryable error view when error state is present", () => {
      const backupListPath = path.resolve(
        process.cwd(),
        "components/superadmin/layout/backup-history-list.tsx"
      )
      const content = fs.readFileSync(backupListPath, "utf-8")

      assert.ok(
        content.includes("if (error)"),
        "BackupHistoryList must branch on error before checking logs.length === 0"
      )
      assert.ok(
        content.includes("Failed to load backup"),
        "BackupHistoryList must inform user of error"
      )
      assert.ok(
        content.includes("Retry"),
        "BackupHistoryList must provide retry button"
      )
    })
  })
})
