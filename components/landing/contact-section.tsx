"use client"

import { Phone, Mail, MapPin } from "lucide-react"

export function ContactSection() {
  return (
    <section className="py-20 bg-white" id="contact">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0C2340] tracking-tight mb-4">
            Get In Touch
          </h2>
          <p className="text-slate-600 text-[15px] leading-relaxed">
            Have questions or need assistance? Reach out to our barangay office through our official contact channels.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          
          <div 
            className="flex flex-col items-center p-8 bg-slate-50 border border-slate-200 text-center group transition-transform hover:-translate-y-1"
            style={{ borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-6 text-blue-700">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#0C2340] mb-2">Location</h3>
            <p className="text-slate-600 text-sm font-medium">
              Barangay 634 Zone 64<br/>District VI, City of Manila
            </p>
          </div>

          <div 
            className="flex flex-col items-center p-8 bg-slate-50 border border-slate-200 text-center group transition-transform hover:-translate-y-1"
            style={{ borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-6 text-blue-700">
              <Phone className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#0C2340] mb-2">Telephone</h3>
            <p className="text-slate-600 text-sm font-medium">
              (02) 711 5820
            </p>
          </div>

          <div 
            className="flex flex-col items-center p-8 bg-slate-50 border border-slate-200 text-center group transition-transform hover:-translate-y-1"
            style={{ borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-6 text-blue-700">
              <Mail className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[#0C2340] mb-2">Email</h3>
            <p className="text-slate-600 text-sm font-medium break-all">
              barangay634zone64stamesa@gmail.com
            </p>
          </div>

        </div>

        <div className="mt-20 pt-10 border-t border-slate-200 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-blue-600 tracking-wider uppercase opacity-80" style={{ fontFamily: "serif", fontStyle: "italic" }}>
            "Shine Barangay 634"
          </h2>
        </div>

      </div>
    </section>
  )
}
