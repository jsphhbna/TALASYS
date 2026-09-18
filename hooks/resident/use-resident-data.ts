"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth"
import { db } from "@/lib/firebase"
import { collection, query, where, onSnapshot, orderBy, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from "firebase/firestore"
import {
  type CreateResidentRequestInput,
  type ResidentNotification,
  type ResidentProofDocument,
  type ResidentRequest,
} from "@/lib/resident"
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

  useEffect(() => {
    if (!residentId) {
      setRequests([])
      setNotifications([])
      setProofs([])
      setIsLoaded(true)
      return
    }

    const documentRequestsQuery = query(collection(db, COLLECTION_DOCUMENT_REQUESTS), where("residentId", "==", residentId))
    const unsubscribeRequests = onSnapshot(documentRequestsQuery, (snapshot) => {
      const documentRequests = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as ResidentRequest))
      documentRequests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      setRequests(documentRequests)
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
      }
    })

    const unsubscribeConfig = onSnapshot(doc(db, COLLECTION_SYSTEM_CONFIG, SYSTEM_CONFIG_DOCUMENT_ID), (snapshot) => {
      if (snapshot.exists()) setSystemConfig(snapshot.data())
    })

    // A brief delay ensures all listeners are initialized before the UI renders data.
    setTimeout(() => setIsLoaded(true), 500)

    return () => {
      unsubscribeRequests()
      unsubscribeNotifications()
      unsubscribeVerifications()
      unsubscribeConfig()
    }
  }, [residentId])

  // No-op: Firestore onSnapshot listeners handle reactivity automatically.
  const refresh = useCallback(() => {}, [])

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

      const requestYear = new Date().getFullYear()
      const refNumber = `REQ-${requestYear}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`
      const paymentRefNumber = `PAY-${requestYear}-${Date.now().toString().slice(-5)}`

      const documentFee = input.documentFee ?? 0
      const requiresPayment = documentFee > 0

      const requestPayload = {
        residentId,
        residentName: user.name,
        residentInitials: user.initials,
        residentCategory: user.status || "Resident",
        refNumber,
        documentType: input.documentType,
        dateRequested: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
        status: "Pending",
        purpose: input.purpose,
        createdAt: Date.now(),
        statusTimestamps: { "Pending": Date.now() },
        documentFee,
        paymentStatus: requiresPayment ? (input.gcashRefNumber ? "pending_verification" : "unpaid") : "waived",
        paymentMethod: requiresPayment ? (input.paymentMethod || "cash") : null,
        paymentReferenceNumber: requiresPayment ? paymentRefNumber : null,
        ...(input.gcashRefNumber ? { gcashRefNumber: input.gcashRefNumber } : {}),
        ...(input.gcashScreenshotUrl ? { gcashScreenshotUrl: input.gcashScreenshotUrl } : {}),
        ...(input.requestFor === "other" ? {
          requestFor: input.requestFor,
          requestedByName: input.requestedByName,
          requestedByContact: input.requestedByContact,
          relationship: input.relationship,
          authorizationLetter: input.authorizationLetter,
        } : {}),
      }

      const docRef = await addDoc(collection(db, COLLECTION_DOCUMENT_REQUESTS), requestPayload)
      
      await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
        targetId: "admin",
        type: "info",
        title: "New Document Request",
        message: `${user.name} requested a ${input.documentType}.`,
        timestamp: "Just now",
        isRead: false,
        createdAt: Date.now(),
        residentName: user.name,
        actionUrl: "/admin/requests"
      })

      return { id: docRef.id, ...requestPayload }
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

  const requestProfileEdit = useCallback(
    async (changes: { field: string; oldValue: string; newValue: string }[], reason: string, uploadedFiles: any, newProfilePicture?: string) => {
      if (!residentId || !user) return null

      const uploadedDocuments: any[] = []
      
      const uploadAndCollectDocument = async (file: File | null, documentName: string) => {
        if (!file) return
        try {
          const uploadedUrl = await uploadFileToCloudinary(file)
          uploadedDocuments.push({ 
            name: documentName, 
            url: uploadedUrl,
            status: "pending", 
            uploadDate: new Date().toLocaleDateString('en-US') 
          })
        } catch (uploadError) {
          console.error(`Failed to upload ${documentName} (residentId: ${residentId}):`, uploadError)
        }
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

      const verificationPayload = {
        residentId,
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

      const verificationDocRef = await addDoc(collection(db, COLLECTION_VERIFICATIONS), verificationPayload)

      await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
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

      return verificationDocRef.id
    },
    [residentId, user]
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
    addRequest,
    submitPayment,
    requestProfileEdit,
    markAllNotificationsRead,
    saveProfilePicture,
    refresh,
    cancelRequest,
    deleteAccount
  }
}
