"use client"

import { LandingNavbar } from "@/components/landing/landing-navbar"
import { HeroSection } from "@/components/landing/hero-section"
import { MissionVisionSection } from "@/components/landing/mission-vision"
import { OfficialsSection } from "@/components/landing/officials-section"
import { ContactSection } from "@/components/landing/contact-section"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <LandingNavbar />
      <HeroSection />
      <MissionVisionSection />
      <OfficialsSection />
      <ContactSection />
    </main>
  )
}
