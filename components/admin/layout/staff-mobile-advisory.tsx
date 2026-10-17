"use client"

import { useState, useEffect } from "react"
import { Monitor, Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const SESSION_STORAGE_KEY = "talasys-staff-mobile-advisory-dismissed"

export function StaffMobileAdvisory() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Only execute on client
    if (typeof window === "undefined") return

    // Check if already dismissed this session
    try {
      if (sessionStorage.getItem(SESSION_STORAGE_KEY) === "true") {
        return
      }
    } catch {
      // sessionStorage might be restricted in private browsing
    }

    // Check viewport width (< 768px indicates compact screen / mobile)
    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const checkViewport = () => {
      if (mediaQuery.matches) {
        setIsOpen(true)
      }
    }

    checkViewport()

    const listener = (e: MediaQueryListEvent) => {
      if (e.matches) {
        try {
          if (sessionStorage.getItem(SESSION_STORAGE_KEY) !== "true") {
            setIsOpen(true)
          }
        } catch {
          setIsOpen(true)
        }
      }
    }

    mediaQuery.addEventListener("change", listener)
    return () => mediaQuery.removeEventListener("change", listener)
  }, [])

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, "true")
    } catch {
      // Ignore storage errors
    }
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div
      role="region"
      aria-label="Screen size recommendation"
      className="fixed bottom-4 left-4 right-4 z-50 md:hidden animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
    >
      <div className="bg-[#0C2340] dark:bg-slate-900 text-white rounded-xl shadow-2xl border border-white/10 p-4 max-w-lg mx-auto">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
            <Monitor className="w-5 h-5 text-blue-200" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-white tracking-tight">For a Better Experience</h4>
              <button
                onClick={handleDismiss}
                aria-label="Dismiss advisory"
                className="text-white/60 hover:text-white p-1 rounded-md transition-colors -mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-blue-100/80 leading-relaxed mt-1">
              This workspace is easier to use on a laptop or desktop computer. A larger screen makes it easier to view records, manage requests, and work with reports.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleDismiss}
                className="h-8 px-4 text-xs font-semibold bg-white text-[#0C2340] hover:bg-blue-50 shadow-sm"
              >
                Continue Here
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="h-8 px-3 text-xs text-white/70 hover:text-white hover:bg-white/10"
              >
                Got It
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
