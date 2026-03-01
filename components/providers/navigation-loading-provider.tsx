"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

interface NavigationLoadingContextType {
  isNavigating: boolean
  pendingPath: string | null
  beginNavigation: (href: string) => void
}

const NavigationLoadingContext = createContext<NavigationLoadingContextType | null>(null)

export function NavigationLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isNavigating, setIsNavigating] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  const beginNavigation = (href: string) => {
    if (!href || href === pathname) {
      return
    }

    setPendingPath(href)
    setIsNavigating(true)
  }

  useEffect(() => {
    if (!pendingPath) {
      return
    }

    if (pathname === pendingPath) {
      const timeout = setTimeout(() => {
        setIsNavigating(false)
        setPendingPath(null)
      }, 350)

      return () => clearTimeout(timeout)
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
