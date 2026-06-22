"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

export function useInactivityTimeout() {
  const { logout, user } = useAuth()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Only apply to admin or superadmin
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return
    }

    const resetTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        logout()
        window.location.href = "/login?reason=timeout"
      }, INACTIVITY_TIMEOUT_MS)
    }

    // Initialize timer
    resetTimer()

    // Events to track activity
    const events = ["mousemove", "keydown", "scroll", "click"]
    
    const handleActivity = () => {
      resetTimer()
    }

    events.forEach(event => {
      window.addEventListener(event, handleActivity)
    })

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      events.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
    }
  }, [user, logout])
}
