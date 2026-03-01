"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import {
  createResidentRequest,
  getResidentNotifications,
  getResidentProofs,
  getResidentRequests,
  markAllResidentNotificationsRead,
  subscribeToResidentStorage,
  updateResidentUser,
  type ResidentNotification,
  type ResidentProofDocument,
  type ResidentRequest,
} from "@/lib/local-storage-store"

interface NewResidentRequestInput {
  documentType: string
  purpose: string
}

export function useResidentData() {
  const { user } = useAuth()
  const residentId = user?.role === "resident" ? user.id : null

  const [requests, setRequests] = useState<ResidentRequest[]>([])
  const [notifications, setNotifications] = useState<ResidentNotification[]>([])
  const [proofs, setProofs] = useState<ResidentProofDocument[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  const refresh = useCallback(() => {
    if (!residentId) {
      setRequests([])
      setNotifications([])
      setProofs([])
      setIsLoaded(true)
      return
    }

    setRequests(getResidentRequests(residentId))
    setNotifications(getResidentNotifications(residentId))
    setProofs(getResidentProofs(residentId))
    setIsLoaded(true)
  }, [residentId])

  useEffect(() => {
    refresh()
    const unsubscribe = subscribeToResidentStorage(refresh)
    return unsubscribe
  }, [refresh])

  const addRequest = useCallback(
    (input: NewResidentRequestInput) => {
      if (!residentId) {
        return null
      }

      const created = createResidentRequest(residentId, input)
      refresh()
      return created
    },
    [refresh, residentId],
  )

  const markAllNotificationsRead = useCallback(() => {
    if (!residentId) {
      return
    }

    markAllResidentNotificationsRead(residentId)
    refresh()
  }, [refresh, residentId])

  const saveProfilePicture = useCallback(
    (profilePicture: string) => {
      if (!residentId) {
        return null
      }

      const updatedUser = updateResidentUser(residentId, { profilePicture })
      refresh()
      return updatedUser
    },
    [refresh, residentId],
  )

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.isRead).length, [notifications])

  return {
    residentId,
    requests,
    notifications,
    proofs,
    unreadCount,
    isLoaded,
    addRequest,
    markAllNotificationsRead,
    saveProfilePicture,
    refresh,
  }
}
