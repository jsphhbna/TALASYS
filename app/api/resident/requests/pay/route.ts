import { v2 as cloudinary } from "cloudinary"
import crypto from "node:crypto"
import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../../lib/firebase-admin.ts"
import { COLLECTION_DOCUMENT_REQUESTS, COLLECTION_NOTIFICATIONS } from "../../../../../lib/constants.ts"
import { mediaRegistryDocumentId, parseCloudinaryAsset } from "../../../../../lib/security/media-auth.ts"

type PayHandlerDependencies = {
  auth?: any
  db?: any
  cloudName?: string
  verifyCloudinaryAsset?: (publicId: string, deliveryType: string) => Promise<void>
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

export function paymentOperationDocumentId(callerUid: string, requestId: string, operationId: string): string {
  return crypto.createHash("sha256").update(`${callerUid}:${requestId}:${operationId}`).digest("hex")
}

export function paymentPayloadHash(params: {
  requestId: string
  paymentMethod: string
  gcashRefNumber: string
  gcashScreenshotUrl: string
}): string {
  const canonical = {
    requestId: params.requestId,
    paymentMethod: params.paymentMethod,
    gcashRefNumber: params.gcashRefNumber,
    gcashScreenshotUrl: params.gcashScreenshotUrl,
  }
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

export function createDefaultCloudinaryAssetVerifier() {
  const isE2E = process.env.TALASYS_E2E_MODE === "true" && Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  if (isE2E) {
    return async (_publicId: string, _deliveryType: string) => {}
  }

  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY || ""
  const apiSecret = process.env.CLOUDINARY_API_SECRET || ""

  if (!cloudName || !apiKey || !apiSecret) {
    throw httpError("Cloudinary verification service is not configured.", 503)
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })

  return async (publicId: string, deliveryType: string) => {
    try {
      const result = await cloudinary.api.resource(publicId, {
        resource_type: "image",
        type: deliveryType,
      })
      if (
        !result ||
        result.public_id !== publicId ||
        result.resource_type !== "image" ||
        result.type !== deliveryType
      ) {
        throw httpError("The uploaded payment screenshot could not be verified on Cloudinary.", 404)
      }
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 400 || err?.status === 403) throw err
      const httpCode = err?.error?.http_code || err?.status
      if (httpCode === 404 || err?.message?.toLowerCase().includes("not found")) {
        throw httpError("The uploaded payment screenshot does not exist on Cloudinary.", 404)
      }
      throw httpError("The uploaded payment screenshot could not be verified with the media provider.", 503)
    }
  }
}

export function createResidentPayHandler(injected?: PayHandlerDependencies) {
  return async function POST(req: Request) {
    try {
      const auth = injected?.auth || adminAuth
      const db = injected?.db || adminDb
      const cloudName = injected?.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""

      if (!auth || !db) {
        throw httpError("Server payment processing service is unavailable. Missing Firebase Admin configuration.", 503)
      }

      const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
      if (!authHeader?.startsWith("Bearer ")) {
        throw httpError("Unauthorized: Missing authentication token.", 401)
      }

      const token = authHeader.replace("Bearer ", "").trim()
      let decodedToken: any
      try {
        decodedToken = await auth.verifyIdToken(token, true)
      } catch {
        throw httpError("Unauthorized: Session invalid or expired. Please sign in again.", 401)
      }

      const callerUid = decodedToken.uid

      // Verify active resident account in users collection
      const callerDoc = await db.collection("users").doc(callerUid).get()
      if (!callerDoc.exists) {
        throw httpError("Resident account record not found in system.", 403)
      }

      const callerData = callerDoc.data() || {}
      const callerRole = callerData.role as string | undefined
      const callerStatus = callerData.status as string | undefined

      if (callerRole !== "resident") {
        throw httpError("Only residents may submit payment for document requests.", 403)
      }

      if (
        callerData.registrationDenied ||
        Boolean(callerData.deniedAt) ||
        callerStatus === "Locked" ||
        callerStatus === "Deleted" ||
        callerStatus === "Deleted by Resident" ||
        callerStatus === "Expired"
      ) {
        throw httpError("Account is inactive, expired, locked, or registration was denied. Payment forbidden.", 403)
      }

      const body = await req.json().catch(() => ({}))
      const { requestId, paymentMethod, gcashRefNumber, gcashScreenshotUrl } = body

      if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
        throw httpError("A valid requestId is required.", 400)
      }

      if (paymentMethod !== "gcash" && paymentMethod !== "cash") {
        throw httpError("Invalid payment method. Allowed methods: gcash, cash.", 400)
      }

      let sanitizedGcashRef = ""
      let sanitizedScreenshotUrl = ""

      if (paymentMethod === "cash") {
        if (gcashRefNumber && String(gcashRefNumber).trim() !== "") {
          throw httpError("Cash payments must not provide a GCash reference number.", 400)
        }
        if (gcashScreenshotUrl && String(gcashScreenshotUrl).trim() !== "") {
          throw httpError("Cash payments must not provide a payment screenshot.", 400)
        }
      } else {
        // GCash payment validation
        if (!gcashRefNumber || typeof gcashRefNumber !== "string" || !gcashRefNumber.trim()) {
          throw httpError("A valid GCash reference number is required for GCash payments.", 400)
        }
        sanitizedGcashRef = gcashRefNumber.trim()

        if (gcashScreenshotUrl && typeof gcashScreenshotUrl === "string" && gcashScreenshotUrl.trim() !== "") {
          sanitizedScreenshotUrl = gcashScreenshotUrl.trim()

          // 1. URL host and scheme validation
          if (!/^https?:\/\/res\.cloudinary\.com\//i.test(sanitizedScreenshotUrl)) {
            throw httpError("Payment screenshot must be a valid Cloudinary asset URL.", 400)
          }

          if (!cloudName) {
            throw httpError("Cloudinary verification service is not configured.", 503)
          }

          const parsed = parseCloudinaryAsset(sanitizedScreenshotUrl)

          // 2. Cloudinary account matching
          if (!parsed.cloudName || parsed.cloudName !== cloudName) {
            throw httpError("Payment screenshot cloud account does not match the configured provider.", 403)
          }

          // 3. Resource type matching
          if (parsed.resourceType !== "image") {
            throw httpError("Payment screenshot must be an image resource.", 400)
          }

          // 4. Delivery type matching
          if (parsed.deliveryType !== "authenticated") {
            throw httpError("Payment screenshot must use authenticated delivery.", 400)
          }

          // 5. Public ID namespace & path traversal check
          const expectedPrefix = `talasys/receipts/${callerUid}/`
          if (!parsed.publicId.startsWith(expectedPrefix)) {
            throw httpError("Payment screenshot must be an authenticated asset owned by this resident.", 403)
          }
          if (parsed.publicId.includes("..") || parsed.publicId.includes("//")) {
            throw httpError("Malformed public ID in payment screenshot.", 400)
          }

          // 6. Authoritative verification against mediaRegistry
          const assetRegistryKey = mediaRegistryDocumentId(cloudName, "image", parsed.publicId)
          const registryDoc = await db.collection("mediaRegistry").doc(assetRegistryKey).get()

          if (!registryDoc.exists) {
            throw httpError("Payment receipt asset is not registered in the media registry.", 404)
          }

          const reg = registryDoc.data() || {}
          if (reg.cloudName !== cloudName) {
            throw httpError("Payment receipt asset cloud name mismatch in media registry.", 403)
          }
          if (reg.publicId !== parsed.publicId) {
            throw httpError("Payment receipt asset public ID mismatch in media registry.", 400)
          }
          if (reg.resourceType !== "image") {
            throw httpError("Payment receipt asset resource type mismatch in media registry.", 400)
          }
          if (reg.deliveryType !== "authenticated") {
            throw httpError("Payment receipt asset delivery type mismatch in media registry.", 400)
          }
          if (reg.folder !== "talasys/receipts") {
            throw httpError("Payment receipt asset folder mismatch in media registry.", 400)
          }
          if (reg.ownerUid !== callerUid) {
            throw httpError("Payment receipt asset is not owned by the authenticated resident.", 403)
          }

          // 7. Status and expiration validation
          if (reg.status !== "claimed") {
            throw httpError("Payment receipt asset is not in a valid claimed status.", 403)
          }
          if (Number.isFinite(reg.expiresAt) && Date.now() > Number(reg.expiresAt)) {
            throw httpError("Payment receipt asset reservation has expired.", 410)
          }

          // 8. Live provider verification uses validated canonical identity
          const verifyAsset = injected?.verifyCloudinaryAsset || createDefaultCloudinaryAssetVerifier()
          await verifyAsset(parsed.publicId, parsed.deliveryType)
        }
      }

      // Extract or derive operation identity (SEC-F05)
      const candidateKey = body.idempotencyKey || body.operationId
      let operationId: string
      if (candidateKey !== undefined && candidateKey !== null && String(candidateKey).trim() !== "") {
        const trimmedKey = String(candidateKey).trim()
        if (!/^[A-Za-z0-9_-]{16,80}$/.test(trimmedKey)) {
          throw httpError("A valid idempotencyKey or operationId (16-80 alphanumeric characters, hyphens, or underscores) is required.", 400)
        }
        operationId = trimmedKey
      } else {
        const contentDigest = crypto.createHash("sha256").update(
          [callerUid, requestId.trim(), paymentMethod, sanitizedGcashRef, sanitizedScreenshotUrl].join(":")
        ).digest("hex").slice(0, 32)
        operationId = `pay_${contentDigest}`
      }

      const payloadHash = paymentPayloadHash({
        requestId: requestId.trim(),
        paymentMethod,
        gcashRefNumber: sanitizedGcashRef,
        gcashScreenshotUrl: sanitizedScreenshotUrl,
      })

      const operationDocId = paymentOperationDocumentId(callerUid, requestId.trim(), operationId)
      const operationRef = db.collection("paymentOperations").doc(operationDocId)
      const notifRef = db.collection(COLLECTION_NOTIFICATIONS).doc(`pay_${operationDocId}`)
      const requestRef = db.collection(COLLECTION_DOCUMENT_REQUESTS).doc(requestId.trim())

      const result = await db.runTransaction(async (transaction: any) => {
        // 1. Check existing payment operation for idempotency
        const opDoc = await transaction.get(operationRef)
        if (opDoc.exists) {
          const existingOp = opDoc.data() || {}
          if (existingOp.payloadHash !== payloadHash) {
            throw httpError("This payment operation was already submitted with different payment details.", 409)
          }
          if (existingOp.status === "completed") {
            return {
              success: true,
              requestId: requestId.trim(),
              paymentStatus: "pending_verification",
              paymentMethod,
              idempotent: true,
            }
          }
          throw httpError("Payment operation is in an incomplete state.", 409)
        }

        // 2. Fetch document request
        const reqDoc = await transaction.get(requestRef)
        if (!reqDoc.exists) {
          throw httpError("Document request not found.", 404)
        }

        const reqData = reqDoc.data() || {}
        if (reqData.residentId !== callerUid) {
          throw httpError("You do not have permission to submit payment for this request.", 403)
        }

        const allowedStatuses = ["Pending", "Approved", "On Process"]
        if (!allowedStatuses.includes(reqData.status)) {
          throw httpError(`Payment submission is not permitted for requests in status: ${reqData.status}.`, 400)
        }

        // Avoid overwriting a payment already confirmed as paid or waived
        if (reqData.paymentStatus === "paid") {
          throw httpError("This request is not eligible for payment submission: already paid and verified.", 400)
        }
        if (reqData.paymentStatus === "waived") {
          throw httpError("This request is not eligible for payment submission: fees waived and does not require payment.", 400)
        }
        if (reqData.paymentStatus && !["unpaid", "pending_verification"].includes(reqData.paymentStatus)) {
          throw httpError(`This request is not eligible for payment submission (current payment status: ${reqData.paymentStatus}).`, 400)
        }

        const now = Date.now()
        const updatePayload: Record<string, any> = {
          paymentStatus: "pending_verification",
          paymentMethod,
          paymentSubmittedAt: now,
          gcashRefNumber: paymentMethod === "gcash" ? sanitizedGcashRef : "",
          gcashScreenshotUrl: paymentMethod === "gcash" ? sanitizedScreenshotUrl : "",
          lastPaymentOperationId: operationId,
        }

        transaction.update(requestRef, updatePayload)

        // Record operation record in paymentOperations
        transaction.set(operationRef, {
          operationId,
          callerUid,
          requestId: requestId.trim(),
          paymentMethod,
          gcashRefNumber: paymentMethod === "gcash" ? sanitizedGcashRef : "",
          gcashScreenshotUrl: paymentMethod === "gcash" ? sanitizedScreenshotUrl : "",
          payloadHash,
          status: "completed",
          notificationId: notifRef.id,
          createdAt: now,
        })

        // Atomically create admin notification with deterministic ID
        transaction.set(notifRef, {
          targetId: "admin",
          type: "info",
          title: "Payment Submitted",
          message: `${callerData.name || "A resident"} submitted a ${paymentMethod === "gcash" ? "GCash" : "Cash"} payment for review.`,
          timestamp: "Just now",
          isRead: false,
          createdAt: now,
          residentName: callerData.name || "Resident",
          actionUrl: "/admin/requests/payments",
          operationId,
          requestId: requestId.trim(),
        })

        return {
          success: true,
          requestId: requestId.trim(),
          paymentStatus: "pending_verification",
          paymentMethod,
          idempotent: false,
        }
      })

      return NextResponse.json(result)
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : 500
      return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status })
    }
  }
}

export const POST = createResidentPayHandler()
