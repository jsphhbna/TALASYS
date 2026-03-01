"use client"

import type { ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useNavigationLoading } from "@/components/providers/navigation-loading-provider"
import { cn } from "@/lib/utils"

interface MainContentStageProps {
  children: ReactNode
  className?: string
}

export function MainContentStage({ children, className }: MainContentStageProps) {
  const { isNavigating } = useNavigationLoading()

  return (
    <main className={cn("min-w-0 overflow-x-hidden", className)}>
      <div className="relative min-h-full">
        {children}

        {isNavigating && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[1px] z-10 pointer-events-none p-4 sm:p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-72" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                <Skeleton className="h-44 w-full" />
                <Skeleton className="h-44 w-full" />
              </div>
              <Skeleton className="h-56 w-full" />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
