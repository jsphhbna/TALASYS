import Link from "next/link"

export default function HelpCenterPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center px-4 sm:px-8 shadow-md">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">TALASYS</Link>
      </header>
      <div className="flex-1 max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-[#0C2340] mb-4">Help Center</h1>
        <p className="text-slate-600 mb-6">Welcome to the TALASYS Help Center. Here you can find answers to common questions and get support for using the Barangay Digital Services Platform.</p>
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="font-semibold text-[#0C2340] mb-2">How do I register?</h3>
            <p className="text-sm text-slate-600">Visit the registration page and fill out the required fields including your name, date of birth, contact number, address, and upload the required documents.</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="font-semibold text-[#0C2340] mb-2">How do I request a document?</h3>
            <p className="text-sm text-slate-600">After logging in, navigate to &quot;Request Document&quot; from the sidebar, select the document type, and fill in the purpose of your request.</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="font-semibold text-[#0C2340] mb-2">How long does processing take?</h3>
            <p className="text-sm text-slate-600">Document requests are typically processed within 1-3 business days. You will receive a notification when your document is ready.</p>
          </div>
        </div>
        <div className="mt-8">
          <Link href="/" className="text-sm text-[#0C2340] font-semibold hover:underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
