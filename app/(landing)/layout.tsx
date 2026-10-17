import type React from "react"
import { Footer } from "@/components/layout/footer"

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div className="flex-1 flex flex-col">{children}</div>
      <Footer />
    </>
  )
}
