"use client"

import { useEffect, useCallback } from "react"
import { useAuth } from "@/lib/auth"

const INACTIVITY_STORAGE_KEY = "talasys_last_activity"
const TRUST_DEVICE_KEY = "talasys_trusted_device"
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export function useSessionTimeout() {
  const { user, logout, isReady } = useAuth()

  // Update activity timestamp no more than once per minute to save performance
  const updateActivity = useCallback(() => {
    if (!user) return
    
    const now = Date.now()
    const lastActivity = localStorage.getItem(INACTIVITY_STORAGE_KEY)
    
    if (lastActivity) {
      const timeSinceLastActive = now - parseInt(lastActivity, 10)
      
      const isTrusted = localStorage.getItem(TRUST_DEVICE_KEY) === "true"
      const timeoutLimit = isTrusted ? THIRTY_DAYS_MS : THREE_DAYS_MS
      
      // If time limit has passed, force logout
      if (timeSinceLastActive > timeoutLimit) {
        localStorage.removeItem(INACTIVITY_STORAGE_KEY)
        logout()
        return
      }
      
      // Throttle updates to local storage (once per minute) to avoid performance hits
      if (timeSinceLastActive < 60000) {
        return
      }
    }
    
    localStorage.setItem(INACTIVITY_STORAGE_KEY, now.toString())
  }, [user, logout])

  useEffect(() => {
    if (!isReady) return
    
    if (!user) {
       // If no user is logged in, clear the activity tracker
       localStorage.removeItem(INACTIVITY_STORAGE_KEY)
       return
    }

    // Check immediately when auth state is ready
    updateActivity()

    // Listen to subtle user activity to refresh the timestamp
    const activityEvents = ["mousemove", "keydown", "scroll", "click", "touchstart"]
    
    activityEvents.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true })
    })

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, updateActivity)
      })
    }
  }, [user, isReady, updateActivity])
}
