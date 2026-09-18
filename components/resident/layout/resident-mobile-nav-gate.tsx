"use client"

import { usePathname } from "next/navigation"
import { ResidentMobileNav } from "@/components/resident/layout/resident-mobile-nav"

const residentRoutes = new Set([
  "/resident/dashboard",
  "/resident/profile",
  "/resident/request",
  "/resident/history",
  "/resident/notifications",
])

export function ResidentMobileNavGate() {
  const pathname = usePathname()

  if (!residentRoutes.has(pathname)) {
    return null
  }

  return <ResidentMobileNav />
}
