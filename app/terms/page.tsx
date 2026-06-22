import Link from "next/link"

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center px-4 sm:px-8 shadow-md">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">TALASYS</Link>
      </header>
      <div className="flex-1 max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-[#0C2340] mb-4">Terms of Service</h1>
        <div className="bg-white border border-slate-200 rounded-lg p-6 prose prose-sm max-w-none">
          <p className="text-slate-600">Last updated: January 1, 2025</p>
          <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">1. Acceptance of Terms</h2>
          <p className="text-sm text-slate-600">By registering for and using TALASYS (Barangay Digital Services Platform), you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.</p>
          <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">2. Account Registration</h2>
          <p className="text-sm text-slate-600">You must provide accurate and complete information during registration. You are responsible for maintaining the confidentiality of your account credentials.</p>
          <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">3. Use of Services</h2>
          <p className="text-sm text-slate-600">The platform is intended for legitimate barangay residents to request official documents and manage their resident profiles. Any misuse or provision of false information may result in account suspension.</p>
          <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">4. Account Validity</h2>
          <p className="text-sm text-slate-600">Resident accounts are valid for a period of two (2) years from registration. Accounts must be reactivated upon expiry by re-submitting required documents for verification.</p>
          <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">5. Document Requests</h2>
          <p className="text-sm text-slate-600">Processing times may vary. The barangay reserves the right to reject any request that does not meet the required criteria. Fees may apply as determined by the barangay.</p>
        </div>
        <div className="mt-8">
          <Link href="/" className="text-sm text-[#0C2340] font-semibold hover:underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
