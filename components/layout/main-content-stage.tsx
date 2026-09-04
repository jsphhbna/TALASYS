"use client"

import type { ReactNode } from "react"
import { useNavigationLoading } from "@/components/providers/navigation-loading-provider"
import { DynamicSkeleton } from "@/components/layout/dynamic-skeleton"
import { cn } from "@/lib/utils"

interface MainContentStageProps {
  children: ReactNode
  className?: string
}

export function MainContentStage({ children, className }: MainContentStageProps) {
  const { isNavigating, pendingPath } = useNavigationLoading()
  // Ensure we have a string path even if pendingPath is null
  const targetPath = pendingPath || ""

  return (
    <main className={cn("min-w-0 overflow-x-hidden", className)}>
      <div className="relative min-h-full">
        {children}

        {isNavigating && (
          <div className="absolute inset-0 bg-slate-50 dark:bg-slate-950 z-10 pointer-events-none p-4 sm:p-6">
            <DynamicSkeleton path={targetPath} />
          </div>
        )}
      </div>
    </main>
  )
}
