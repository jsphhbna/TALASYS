"use client"

import { useEffect } from "react"
import { cn } from "@/lib/utils"

interface ModalOverlayProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

export function ModalOverlay({ isOpen, onClose, children, className }: ModalOverlayProps) {
  useEffect(() => {
    if (!isOpen) return

    // Lock ALL background scrolling when modal is open.
    const preventScroll = (e: Event) => {
      // Allow scrolling only if the event target is inside a scrollable area in the modal
      const target = e.target as HTMLElement
      const scrollable = target.closest('.overflow-y-auto, .overflow-auto, .modal-scroll-container')
      if (scrollable) return
      e.preventDefault()
    }

    document.addEventListener("wheel", preventScroll, { passive: false })
    document.addEventListener("touchmove", preventScroll, { passive: false })

    // Prevent scrolling on body and html when modal is open
    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    const mainStage = document.getElementById("main-scroll-stage")
    if (mainStage) mainStage.style.overflow = "hidden"

    return () => {
      document.removeEventListener("wheel", preventScroll)
      document.removeEventListener("touchmove", preventScroll)

      // Restore scrolling on cleanup
      document.documentElement.style.overflow = ""
      document.body.style.overflow = ""
      const mainStage = document.getElementById("main-scroll-stage")
      if (mainStage) mainStage.style.overflow = ""
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div 
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto overscroll-none modal-scroll-container animate-in fade-in duration-200",
        className
      )}
      onMouseDown={(e) => { 
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div 
        className="min-h-full flex items-center justify-center p-4 py-10"
        onMouseDown={(e) => { 
          if (e.target === e.currentTarget) {
            onClose()
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
