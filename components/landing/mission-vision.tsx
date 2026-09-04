"use client"

import { Target, Compass } from "lucide-react"

export function MissionVisionSection() {
  return (
    <section className="py-20 bg-white dark:bg-slate-900" id="mission">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight mb-4">
            Our Guiding Principles
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-[15px] leading-relaxed">
            The foundation of Barangay 634 is built upon a strong commitment to our residents, environment, and continuous community development.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Mission Card */}
          <div 
            className="flex flex-col p-8 md:p-10 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 group transition-all"
            style={{ borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mb-6 text-blue-700 transition-transform group-hover:scale-105" style={{ transitionDuration: "var(--transition-base)" }}>
              <Target className="w-7 h-7" />
            </div>
            <h3 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 mb-4">Mission</h3>
            <p className="text-slate-700 dark:text-slate-300 text-[16px] leading-relaxed font-medium">
              Our mission is to provide a safe, vibrant, sustainable community while striving to constantly improve the quality of life for our citizens and economic partners.
            </p>
          </div>

          {/* Vision Card */}
          <div 
            className="flex flex-col p-8 md:p-10 bg-[#0C2340] dark:bg-slate-800 border border-[#1a3a5c] group transition-all"
            style={{ borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-6 text-blue-300 transition-transform group-hover:scale-105" style={{ transitionDuration: "var(--transition-base)" }}>
              <Compass className="w-7 h-7" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">Vision</h3>
            <p className="text-slate-300 text-[16px] leading-relaxed font-medium">
              Committed to managing the balance between the collective vision of its residents, the dictates of its environment, and its commercial needs. We strive to develop, provide, and maintain quality programs and facilities that meet the growing needs of our diverse community.
            </p>
          </div>

        </div>
      </div>
    </section>
  )
}
