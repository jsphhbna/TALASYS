"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/lib/auth"
import { db, auth } from "@/lib/firebase"
import { collection, query, where, onSnapshot, orderBy, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, limit, writeBatch } from "firebase/firestore"
import {
  type CreateResidentRequestInput,
  type ResidentNotification,
  type ResidentProofDocument,
  type ResidentRequest,
} from "@/lib/resident"
import {
  getOrGenerateResubmissionOperationId,
  clearResubmissionOperationId,
} from "@/lib/resident/resubmission-operation"
import { uploadFileToCloudinary } from "@/lib/resident/cloudinary"
import {
  COLLECTION_DOCUMENT_REQUESTS,
  COLLECTION_NOTIFICATIONS,
  COLLECTION_VERIFICATIONS,
  COLLECTION_USERS,
  COLLECTION_SYSTEM_CONFIG,
  SYSTEM_CONFIG_DOCUMENT_ID,
} from "@/lib/constants"

export function useResidentData() {
  const { user } = useAuth()
  const residentId = user?.role === "resident" ? user.id : null

  const [requests, setRequests] = useState<ResidentRequest[]>([])
  const [notifications, setNotifications] = useState<ResidentNotification[]>([])
  const [proofs, setProofs] = useState<ResidentProofDocument[]>([])
  const [verification, setVerification] = useState<any | null>(null)
  const [systemConfig, setSystemConfig] = useState<any | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshCounter, setRefreshCounter] = useState(0)

  useEffect(() => {
    if (!residentId) {
      setRequests([])
      setNotifications([])
      setProofs([])
      setIsLoaded(true)
      return
    }

    const sourcesLoaded = new Set<string>()
    const checkReady = (key: string) => {
      sourcesLoaded.add(key)
      if (sourcesLoaded.size >= 4) {
        setIsLoaded(true)
      }
    }

    const documentRequestsQuery = query(collection(db, COLLECTION_DOCUMENT_REQUESTS), where("residentId", "==", residentId))
    const unsubscribeRequests = onSnapshot(documentRequestsQuery, (snapshot) => {
      const documentRequests = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as ResidentRequest))
      documentRequests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      setRequests(documentRequests)
      checkReady("requests")
    }, (err) => {
      console.error("documentRequests snapshot error in resident hook:", err)
      setError(err.message || "Failed to load requests")
      setIsLoaded(true)
    })

    const notificationsQuery = query(collection(db, COLLECTION_NOTIFICATIONS), where("targetId", "==", residentId))
    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const residentNotifications = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as ResidentNotification))
      residentNotifications.sort((a, b) => {
        const timestampA = typeof a.createdAt === 'number' ? a.createdAt : 0
        const timestampB = typeof b.createdAt === 'number' ? b.createdAt : 0
        return timestampB - timestampA
      })
      setNotifications(residentNotifications)
      checkReady("notifications")
    }, (err) => {
      console.error("notifications snapshot error in resident hook:", err)
      setError(err.message || "Failed to load notifications")
      setIsLoaded(true)
    })

    const verificationsQuery = query(collection(db, COLLECTION_VERIFICATIONS), where("residentId", "==", residentId))
    const unsubscribeVerifications = onSnapshot(verificationsQuery, (snapshot) => {
      if (!snapshot.empty) {
        const allVerifications = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as any))
        allVerifications.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        
        const latestVerification = allVerifications[0]
        setVerification(latestVerification)
        
        const aggregatedDocs = new Map<string, any>()
        
        // Traverse from oldest to newest to aggregate documents and track their latest status
        for (let i = allVerifications.length - 1; i >= 0; i--) {
          const v = allVerifications[i]
          if (v.documents) {
            v.documents.forEach((doc: any) => {
              // Status follows the verification request status
              const status = v.status === "approved" ? "Valid" : (v.status === "rejected" ? "Rejected" : "Pending")
              aggregatedDocs.set(doc.name, { ...doc, status })
            })
          }
        }
        
        const mergedProofs = Array.from(aggregatedDocs.values()).map((proofDocument: any, index: number) => ({
          id: `proof-${residentId}-${index}`,
          name: proofDocument.name,
          filename: proofDocument.name,
          url: proofDocument.url,
          uploadDate: proofDocument.uploadDate || "N/A",
          status: proofDocument.status,
        }))
        
        setProofs(mergedProofs)
      } else {
        setVerification(null)
        setProofs([])
      }
      checkReady("verifications")
    }, (err) => {
      console.error("verifications snapshot error in resident hook:", err)
      setError(err.message || "Failed to load verifications")
      setIsLoaded(true)
    })

    const unsubscribeConfig = onSnapshot(doc(db, COLLECTION_SYSTEM_CONFIG, SYSTEM_CONFIG_DOCUMENT_ID), (snapshot) => {
      if (snapshot.exists()) setSystemConfig(snapshot.data())
      checkReady("config")
    }, (err) => {
      console.error("config snapshot error in resident hook:", err)
      setError(err.message || "Failed to load system config")
      setIsLoaded(true)
    })

    return () => {
      unsubscribeRequests()
      unsubscribeNotifications()
      unsubscribeVerifications()
      unsubscribeConfig()
    }
  }, [residentId, refreshCounter])

  const refresh = useCallback(() => {
    setError(null)
    setIsLoaded(false)
    setRefreshCounter(c => c + 1)
  }, [])

  const cancelRequest = useCallback(
    async (requestId: string) => {
      try {
        await updateDoc(doc(db, COLLECTION_DOCUMENT_REQUESTS, requestId), {
          status: "Cancelled",
          cancelledAt: Date.now()
        })
      } catch (error) {
        console.error("Error cancelling document request (id:", requestId, "):", error)
      }
    },
    []
  )

  const addRequest = useCallback(
    async (input: CreateResidentRequestInput) => {
      if (!residentId || !user) return null

      const token = await auth.currentUser?.getIdToken()
      if (!token) {
        throw new Error("You must be signed in to submit a document request.")
      }

      const idempotencyStorageKey = `talasys.request.idempotency.${residentId}.${input.documentType}.${input.requestFor || "myself"}`
      let idempotencyKey = typeof window !== "undefined" ? window.sessionStorage.getItem(idempotencyStorageKey) : null
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID()
        if (typeof window !== "undefined") window.sessionStorage.setItem(idempotencyStorageKey, idempotencyKey)
      }

      const res = await fetch("/api/resident/requests/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          documentType: input.documentType,
          purpose: input.purpose,
          requestFor: input.requestFor,
          requestedByName: input.requestedByName,
          requestedByContact: input.requestedByContact,
          relationship: input.relationship,
          authorizationLetter: input.authorizationLetter,
          paymentMethod: input.paymentMethod,
          gcashRefNumber: input.gcashRefNumber,
          gcashScreenshotUrl: input.gcashScreenshotUrl,
          idempotencyKey,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to create document request.")
      }

      const data = await res.json()
      if (typeof window !== "undefined") window.sessionStorage.removeItem(idempotencyStorageKey)
      return data.request
    },
    [residentId, user]
  )

  const submitPayment = useCallback(
    async (requestId: string, method: "gcash" | "cash", data: { gcashRefNumber?: string; gcashScreenshotUrl?: string }) => {
      if (!residentId) return
      await updateDoc(doc(db, COLLECTION_DOCUMENT_REQUESTS, requestId), {
        paymentStatus: "pending_verification",
        paymentMethod: method,
        ...(method === "gcash" ? {
          gcashRefNumber: data.gcashRefNumber || "",
          gcashScreenshotUrl: data.gcashScreenshotUrl || "",
        } : {}),
        paymentSubmittedAt: Date.now()
      })
      await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
        targetId: "admin",
        type: "info",
        title: "Payment Submitted",
        message: `${user?.name} submitted a ${method === "gcash" ? "GCash" : "Cash"} payment for review.`,
        timestamp: "Just now",
        isRead: false,
        createdAt: Date.now(),
        residentName: user?.name,
        actionUrl: "/admin/requests/payments"
      })
    },
    [residentId, user]
  )

  const isSubmittingProfileEditRef = useRef(false)

  const requestProfileEdit = useCallback(
    async (
      changes: { field: string; oldValue: string; newValue: string }[], 
      reason: string, 
      uploadedFiles: any, 
      newProfilePicture?: string,
      verificationType: "profile-edit" | "registration" = "profile-edit"
    ) => {
      if (!residentId || !user) return null
      if (isSubmittingProfileEditRef.current) {
        throw new Error("A request submission is already in progress.")
      }
      isSubmittingProfileEditRef.current = true

      try {
        const uploadedDocuments: any[] = []

        const uploadAndCollectDocument = async (file: File | null, documentName: string) => {
          if (!file) return
          const uploadedUrl = await uploadFileToCloudinary(file, { folder: "talasys/proofs" })
          if (!uploadedUrl) {
            throw new Error(`Failed to upload ${documentName}`)
          }
          uploadedDocuments.push({
            name: documentName,
            url: uploadedUrl,
            status: "pending",
            uploadDate: new Date().toLocaleDateString('en-US')
          })
        }

        await Promise.all([
          uploadAndCollectDocument(uploadedFiles.validId, "Valid ID"),
          uploadAndCollectDocument(uploadedFiles.parentId, "Parent's ID"),
          uploadAndCollectDocument(uploadedFiles.seniorId, "Senior Citizen ID"),
          uploadAndCollectDocument(uploadedFiles.votersId, "Voter's ID"),
        ])

        if (newProfilePicture) {
          uploadedDocuments.push({
            name: "New Profile Picture",
            url: newProfilePicture,
            status: "pending",
            uploadDate: new Date().toLocaleDateString('en-US')
          })
        }

        if (verification && verification.status === "pending") {
          clearResubmissionOperationId(residentId)
          return verification.id
        }

        // Finding #48 / Issue #3 / R12: If resident was never verified or explicit registration type,
        // route through the server-authoritative resubmission endpoint with stable operation ID.
        if (!user.isVerified || verificationType === "registration") {
          const { auth } = await import("@/lib/firebase")
          const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : ""
          if (!idToken) throw new Error("Authentication session is required to resubmit registration.")

          const resubmitReason = reason || "Registration verification resubmission with updated documents"
          const { operationId } = getOrGenerateResubmissionOperationId(residentId, uploadedDocuments, resubmitReason)

          const response = await fetch("/api/resident/registration/resubmit", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              operationId,
              proofs: uploadedDocuments,
              reason: resubmitReason,
            }),
          })

          const result = await response.json().catch(() => ({}))
          if (!response.ok || !result.success) {
            if (result.code === "PENDING_VERIFICATION_EXISTS") {
              clearResubmissionOperationId(residentId)
              if (verification && verification.status === "pending") {
                return verification.id
              }
            }
            throw new Error(result.error || "Failed to resubmit registration verification.")
          }

          clearResubmissionOperationId(residentId)
          return result.verificationId
        }

        const verificationPayload = {
          residentId,
          userId: residentId,
          name: user.name,
          initials: user.initials,
          type: "profile-edit",
          submittedDate: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
          status: "pending",
          categories: user.statuses || ["Resident"],
          changes,
          reason,
          documents: uploadedDocuments,
          createdAt: Date.now()
        }

        const batch = writeBatch(db)
        const verifDocRef = doc(collection(db, COLLECTION_VERIFICATIONS))
        const notifDocRef = doc(collection(db, COLLECTION_NOTIFICATIONS))

        batch.set(verifDocRef, verificationPayload)
        batch.set(notifDocRef, {
          targetId: "admin",
          type: "info",
          title: "Profile Edit Request",
          message: `${user.name} submitted a profile edit request.`,
          timestamp: "Just now",
          isRead: false,
          createdAt: Date.now(),
          residentName: user.name,
          actionUrl: "/admin/verifications"
        })

        await batch.commit()
        return verifDocRef.id
      } finally {
        isSubmittingProfileEditRef.current = false
      }
    },
    [residentId, user, verification]
  )

  // Finding #49: Validated reactivation request with required evidence and admin notification
  const requestReactivation = useCallback(
    async (reason: string, uploadedFiles: any) => {
      if (!residentId || !user) return null

      const uploadedDocuments: any[] = []
      const uploadAndCollectDocument = async (file: File | null, documentName: string) => {
        if (!file) return
        const uploadedUrl = await uploadFileToCloudinary(file, { folder: "talasys/proofs" })
        if (!uploadedUrl) {
          throw new Error(`Failed to upload ${documentName}`)
        }
        uploadedDocuments.push({ 
          name: documentName, 
          url: uploadedUrl,
          status: "pending", 
          uploadDate: new Date().toLocaleDateString('en-US') 
        })
      }

      await Promise.all([
        uploadAndCollectDocument(uploadedFiles.validId, "Valid ID"),
        uploadAndCollectDocument(uploadedFiles.seniorId, "Senior Citizen ID"),
        uploadAndCollectDocument(uploadedFiles.votersId, "Voter's ID"),
      ])

      if (verification && verification.status === "pending" && verification.type === "reactivation") {
        return verification.id
      }

      const verificationPayload = {
        residentId,
        userId: residentId,
        name: user.name,
        initials: user.initials,
        type: "reactivation",
        submittedDate: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
        status: "pending",
        categories: user.statuses || ["Resident"],
        changes: [{ field: "Account Status", oldValue: "Expired", newValue: "Active" }],
        reason: reason || "Account reactivation request with updated proof documents",
        documents: uploadedDocuments,
        createdAt: Date.now()
      }

      const batch = writeBatch(db)
      const verifDocRef = doc(collection(db, COLLECTION_VERIFICATIONS))
      const notifDocRef = doc(collection(db, COLLECTION_NOTIFICATIONS))

      batch.set(verifDocRef, verificationPayload)
      batch.set(notifDocRef, {
        targetId: "admin",
        type: "reactivation",
        title: "Account Reactivation Request",
        message: `${user.name} submitted an account reactivation request.`,
        timestamp: "Just now",
        isRead: false,
        createdAt: Date.now(),
        residentName: user.name,
        actionUrl: "/admin/verifications"
      })

      await batch.commit()
      return verifDocRef.id
    },
    [residentId, user, verification]
  )

  const markAllNotificationsRead = useCallback(async () => {
    if (!residentId) return
    // Mark all unread notifications as read concurrently to avoid sequential Firestore round-trips.
    await Promise.all(
      notifications.filter(notification => !notification.isRead).map(notification =>
        updateDoc(doc(db, COLLECTION_NOTIFICATIONS, notification.id), { isRead: true })
      )
    )
  }, [residentId, notifications])

  const saveProfilePicture = useCallback(
    async (profilePicture: string) => {
      if (!residentId) return null
      await updateDoc(doc(db, COLLECTION_USERS, residentId), { profilePicture })
      return { ...user, profilePicture }
    },
    [residentId, user]
  )

  const deleteAccount = useCallback(async () => {
    if (!residentId) return false
    try {
      const { auth } = await import("@/lib/firebase")
      
      // Soft-delete by marking status rather than removing the Firestore document.
      // Physical deletion would allow the resident to log back in via Firebase Auth
      // and auto-recreate a blank profile on next authentication.
      await updateDoc(doc(db, COLLECTION_USERS, residentId), { 
        status: "Deleted by Resident",
        updatedAt: Date.now()
      })

      // Sign out locally to invalidate the current session immediately.
      if (auth.currentUser && auth.currentUser.uid === residentId) {
        await auth.signOut()
      }

      return true
    } catch (deleteError) {
      console.error("Delete account failed (residentId:", residentId, "):", deleteError)
      return false
    }
  }, [residentId])

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications]
  )

  return {
    residentId,
    requests,
    notifications,
    proofs,
    verification,
    systemConfig,
    unreadCount,
    isLoaded,
    error,
    hasError: !!error,
    addRequest,
    submitPayment,
    requestProfileEdit,
    requestReactivation,
    markAllNotificationsRead,
    saveProfilePicture,
    refresh,
    cancelRequest,
    deleteAccount
  }
}
