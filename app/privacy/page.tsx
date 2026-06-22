import Link from "next/link"

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center px-4 sm:px-8 shadow-md">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">TALASYS</Link>
      </header>
      <div className="flex-1 max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-[#0C2340] mb-4">Privacy Policy</h1>
        <div className="bg-white border border-slate-200 rounded-lg p-6 prose prose-sm max-w-none">
          <p className="text-slate-600">Last updated: January 1, 2025</p>
          <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">1. Information We Collect</h2>
          <p className="text-sm text-slate-600">We collect personal information that you provide during registration, including your name, date of birth, contact number, address, and identification documents. This information is necessary for providing barangay digital services.</p>
          <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">2. How We Use Your Information</h2>
          <p className="text-sm text-slate-600">Your information is used solely for the purpose of verifying your identity, processing document requests, and managing your resident account within the barangay system.</p>
          <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">3. Data Protection</h2>
          <p className="text-sm text-slate-600">We implement appropriate security measures to protect your personal data in compliance with the Data Privacy Act of 2012 (RA 10173).</p>
          <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">4. Your Rights</h2>
          <p className="text-sm text-slate-600">You have the right to access, correct, and request deletion of your personal data. Contact the barangay office for any privacy-related concerns.</p>
        </div>
        <div className="mt-8">
          <Link href="/" className="text-sm text-[#0C2340] font-semibold hover:underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
