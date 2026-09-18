"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth"
import { ADMIN_INACTIVITY_TIMEOUT_MS } from "@/lib/constants"

export function useInactivityTimeout() {
  const { logout, user } = useAuth()
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Residents are not force-logged out for inactivity; only admin-role users
    // have a security timeout requirement per the system's access control policy.
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return
    }

    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
      inactivityTimerRef.current = setTimeout(() => {
        logout()
        window.location.href = "/auth/login?reason=timeout"
      }, ADMIN_INACTIVITY_TIMEOUT_MS)
    }

    resetInactivityTimer()

    const activityEvents = ["mousemove", "keydown", "scroll", "click"]
    
    const handleUserActivity = () => {
      resetInactivityTimer()
    }

    activityEvents.forEach(event => {
      window.addEventListener(event, handleUserActivity)
    })

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleUserActivity)
      })
    }
  }, [user, logout])
}
