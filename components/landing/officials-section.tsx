"use client"

import { Users } from "lucide-react"

export function OfficialsSection() {
  const kagawads = [
    "Hon. Lois Claire L. Araullo",
    "Hon. Carlito V. Santos",
    "Hon. Ramon P. Pingol II",
    "Hon. Regina L. Ortiz",
    "Hon. Alan S. Birdsel",
    "Hon. Ma. Luisa V. Mangilaya",
    "Hon. Ma. Teresa E. Rillo",
    "Hon. Tricia Marie B. Cailan"
  ]

  return (
    <section className="py-20 bg-slate-50 border-y border-slate-200" id="officials">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 text-blue-700 mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0C2340] tracking-tight mb-4">
            Barangay Officials
          </h2>
          <p className="text-slate-600 text-[15px] leading-relaxed">
            Meet the dedicated public servants of Barangay 634, committed to leading and serving our community with integrity and excellence.
          </p>
        </div>

        {/* Punong Barangay */}
        <div className="flex justify-center mb-12">
          <div 
            className="flex flex-col items-center p-8 bg-white border border-slate-200 text-center w-full max-w-md transition-transform hover:-translate-y-1"
            style={{ borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white shadow-sm mb-6 flex items-center justify-center overflow-hidden">
               <img src="/placeholder-avatar.svg" alt="Avatar" className="w-full h-full object-cover opacity-50" onError={(e) => e.currentTarget.style.display = 'none'} />
               {/* User can replace this with actual photo later */}
            </div>
            <h3 className="text-xl font-bold text-[#0C2340]">Hon. Joel "Dudz" G. Capones</h3>
            <p className="text-blue-600 font-semibold text-sm mt-1 uppercase tracking-wide">Punong Barangay</p>
          </div>
        </div>

        {/* Kagawads Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-12">
          {kagawads.map((name, idx) => (
            <div 
              key={idx}
              className="flex flex-col items-center p-6 bg-white border border-slate-200 text-center transition-transform hover:-translate-y-1"
              style={{ borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)" }}
            >
              <h4 className="text-[15px] font-bold text-slate-800">{name}</h4>
              <p className="text-slate-500 text-xs mt-1 uppercase tracking-wider font-medium">Kagawad</p>
            </div>
          ))}
        </div>

        {/* Sec & Treas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div 
            className="flex flex-col items-center p-6 bg-white border border-slate-200 text-center transition-transform hover:-translate-y-1"
            style={{ borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)" }}
          >
            <h4 className="text-[15px] font-bold text-slate-800">Treas. Ma. Theresa M. Borja</h4>
            <p className="text-slate-500 text-xs mt-1 uppercase tracking-wider font-medium">Barangay Treasurer</p>
          </div>
          <div 
            className="flex flex-col items-center p-6 bg-white border border-slate-200 text-center transition-transform hover:-translate-y-1"
            style={{ borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)" }}
          >
            <h4 className="text-[15px] font-bold text-slate-800">Sec. Manuel R. Salonga</h4>
            <p className="text-slate-500 text-xs mt-1 uppercase tracking-wider font-medium">Barangay Secretary</p>
          </div>
        </div>

      </div>
    </section>
  )
}
