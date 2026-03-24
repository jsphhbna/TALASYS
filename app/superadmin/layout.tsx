"use client"

import type React from "react"

import { useAuthGuard } from "@/hooks/use-auth-guard"
import { SuperAdminHeader } from "@/components/layout/superadmin-header"
import { SuperAdminSidebar } from "@/components/layout/superadmin-sidebar"
import { MainContentStage } from "@/components/layout/main-content-stage"

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthorized } = useAuthGuard({ requiredRole: "superadmin" })

  if (!isAuthorized) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <SuperAdminHeader />
      <div className="flex flex-1 min-h-0">
        <SuperAdminSidebar />
        <MainContentStage className="flex-1 max-h-[calc(100vh-4rem)] overflow-y-auto p-8">{children}</MainContentStage>
      </div>
    </div>
  )
}
