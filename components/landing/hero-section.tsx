"use client"

import Link from "next/link"
import { ArrowRight, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HeroSection() {
  return (
    <section className="relative w-full min-h-[600px] flex items-center bg-[#F8FAFC] overflow-hidden" id="hero">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-50 to-transparent opacity-70 pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-100/50 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-72 h-72 rounded-full bg-[#0C2340]/5 blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          
          {/* Text Content */}
          <div className="flex flex-col items-start gap-6 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold tracking-wide uppercase">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              City of Manila
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-[clamp(40px,5vw,56px)] font-bold text-[#0C2340] leading-[1.1] tracking-tight">
              Barangay 634 <br />
              <span className="text-blue-600">Zone 64 District VI</span>
            </h1>
            
            <p className="text-[17px] text-slate-600 leading-relaxed max-w-[90%]">
              Experience faster, more accessible, and fully digital barangay services. Request documents, verify your residency, and stay updated—all from the comfort of your home.
            </p>
            
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <Link href="/register">
                <Button size="lg" className="bg-[#0C2340] hover:bg-[#0a1a30] text-white shadow-md h-12 px-8 text-base transition-all" style={{ borderRadius: "var(--radius-md)" }}>
                  Register as Resident
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50 h-12 px-8 text-base shadow-sm transition-all" style={{ borderRadius: "var(--radius-md)" }}>
                  <FileText className="mr-2 w-4 h-4" />
                  Request Document
                </Button>
              </Link>
            </div>
          </div>

          {/* Image/Visual Content */}
          <div className="relative w-full h-[400px] lg:h-[500px] rounded-[24px] overflow-hidden border border-slate-200 bg-white" style={{ boxShadow: "var(--shadow-md)" }}>
            {/* The user can replace this placeholder src with their actual high-res group photo */}
            <img 
              src="/placeholder.svg" 
              alt="Barangay 634 Officials Group"
              className="w-full h-full object-cover object-center"
            />
            {/* Overlay to ensure text/branding looks good if image is busy */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-6 left-6 pointer-events-none">
              <h3 className="text-white font-bold text-xl drop-shadow-md">Shine Barangay 634</h3>
              <p className="text-white/90 text-sm font-medium drop-shadow-md">Hon. Joel "Dudz" G. Capones</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
