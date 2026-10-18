"use client"

import Link from "next/link"
import { ArrowRight, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HeroSection() {
  return (
    <section className="relative w-full min-h-[580px] lg:min-h-[640px] flex items-center bg-[#F8FAFC] overflow-hidden" id="hero">
      {/* Decorative Background Elements (clean, sharp gradients without muddy blur-3xl blobs) */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-100/40 pointer-events-none" />
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-100/25 to-transparent pointer-events-none" />

      <div className="w-full max-w-7xl 2xl:max-w-[1536px] min-[1920px]:max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 relative z-10 py-12 sm:py-16 lg:py-20 xl:py-24">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-12 2xl:gap-16 items-center">
          
          {/* Text Content */}
          <div className="lg:col-span-6 xl:col-span-6 flex flex-col items-start gap-6 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold tracking-wide uppercase">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              City of Manila
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-[#0C2340] dark:text-blue-50 leading-[1.12] tracking-tight">
              Barangay 634 <br />
              <span className="text-blue-600">Zone 64 District VI</span>
            </h1>
            
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-prose">
              Experience faster, more accessible, and fully digital barangay services. Request documents, verify your residency, and stay updated—all from the comfort of your home.
            </p>
            
            <div className="flex flex-wrap items-center gap-4 mt-2">
              <Link href="/auth/register">
                <Button size="lg" className="bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1a30] text-white shadow-md h-12 px-8 text-base transition-all" style={{ borderRadius: "var(--radius-md)" }}>
                  Register as Resident
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button size="lg" variant="outline" className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-950 h-12 px-8 text-base shadow-sm transition-all" style={{ borderRadius: "var(--radius-md)" }}>
                  <FileText className="mr-2 w-4 h-4" />
                  Request Document
                </Button>
              </Link>
            </div>
          </div>

          {/* Image/Visual Content */}
          <div className="lg:col-span-6 xl:col-span-6 w-full">
            <div className="relative w-full aspect-[4/3] sm:aspect-[16/11] lg:aspect-[16/11] xl:aspect-[16/10] max-h-[560px] rounded-[24px] overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md">
              <img
                src="/group-photo.png"
                alt="Barangay 634 Officials Group"
                className="w-full h-full object-cover object-top"
              />
              {/* Overlay to ensure text/branding looks good if image is busy */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 pointer-events-none">
                <h3 className="text-white font-bold text-lg sm:text-xl drop-shadow-md">Shine Barangay 634</h3>
                <p className="text-white/90 text-xs sm:text-sm font-medium drop-shadow-md">Hon. Joel "Dudz" G. Capones</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
