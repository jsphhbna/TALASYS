"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Suspense } from "react"
import { Shield, FileText, Lock } from "lucide-react"

function LegalContent() {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get("tab") || "privacy"

  return (
    <div className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-[#0C2340] mb-3">Legal & Security</h1>
        <p className="text-slate-600 text-[15px]">Information regarding our policies and how we protect your data.</p>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8 h-12">
          <TabsTrigger value="privacy" className="text-[15px]"><Shield className="w-4 h-4 mr-2" /> Privacy Policy</TabsTrigger>
          <TabsTrigger value="terms" className="text-[15px]"><FileText className="w-4 h-4 mr-2" /> Terms of Service</TabsTrigger>
          <TabsTrigger value="security" className="text-[15px]"><Lock className="w-4 h-4 mr-2" /> Security</TabsTrigger>
        </TabsList>

        <TabsContent value="privacy" className="bg-white border border-slate-200 rounded-xl p-8" style={{ boxShadow: "var(--shadow-sm)" }}>
          <h2 className="text-2xl font-bold text-[#0C2340] mb-6">Privacy Policy</h2>
          <div className="prose prose-sm max-w-none text-slate-700">
            <p className="text-sm text-slate-500 mb-6">Last updated: January 1, 2025</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">1. Information We Collect</h3>
            <p className="text-[15px] leading-relaxed mb-4">We collect personal information that you provide during registration, including your name, date of birth, contact number, address, and identification documents. This information is necessary for providing barangay digital services.</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">2. How We Use Your Information</h3>
            <p className="text-[15px] leading-relaxed mb-4">Your information is used solely for the purpose of verifying your identity, processing document requests, and managing your resident account within the barangay system.</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">3. Data Protection</h3>
            <p className="text-[15px] leading-relaxed mb-4">We implement appropriate security measures to protect your personal data in compliance with the Data Privacy Act of 2012 (RA 10173).</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">4. Your Rights</h3>
            <p className="text-[15px] leading-relaxed mb-4">You have the right to access, correct, and request deletion of your personal data. Contact the barangay office for any privacy-related concerns.</p>
          </div>
        </TabsContent>

        <TabsContent value="terms" className="bg-white border border-slate-200 rounded-xl p-8" style={{ boxShadow: "var(--shadow-sm)" }}>
          <h2 className="text-2xl font-bold text-[#0C2340] mb-6">Terms of Service</h2>
          <div className="prose prose-sm max-w-none text-slate-700">
            <p className="text-sm text-slate-500 mb-6">Last updated: January 1, 2025</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">1. Acceptance of Terms</h3>
            <p className="text-[15px] leading-relaxed mb-4">By registering for and using TALASYS (Barangay 634), you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">2. Account Registration</h3>
            <p className="text-[15px] leading-relaxed mb-4">You must provide accurate and complete information during registration. You are responsible for maintaining the confidentiality of your account credentials.</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">3. Use of Services</h3>
            <p className="text-[15px] leading-relaxed mb-4">The platform is intended for legitimate barangay residents to request official documents and manage their resident profiles. Any misuse or provision of false information may result in account suspension.</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">4. Account Validity</h3>
            <p className="text-[15px] leading-relaxed mb-4">Resident accounts are valid for a period of two (2) years from registration. Accounts must be reactivated upon expiry by re-submitting required documents for verification.</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">5. Document Requests</h3>
            <p className="text-[15px] leading-relaxed mb-4">Processing times may vary. The barangay reserves the right to reject any request that does not meet the required criteria. Fees may apply as determined by the barangay.</p>
          </div>
        </TabsContent>

        <TabsContent value="security" className="bg-white border border-slate-200 rounded-xl p-8" style={{ boxShadow: "var(--shadow-sm)" }}>
          <h2 className="text-2xl font-bold text-[#0C2340] mb-6">Security & Authentication</h2>
          <div className="prose prose-sm max-w-none text-slate-700">
            <p className="text-[15px] leading-relaxed mb-6">Security is our top priority. The TALASYS system employs industry-standard practices to ensure your data and transactions are safe.</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">1. Firebase Authentication</h3>
            <p className="text-[15px] leading-relaxed mb-4">We use Google's Firebase Authentication to securely manage user identities, ensuring that passwords are never stored in plain text and logins are protected by modern encryption standards.</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">2. Data Encryption</h3>
            <p className="text-[15px] leading-relaxed mb-4">All data transmitted between your device and our servers is encrypted using HTTPS (SSL/TLS). This prevents unauthorized interception of your sensitive information.</p>
            
            <h3 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">3. Secure Document Storage</h3>
            <p className="text-[15px] leading-relaxed mb-4">Your uploaded identification documents are stored in secure cloud storage environments with restricted access. Only authorized barangay personnel can view these documents for verification purposes.</p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-10 text-center">
        <Link href="/" className="text-[15px] text-blue-600 font-semibold hover:underline">
          &larr; Back to Home
        </Link>
      </div>
    </div>
  )
}

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center px-4 sm:px-8 shadow-md">
        <Link href="/" className="text-white font-bold text-lg tracking-tight">TALASYS | Barangay 634</Link>
      </header>
      
      <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading...</div>}>
        <LegalContent />
      </Suspense>
    </div>
  )
}
