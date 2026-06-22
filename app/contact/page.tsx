import Link from "next/link"

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center px-4 sm:px-8 shadow-md">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">TALASYS</Link>
      </header>
      <div className="flex-1 max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-[#0C2340] mb-4">Contact Us</h1>
        <p className="text-slate-600 mb-6">Have questions or need assistance? Reach out to us through any of the following channels:</p>
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#0C2340] mb-1">Barangay Hall</h3>
            <p className="text-sm text-slate-600">123 Main Street, Barangay Sample, City</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0C2340] mb-1">Office Hours</h3>
            <p className="text-sm text-slate-600">Monday – Friday, 8:00 AM – 5:00 PM</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0C2340] mb-1">Phone</h3>
            <p className="text-sm text-slate-600">(02) 1234-5678</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0C2340] mb-1">Email</h3>
            <p className="text-sm text-slate-600">support@talasys.barangay.gov.ph</p>
          </div>
        </div>
        <div className="mt-8">
          <Link href="/" className="text-sm text-[#0C2340] font-semibold hover:underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
