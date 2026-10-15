import { registrationOperationDocumentId } from "./registration-finalization.ts"

export type RegistrationStatusType =
  | "completed"
  | "incomplete"
  | "rejected"
  | "denied"
  | "existing-resident"

export type RegistrationStatusResponse = {
  status: RegistrationStatusType
  uid: string
  email: string
  emailVerified: boolean
  operationId?: string
  denialReason?: string
  details?: {
    isVerified?: boolean
    accountStatus?: string
    verificationStatus?: string
    rejectionReason?: string
    denialReason?: string
    verificationId?: string
  }
}

export async function inspectRegistrationStatus(
  callerUid: string,
  authEmail: string,
  emailVerified: boolean,
  dependencies: {
    db: any
    operationId?: string | null
  },
): Promise<RegistrationStatusResponse> {
  const { db, operationId } = dependencies

  // 1. Inspect authoritative users/{callerUid} record FIRST (D02)
  const userDoc = await db.collection("users").doc(callerUid).get()
  if (userDoc.exists) {
    const userData = userDoc.data() || {}
    const role = userData.role || "resident"
    const accountStatus = userData.status || "Pending"
    const isVerified = userData.isVerified === true

    // Check if user account was permanently denied or soft-deleted
    if (userData.registrationDenied || Boolean(userData.deniedAt) || accountStatus === "Deleted") {
      return {
        status: "denied",
        uid: callerUid,
        email: authEmail,
        emailVerified,
        denialReason: userData.denialReason || "",
        details: {
          isVerified: false,
          accountStatus,
          verificationStatus: "denied",
          denialReason: userData.denialReason || "",
        },
      }
    }

    // Check if user is an existing verified/active resident or administrative role
    if (role !== "resident" || isVerified || accountStatus === "Active") {
      return {
        status: "existing-resident",
        uid: callerUid,
        email: authEmail,
        emailVerified,
        details: {
          isVerified,
          accountStatus,
        },
      }
    }

    // Inspect verifications for this resident
    const verificationsSnapshot = await db
      .collection("verifications")
      .where("residentId", "==", callerUid)
      .get()

    if (!verificationsSnapshot.empty) {
      const docs = verificationsSnapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }))
      docs.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
      const latest = docs[0]

      if (latest.status === "denied") {
        return {
          status: "denied",
          uid: callerUid,
          email: authEmail,
          emailVerified,
          details: {
            isVerified: false,
            accountStatus,
            verificationStatus: "denied",
            denialReason: latest.denialReason || userData.denialReason || "",
          },
        }
      }

      if (latest.status === "rejected") {
        return {
          status: "rejected",
          uid: callerUid,
          email: authEmail,
          emailVerified,
          details: {
            isVerified: false,
            accountStatus,
            verificationStatus: "rejected",
            rejectionReason: latest.rejectionReason || "",
          },
        }
      }

      if (latest.status === "pending") {
        return {
          status: "completed",
          uid: callerUid,
          email: authEmail,
          emailVerified,
          ...(operationId ? { operationId } : {}),
          details: {
            isVerified: false,
            accountStatus,
            verificationStatus: "pending",
            verificationId: latest.id,
          },
        }
      }

      if (latest.status === "approved") {
        return {
          status: "existing-resident",
          uid: callerUid,
          email: authEmail,
          emailVerified,
          details: {
            isVerified: true,
            accountStatus,
            verificationStatus: "approved",
          },
        }
      }
    }

    // User doc exists with status Pending/unverified
    return {
      status: "completed",
      uid: callerUid,
      email: authEmail,
      emailVerified,
      ...(operationId ? { operationId } : {}),
      details: {
        isVerified: false,
        accountStatus,
      },
    }
  }

  // 2. User document does NOT exist.
  // Check operation document if operationId was provided (recovery before Firestore profile finalization)
  if (operationId && /^[A-Za-z0-9_-]{16,80}$/.test(operationId)) {
    const opDoc = await db
      .collection("registrationOperations")
      .doc(registrationOperationDocumentId(callerUid, operationId))
      .get()
    if (opDoc.exists) {
      const opData = opDoc.data() || {}
      if (opData.status === "completed") {
        return {
          status: "completed",
          uid: callerUid,
          email: authEmail,
          emailVerified,
          operationId,
        }
      }
    }
  }

  // Check if any completed registration operations exist for this caller
  const anyOpsSnapshot = await db
    .collection("registrationOperations")
    .where("uid", "==", callerUid)
    .limit(1)
    .get()

  if (!anyOpsSnapshot.empty) {
    const opData = anyOpsSnapshot.docs[0].data() || {}
    if (opData.status === "completed") {
      return {
        status: "completed",
        uid: callerUid,
        email: authEmail,
        emailVerified,
        operationId: opData.operationId,
      }
    }
  }

  // 3. Incomplete registration: Auth account exists, but no user or verification profile committed
  return {
    status: "incomplete",
    uid: callerUid,
    email: authEmail,
    emailVerified,
  }
}
