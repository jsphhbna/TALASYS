"use client"

import { UserPlus, ShieldCheck, FileCheck, SearchCheck, CheckCircle2 } from "lucide-react"

const steps = [
  {
    step: "01",
    icon: UserPlus,
    title: "Create Your Account",
    description: "Register with your active email address and personal information to establish your resident portal profile.",
  },
  {
    step: "02",
    icon: ShieldCheck,
    title: "Complete Verification",
    description: "Upload a valid government-issued ID to verify residency and protect community records from unauthorized access.",
  },
  {
    step: "03",
    icon: FileCheck,
    title: "Submit Document Request",
    description: "Select the required barangay certificate or clearance, fill in the purpose, and choose your payment option.",
  },
  {
    step: "04",
    icon: SearchCheck,
    title: "Track Application Online",
    description: "Follow your request through each review stage with automated in-app notifications and progress timestamps.",
  },
  {
    step: "05",
    icon: CheckCircle2,
    title: "Claim Your Document",
    description: "Track your request online and follow the barangay's instructions for collecting your signed official copy at the Barangay Hall.",
  },
]

export function HowItWorksSection() {
  return (
    <section className="py-20 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800" id="how-it-works">
      <div className="w-full max-w-7xl 2xl:max-w-[1536px] min-[1920px]:max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold tracking-wide uppercase mb-3">
            Simple 5-Step Process
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight mb-4">
            How Barangay Digital Services Work
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
            From initial registration to official document claiming, our streamlined process ensures secure, efficient, and accountable public service.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 relative">
          {steps.map((item, index) => {
            const Icon = item.icon
            return (
              <div
                key={index}
                className="bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col relative"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-black text-blue-600 dark:text-blue-400 tracking-wider">
                    {item.step}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <h3 className="text-sm font-bold text-[#0C2340] dark:text-blue-50 mb-2">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
