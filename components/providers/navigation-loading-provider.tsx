"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { use30DayTimeout } from "@/hooks/auth/use-30-day-timeout"

interface NavigationLoadingContextType {
  isNavigating: boolean
  pendingPath: string | null
  beginNavigation: (href: string) => void
}

const NavigationLoadingContext = createContext<NavigationLoadingContextType | null>(null)

export function NavigationLoadingProvider({ children }: { children: React.ReactNode }) {
  use30DayTimeout()
  const pathname = usePathname()
  const [isNavigating, setIsNavigating] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  const beginNavigation = (href: string) => {
    if (!href) return

    // Extract base path (without query string) for comparison
    const hrefBase = href.split('?')[0]

    // Do not show loading skeleton if navigating to the same base page (just different tabs)
    if (hrefBase === pathname) {
      return
    }

    // Different page — show the skeleton
    setPendingPath(href)
    setIsNavigating(true)
  }

  useEffect(() => {
    if (!pendingPath) return

    // Extract base path from pendingPath for comparison
    const pendingBase = pendingPath.split('?')[0]

    // When the current pathname matches the pending destination, clear loading
    if (pathname === pendingBase) {
      setIsNavigating(false)
      setPendingPath(null)
    }
  }, [pathname, pendingPath])

  const value = useMemo(
    () => ({ isNavigating, pendingPath, beginNavigation }),
    [isNavigating, pendingPath],
  )

  return <NavigationLoadingContext.Provider value={value}>{children}</NavigationLoadingContext.Provider>
}

export function useNavigationLoading() {
  const context = useContext(NavigationLoadingContext)

  if (!context) {
    throw new Error("useNavigationLoading must be used within NavigationLoadingProvider")
  }

  return context
}
