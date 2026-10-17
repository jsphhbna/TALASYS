"use client"

import { LandingNavbar } from "@/components/landing/landing-navbar"
import { HeroSection } from "@/components/landing/hero-section"
import { ServicesSection } from "@/components/landing/services-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { OfficialsSection } from "@/components/landing/officials-section"
import { MissionVisionSection } from "@/components/landing/mission-vision"
import { ContactSection } from "@/components/landing/contact-section"
import { Footer } from "@/components/layout/footer"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-900">
      <LandingNavbar />
      <HeroSection />
      <ServicesSection />
      <HowItWorksSection />
      <OfficialsSection />
      <MissionVisionSection />
      <ContactSection />
      <Footer />
    </main>
  )
}
