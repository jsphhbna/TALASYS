import type { ReactNode } from "react"
import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"
import { AdminHeader } from "@/components/admin/layout/admin-header"
import { AdminSidebar } from "@/components/admin/layout/admin-sidebar"
import { SuperAdminHeader } from "@/components/superadmin/layout/superadmin-header"
import { SuperAdminSidebar } from "@/components/superadmin/layout/superadmin-sidebar"
import { MainContentStage } from "@/components/layout/main-content-stage"
import { useInactivityTimeout } from "@/hooks/auth"

interface ShellProps {
  children: ReactNode
  mainClassName?: string
}

export function ResidentPageShell({ children, mainClassName = "flex-1 p-10" }: ShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="sticky top-0 z-50">
        <Header />
      </div>
      <div className="flex flex-1 min-w-0">
        <Sidebar />
        <MainContentStage className={`${mainClassName} pb-24 md:pb-10`}>{children}</MainContentStage>
      </div>
    </div>
  )
}

export function AdminPageShell({ children, mainClassName = "flex-1 p-8" }: ShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="sticky top-0 z-50">
        <AdminHeader />
      </div>
      <div className="flex flex-1 min-w-0">
        <AdminSidebar />
        <MainContentStage className={mainClassName}>{children}</MainContentStage>
      </div>
    </div>
  )
}
