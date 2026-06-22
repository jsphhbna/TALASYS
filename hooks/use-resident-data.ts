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

    const qReq = query(collection(db, "documentRequests"), where("residentId", "==", residentId), orderBy("createdAt", "desc"))
    const unReq = onSnapshot(qReq, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as ResidentRequest)))
    })

    const qNotif = query(collection(db, "notifications"), where("targetId", "==", residentId), orderBy("createdAt", "desc"))
    const unNotif = onSnapshot(qNotif, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as ResidentNotification)))
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
    markAllNotificationsRead,
    saveProfilePicture,
    refresh,
    cancelRequest,
    deleteAccount
  }
}
