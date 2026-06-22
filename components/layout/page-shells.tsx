import type { ReactNode } from "react"
import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"
import { AdminHeader } from "@/components/layout/admin-header"
import { AdminSidebar } from "@/components/layout/admin-sidebar"
import { SuperAdminHeader } from "@/components/layout/superadmin-header"
import { SuperAdminSidebar } from "@/components/layout/superadmin-sidebar"
import { MainContentStage } from "@/components/layout/main-content-stage"
import { useInactivityTimeout } from "@/hooks/use-inactivity-timeout"

interface ShellProps {
  children: ReactNode
  mainClassName?: string
}

export function ResidentPageShell({ children, mainClassName = "flex-1 p-10 overflow-y-auto" }: ShellProps) {
  return (
    <div className="h-screen bg-slate-50 overflow-hidden flex flex-col">
      <Header />
      <div className="flex flex-1 min-h-0 min-w-0">
        <Sidebar />
        <MainContentStage className={`${mainClassName} pb-24 md:pb-10`}>{children}</MainContentStage>
      </div>
    </div>
  )
}

export function AdminPageShell({ children, mainClassName = "flex-1 p-8 max-h-[calc(100vh-4rem)] overflow-y-auto" }: ShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AdminHeader />
      <div className="flex flex-1 min-h-0">
        <AdminSidebar />
        <MainContentStage className={mainClassName}>{children}</MainContentStage>
      </div>
    </div>
  )
}
