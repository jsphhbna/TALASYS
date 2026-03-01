"use client"

import { useAuth } from "@/lib/auth-context"
import { BrandMark } from "@/components/layout/brand-mark"

export function AdminHeader() {
  const { user } = useAuth()

  return (
    <header
      className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center justify-between px-6 shadow-md border-b border-[#1a3a5c]/50"
      role="banner"
    >
      <BrandMark subtitle="Admin Panel" />
      <div className="flex items-center gap-3">
        <span className="text-blue-100/80 text-sm">{user?.name}</span>
        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
          <span className="text-white text-xs font-medium">{user?.initials}</span>
        </div>
      </div>
    </header>
  )
}
