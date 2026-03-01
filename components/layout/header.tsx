"use client"

import { useAuth } from "@/lib/auth-context"
import { BrandMark } from "@/components/layout/brand-mark"

export function Header() {
  const { user } = useAuth()

  return (
    <header
      className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center justify-between px-8 shadow-md border-b border-[#1a3a5c]/50"
      role="banner"
    >
      <BrandMark subtitle="Barangay Digital Services" />

      {user && (
        <div className="flex items-center gap-3">
          <span className="text-blue-100/80 text-sm hidden md:inline">{user.name}</span>
          <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
            <span className="text-white text-sm font-medium">{user.initials}</span>
          </div>
        </div>
      )}
    </header>
  )
}
