"use client"

import { useAuth } from "@/lib/auth-context"
import { BrandMark } from "@/components/layout/brand-mark"

export function SuperAdminHeader() {
  const { user } = useAuth()

  return (
    <header
      className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center justify-between px-6 shadow-md border-b border-[#1a3a5c]/50"
      role="banner"
    >
      <BrandMark subtitle="Super Admin Portal" />
      <div className="flex items-center gap-3">
        <span className="text-blue-100/80 text-sm">Super Admin</span>
        <div className="w-8 h-8 rounded-full bg-[#C5A55A]/20 border border-[#C5A55A]/40 flex items-center justify-center">
          <span className="text-[#C5A55A] text-xs font-semibold">{user?.initials}</span>
        </div>
      </div>
    </header>
  )
}
