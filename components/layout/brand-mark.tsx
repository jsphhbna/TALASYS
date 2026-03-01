interface BrandMarkProps {
  subtitle: string
}

export function BrandMark({ subtitle }: BrandMarkProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      <h1 className="text-white text-lg sm:text-xl font-bold tracking-tight">TALASYS</h1>
      <div className="hidden sm:block w-px h-5 bg-white/20" />
      <span className="hidden sm:inline text-blue-200/70 text-xs font-medium tracking-wide truncate">{subtitle}</span>
    </div>
  )
}
