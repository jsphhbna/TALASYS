import type React from "react"
export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="flex-1 flex flex-col">{children}</div>
}
