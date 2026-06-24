"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { db } from "@/lib/firebase"
import { collection, query, where, onSnapshot, orderBy, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from "firebase/firestore"
import {
  type CreateResidentRequestInput,
  type ResidentNotification,
  type ResidentProofDocument,
  type ResidentRequest,
} from "@/lib/local-storage-store"

export function useResidentData() {
  const { user } = useAuth()
  const residentId = user?.role === "resident" ? user.id : null

  const [requests, setRequests] = useState<ResidentRequest[]>([])
  const [notifications, setNotifications] = useState<ResidentNotification[]>([])
  const [proofs, setProofs] = useState<ResidentProofDocument[]>([])
  const [verification, setVerification] = useState<any | null>(null)
  const [systemConfig, setSystemConfig] = useState<any | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  // Subscriptions to Firestore Collections
  useEffect(() => {
    if (!residentId) {
      setRequests([])
      setNotifications([])
      setProofs([])
      setIsLoaded(true)
      return
    }

    const qReq = query(collection(db, "documentRequests"), where("residentId", "==", residentId))
    const unReq = onSnapshot(qReq, (snap) => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ResidentRequest))
      reqs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      setRequests(reqs)
    })

    const qNotif = query(collection(db, "notifications"), where("targetId", "==", residentId))
    const unNotif = onSnapshot(qNotif, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() } as ResidentNotification))
      notifs.sort((a, b) => {
        const timeA = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const timeB = typeof b.createdAt === 'number' ? b.createdAt : 0;
        return timeB - timeA;
      })
      setNotifications(notifs)
    })

    const qVerif = query(collection(db, "verifications"), where("residentId", "==", residentId))
    const unVerif = onSnapshot(qVerif, (snap) => {
      if (!snap.empty) {
        const verifData = snap.docs[0].data()
        setVerification({ id: snap.docs[0].id, ...verifData })
        if (verifData.documents) {
            setProofs(verifData.documents.map((docItem: any, i: number) => ({
                id: `proof-${residentId}-${i}`,
                name: docItem.name,
                filename: docItem.name,
                uploadDate: docItem.uploadDate || "N/A",
                status: docItem.status === "verified" || docItem.status === "valid" ? "Valid" : "Pending",
              })))
        }
      }
    })

    const unConf = onSnapshot(doc(db, "systemConfig", "global"), (snap) => {
      if (snap.exists()) setSystemConfig(snap.data())
    })

    // Give a slight delay to ensure all listeners initialized, then mark loaded
    setTimeout(() => setIsLoaded(true), 500)

    return () => {
      unReq()
      unNotif()
      unVerif()
      unConf()
    }
  }, [residentId])

  const refresh = useCallback(() => {
     // No-op for Firestore since onSnapshot handles reactivity
  }, [])

  const cancelRequest = useCallback(
    async (requestId: string) => {
      try {
        await updateDoc(doc(db, "documentRequests", requestId), {
          status: "Cancelled",
          cancelledAt: Date.now()
        });
      } catch (error) {
        console.error("Error cancelling request:", error);
      }
    },
    []
  )

  const addRequest = useCallback(
    async (input: CreateResidentRequestInput) => {
      if (!residentId || !user) return null

      // Determine sequence (simulated)
      const year = new Date().getFullYear()
      const refNumber = `REQ-${year}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`

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
      }

      const docRef = await addDoc(collection(db, "documentRequests"), requestPayload)
      
      // Notify Admin via Firestore
      await addDoc(collection(db, "notifications"), {
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

  const requestProfileEdit = useCallback(
    async (changes: { field: string; oldValue: string; newValue: string }[], reason: string, uploadedFiles: any) => {
      if (!residentId || !user) return null

      // Upload files if any exist (simulated for now, would use Firebase Storage)
      const documents = []
      if (uploadedFiles.validId) documents.push({ name: "Valid ID", status: "pending", uploadDate: new Date().toLocaleDateString('en-US') })
      if (uploadedFiles.parentId) documents.push({ name: "Parent's ID", status: "pending", uploadDate: new Date().toLocaleDateString('en-US') })
      if (uploadedFiles.seniorId) documents.push({ name: "Senior Citizen ID", status: "pending", uploadDate: new Date().toLocaleDateString('en-US') })
      if (uploadedFiles.votersId) documents.push({ name: "Voter's ID", status: "pending", uploadDate: new Date().toLocaleDateString('en-US') })

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
        documents,
        createdAt: Date.now()
      }

      // Add to Verifications collection
      const docRef = await addDoc(collection(db, "verifications"), verificationPayload)

      // Notify Admin via Firestore
      await addDoc(collection(db, "notifications"), {
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

      return docRef.id
    },
    [residentId, user]
  )

  const markAllNotificationsRead = useCallback(async () => {
    if (!residentId) return
    const unread = notifications.filter(n => !n.isRead)
    for (const n of unread) {
        await updateDoc(doc(db, "notifications", n.id), { isRead: true })
    }
  }, [residentId, notifications])

  const saveProfilePicture = useCallback(
    async (profilePicture: string) => {
      if (!residentId) return null
      await updateDoc(doc(db, "users", residentId), { profilePicture })
      return { ...user, profilePicture } // Mock return since user context handles auth
    },
    [residentId, user]
  )

  const deleteAccount = useCallback(async () => {
    if (!residentId) return false
    try {
        await deleteDoc(doc(db, "users", residentId))
        return true
    } catch {
        return false
    }
  }, [residentId])

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.isRead).length, [notifications])

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
    requestProfileEdit,
    markAllNotificationsRead,
    saveProfilePicture,
    refresh,
    cancelRequest,
    deleteAccount
  }
}
