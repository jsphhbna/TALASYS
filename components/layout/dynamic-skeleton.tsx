import { Skeleton } from "@/components/ui/skeleton"

interface DynamicSkeletonProps {
  path: string
}

export function DynamicSkeleton({ path }: DynamicSkeletonProps) {
  // Determine skeleton type based on the path route
  const isDashboard = path.includes("dashboard") || path === "/"
  const isTablePage = path.includes("history") || path.includes("requests") || path.includes("verifications") || path.includes("logs") || path.includes("admins") || path.includes("residents")
  const isProfile = path.includes("profile")
  const isFormPage = path.includes("request") && !path.includes("requests")

  if (isDashboard) {
    return (
      <div className="space-y-8">
        <div className="space-y-2 mb-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          <Skeleton className="h-[180px] w-full rounded-xl" />
          <Skeleton className="h-[180px] w-full rounded-xl" />
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <Skeleton className="h-[104px] w-full rounded-xl" />
            <Skeleton className="h-[104px] w-full rounded-xl" />
            <Skeleton className="h-[104px] w-full rounded-xl" />
            <Skeleton className="h-[104px] w-full rounded-xl" />
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <Skeleton className="h-6 w-40 mb-4" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (isTablePage) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 mb-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        
        {/* Stats Section */}
        <Skeleton className="h-[136px] w-full rounded-xl mb-6" />

        {/* Filters */}
        <Skeleton className="h-20 w-full rounded-xl mb-6" />

        {/* Table itself */}
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    )
  }

  if (isProfile) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-10 w-32 hidden sm:block" />
        </div>
        
        {/* Header Avatar Card */}
        <Skeleton className="h-[120px] w-full rounded-xl" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Skeleton className="h-[400px] w-full rounded-xl" />
            <Skeleton className="h-[200px] w-full rounded-xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-[300px] w-full rounded-xl" />
            <Skeleton className="h-[200px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (isFormPage) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="space-y-2 mb-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        
        {/* Stepper */}
        <Skeleton className="h-16 w-full rounded-xl mb-8" /> 
        
        {/* Form Body */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-[500px] w-full rounded-xl" />
          </div>
          <div className="md:col-span-1 space-y-6">
            <Skeleton className="h-[300px] w-full rounded-xl" />
            <Skeleton className="h-[150px] w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  // Fallback
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
