"use client"

import Link from "next/link"
import { FileText, ShieldCheck, Clock, CreditCard, UserCheck, Award, ArrowRight } from "lucide-react"

const services = [
  {
    icon: FileText,
    title: "Official Document Requests",
    description: "Request Barangay Clearance, Certificate of Indigency, Certificate of Residency, and First-Time Jobseeker Certifications online.",
    href: "/auth/login",
  },
  {
    icon: ShieldCheck,
    title: "Resident Verification",
    description: "Securely upload valid government IDs to establish verified resident status and unlock full digital services.",
    href: "/auth/register",
  },
  {
    icon: Clock,
    title: "Real-Time Tracking",
    description: "Monitor your application status from Pending review through Processing and Ready for Pick Up in real time.",
    href: "/auth/login",
  },
  {
    icon: CreditCard,
    title: "Transparent Payment & Fees",
    description: "Clear fee schedules according to barangay ordinances with GCash receipt uploads and on-site cash payment support.",
    href: "/auth/login",
  },
  {
    icon: UserCheck,
    title: "Resident Profile & Representation",
    description: "Keep your personal information up to date, manage verified contact details, and submit document requests on behalf of represented dependents.",
    href: "/auth/login",
  },
  {
    icon: Award,
    title: "Official Barangay Certification",
    description: "Issued documents feature official barangay headers, unique tracking IDs, and authorized administrative sign-off for public verification.",
    href: "/auth/login",
  },
]

export function ServicesSection() {
  return (
    <section className="py-20 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800" id="services">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/70 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-semibold tracking-wide uppercase mb-3">
            Available Online Services
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight mb-4">
            Official Public Services at Your Fingertips
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
            Barangay 634 delivers essential community services digitally, reducing waiting times and providing transparent processing for every resident.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => {
            const Icon = service.icon
            return (
              <div
                key={index}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between hover:border-blue-300 dark:hover:border-blue-700 transition-all hover:shadow-md"
              >
                <div>
                  <div className="w-11 h-11 rounded-lg bg-[#0C2340]/10 dark:bg-blue-900/30 text-[#0C2340] dark:text-blue-400 flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50 mb-2">
                    {service.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                    {service.description}
                  </p>
                </div>
                <Link
                  href={service.href}
                  className="inline-flex items-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 pt-2 border-t border-slate-100 dark:border-slate-800 transition-colors"
                >
                  Access Service
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
