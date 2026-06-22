import Link from "next/link"

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center px-4 sm:px-8 shadow-md">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">TALASYS</Link>
      </header>
      <div className="flex-1 max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-[#0C2340] mb-4">Frequently Asked Questions</h1>
        <div className="space-y-4">
          {[
            { q: "What documents can I request online?", a: "You can request Barangay Clearance, Certificate of Indigency, and Certificate of Residency through the platform." },
            { q: "How do I track my document request?", a: "After submitting a request, go to the 'Track Request' or 'History' page in your dashboard to see the status of your request." },
            { q: "Can someone else request a document on my behalf?", a: "Yes, you can request a document for someone else by selecting 'For someone else' option and providing an authorization letter." },
            { q: "How long is my account valid?", a: "Resident accounts are valid for 2 years from the date of registration. You will be notified before your account expires." },
            { q: "What if my account verification is rejected?", a: "You will receive a notification with the reason. You can re-submit your documents or visit the barangay hall for assistance." },
            { q: "How do I update my personal information?", a: "Go to your Profile page and click 'Request Profile Edit'. An admin will review and approve the changes." },
          ].map((item, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="font-semibold text-[#0C2340] mb-2">{item.q}</h3>
              <p className="text-sm text-slate-600">{item.a}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/" className="text-sm text-[#0C2340] font-semibold hover:underline">← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
