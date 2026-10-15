import { registrationOperationDocumentId } from "./registration-finalization.ts"

export type RegistrationStatusType =
  | "completed"
  | "incomplete"
  | "rejected"
  | "existing-resident"

export type RegistrationStatusResponse = {
  status: RegistrationStatusType
  uid: string
  email: string
  emailVerified: boolean
  operationId?: string
  details?: {
    isVerified?: boolean
    accountStatus?: string
    verificationStatus?: string
    rejectionReason?: string
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

  // 1. Check operation document if operationId was provided
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

  // 2. Inspect authoritative users/{callerUid} record
  const userDoc = await db.collection("users").doc(callerUid).get()
  if (userDoc.exists) {
    const userData = userDoc.data() || {}
    const role = userData.role || "resident"
    const accountStatus = userData.status || "Pending"
    const isVerified = userData.isVerified === true

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
      details: {
        isVerified: false,
        accountStatus,
      },
    }
  }

  // 3. User document does NOT exist.
  // Check if any registration operations exist for this caller
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

  // 4. Incomplete registration: Auth account exists, but no user or verification profile committed
  return {
    status: "incomplete",
    uid: callerUid,
    email: authEmail,
    emailVerified,
  }
}
