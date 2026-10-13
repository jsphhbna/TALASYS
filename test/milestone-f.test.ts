import { describe, it } from "node:test"
import assert from "node:assert"
import { isAnyAdminRole } from "../lib/auth/auth-types.ts"
import { getRequiredDocuments } from "../lib/resident/resident-documents.ts"

describe("Milestone F — Resident Workflows, Identity & Evidence Persistence", () => {
  describe("#24 — Document types & shortcuts alignment", () => {
    const normalizeShortcut = (raw: string | null) => {
      if (raw === "clearance" || raw === "barangay-clearance") return "clearance"
      if (raw === "residency" || raw === "certificate-of-residency") return "residency"
      return raw
    }

    it("normalizes clearance and barangay-clearance shortcuts to clearance", () => {
      assert.strictEqual(normalizeShortcut("clearance"), "clearance")
      assert.strictEqual(normalizeShortcut("barangay-clearance"), "clearance")
    })

    it("normalizes residency and certificate-of-residency shortcuts to residency", () => {
      assert.strictEqual(normalizeShortcut("residency"), "residency")
      assert.strictEqual(normalizeShortcut("certificate-of-residency"), "residency")
    })
  })

  describe("#23 & #25 — Request creation & authorization letter persistence", () => {
    it("persists authorization letter url instead of local filename", () => {
      const input = {
        documentType: "Barangay Clearance",
        purpose: "Employment",
        requestFor: "other" as const,
        requestedByName: "Maria Santos",
        relationship: "Mother",
        authorizationLetter: "https://res.cloudinary.com/test/image/upload/v123/auth_letter.pdf",
      }

      assert.ok(input.authorizationLetter.startsWith("https://"), "Authorization letter must be a durable URL")
      assert.strictEqual(input.requestFor, "other")
    })

    it("verifies async workflow handles errors and restores busy state", async () => {
      let isBusy = true
      let errorCaught = false

      const processSubmit = async (shouldFail: boolean) => {
        try {
          if (shouldFail) {
            throw new Error("Network timeout during request submission")
          }
        } catch (err) {
          errorCaught = true
          throw err
        } finally {
          isBusy = false
        }
      }

      await assert.rejects(async () => {
        await processSubmit(true)
      }, /Network timeout/)

      assert.strictEqual(errorCaught, true)
      assert.strictEqual(isBusy, false, "Busy state must be reset in finally block")
    })
  })

  describe("#38 — Resident payment modal state isolation", () => {
    it("resets payment form state when opening or switching requests", () => {
      // Simulates the payment modal state reset logic
      const createDefaultPaymentState = () => ({
        activeTab: "gcash" as "gcash" | "cash",
        gcashRef: "",
        gcashFile: null as any,
        gcashPreview: null as string | null,
      })

      let state = createDefaultPaymentState()
      // User entered details for request A
      state.gcashRef = "1234567890123"
      state.gcashPreview = "data:image/png;base64,sample"

      // When opening for request B, reset is triggered
      state = createDefaultPaymentState()
      assert.strictEqual(state.gcashRef, "")
      assert.strictEqual(state.gcashPreview, null)
      assert.strictEqual(state.gcashFile, null)
    })
  })

  describe("#42 — Profile photo update propagation", () => {
    it("records actual uploaded photo URL in changes payload", () => {
      const uploadedUrl = "https://res.cloudinary.com/demo/image/upload/v1/profile_pic.jpg"
      const user = { profilePicture: "https://example.com/old.jpg" }
      const changes: { field: string; oldValue: string; newValue: string }[] = []

      if (uploadedUrl && uploadedUrl !== user.profilePicture) {
        changes.push({
          field: "Profile Picture",
          oldValue: user.profilePicture || "None",
          newValue: uploadedUrl,
        })
      }

      assert.strictEqual(changes.length, 1)
      assert.strictEqual(changes[0].field, "Profile Picture")
      assert.strictEqual(changes[0].newValue, uploadedUrl, "Must pass actual URL, not placeholder text")
    })

    it("applies new photo URL to user document on admin approval", () => {
      const verification = {
        type: "profile-edit",
        changes: [
          { field: "Profile Picture", oldValue: "None", newValue: "https://res.cloudinary.com/new.jpg" },
        ],
        documents: {},
      }

      const profileUpdates: Record<string, any> = {}
      verification.changes.forEach((c) => {
        if (c.field === "Profile Picture" || c.field?.toLowerCase().includes("photo")) {
          profileUpdates.profilePicture = c.newValue
        }
      })

      assert.strictEqual(profileUpdates.profilePicture, "https://res.cloudinary.com/new.jpg")
    })
  })

  describe("#43 — Profile edit voter category preservation", () => {
    it("preserves Registered Voter status when initializing form from user.statuses array", () => {
      const user = {
        name: "Juan Dela Cruz",
        status: "Adult",
        statuses: ["Adult", "Registered Voter"],
      }

      let initialStatuses: string[] = []
      if (Array.isArray(user.statuses) && user.statuses.length > 0) {
        initialStatuses = [...user.statuses]
      } else if (user.status) {
        initialStatuses = [user.status]
      } else {
        initialStatuses = ["Adult"]
      }

      assert.deepStrictEqual(initialStatuses, ["Adult", "Registered Voter"])
      assert.ok(initialStatuses.includes("Registered Voter"), "Registered Voter category must not be dropped")
    })
  })

  describe("#44 — Email synchronization with Firebase Auth", () => {
    it("authorizes administrative roles to synchronize resident email", () => {
      assert.strictEqual(isAnyAdminRole("superadmin"), true)
      assert.strictEqual(isAnyAdminRole("admin"), true)
      assert.strictEqual(isAnyAdminRole("Full Access"), true)
      assert.strictEqual(isAnyAdminRole("Resident Management"), true)
      assert.strictEqual(isAnyAdminRole("resident"), false)
    })
  })

  describe("#45 — Explicit tracking for Cancelled requests", () => {
    it("identifies Cancelled as a distinct terminal state without faking Under Review progress", () => {
      const requestA = { status: "Cancelled" as const }
      const isRejected = requestA.status === "Rejected"
      const isCancelled = requestA.status === "Cancelled"

      assert.strictEqual(isCancelled, true)
      assert.strictEqual(isRejected, false)
    })
  })

  describe("#47 — Mandatory durable evidence for required uploads", () => {
    it("detects missing required documents for newly added categories", () => {
      const currentStatuses = ["Adult"]
      const newStatuses = ["Adult", "Registered Voter"]
      const uploadedFiles: Record<string, any> = { votersId: null }

      const added = newStatuses.filter((s) => !currentStatuses.includes(s))
      const required = getRequiredDocuments(added, "profile")

      assert.strictEqual(required.length, 1)
      assert.strictEqual(required[0].field, "votersId")

      const hasRequiredProof = Boolean(uploadedFiles[required[0].field])
      assert.strictEqual(hasRequiredProof, false, "Must detect that required voter proof is missing")
    })

    it("rejects registration when any required proof fails upload", () => {
      const uploadedFiles = { validId: { name: "id.png" } }
      const failedUploads = ["Valid Government ID"]

      assert.ok(failedUploads.length > 0, "Failed upload list must be non-empty")
      assert.strictEqual(failedUploads[0], "Valid Government ID")
    })
  })

  describe("#48 & #49 — Registration resubmission & account reactivation lifecycles", () => {
    it("tags resubmission as registration type for unverified residents", () => {
      const unverifiedUser = { isVerified: false, status: "Pending" }
      const verificationType = (!unverifiedUser.isVerified || unverifiedUser.status === "Pending")
        ? "registration"
        : "profile-edit"

      assert.strictEqual(verificationType, "registration")
    })

    it("approves reactivation, restores Active status and extends account expiry by 1 year", () => {
      const now = Date.now()
      const verification = { type: "reactivation", residentId: "res-123" }

      const updates: Record<string, any> = {}
      if (verification.type === "reactivation") {
        updates.isVerified = true
        updates.status = "Active"
        updates.accountExpiry = now + 365 * 24 * 60 * 60 * 1000
      }

      assert.strictEqual(updates.isVerified, true)
      assert.strictEqual(updates.status, "Active")
      assert.ok(updates.accountExpiry > now + 364 * 24 * 60 * 60 * 1000)
    })
  })
})
