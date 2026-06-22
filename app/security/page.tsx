import Link from "next/link"

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center px-4 sm:px-8 shadow-md">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">TALASYS</Link>
      </header>
      <div className="flex-1 max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-[#0C2340] mb-4">Security</h1>
        <div className="bg-white border border-slate-200 rounded-lg p-6 prose prose-sm max-w-none">
          <p className="text-slate-600 mb-4">TALASYS takes the security of your data seriously. Here are the measures we implement:</p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <div>
                <h3 className="font-semibold text-[#0C2340]">Firebase Authentication</h3>
                <p className="text-sm text-slate-600">User authentication is handled through Google Firebase, providing industry-standard security for login credentials.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <div>
                <h3 className="font-semibold text-[#0C2340]">Encrypted Data Transfer</h3>
                <p className="text-sm text-slate-600">All data transmitted between your browser and our servers is encrypted using HTTPS/TLS protocols.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <div>
                <h3 className="font-semibold text-[#0C2340]">Password Requirements</h3>
                <p className="text-sm text-slate-600">Passwords must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600 mt-0.5">✓</span>
              <div>
                <h3 className="font-semibold text-[#0C2340]">Admin Verification</h3>
                <p className="text-sm text-slate-600">All new accounts undergo manual verification by barangay administrators before gaining full access.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <Link href="/" className="text-sm text-[#0C2340] font-semibold hover:underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
