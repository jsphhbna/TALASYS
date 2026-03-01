"use client"

import { usePathname } from "next/navigation"
import { ResidentMobileNav } from "@/components/layout/resident-mobile-nav"

const residentRoutes = new Set([
  "/dashboard",
  "/profile",
  "/request",
  "/history",
  "/notifications",
])

export function ResidentMobileNavGate() {
  const pathname = usePathname()

  if (!residentRoutes.has(pathname)) {
    return null
  }

  return <ResidentMobileNav />
}
