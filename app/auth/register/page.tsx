"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card } from "@/components/ui/card"
import { BrandMark } from "@/components/layout/brand-mark"
import { RegisterStepIndicator } from "@/components/auth/register/register-step-indicator"
import { RegisterStepSkeleton } from "@/components/auth/register/register-step-skeleton"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { uploadFileToCloudinary } from "@/lib/resident"
import { getRequiredDocuments, type UploadField } from "@/lib/resident"
import { calculateAge, mergeWithAutoStatuses } from "@/lib/resident"
import { registerResidentAccount, type ResidentProofDocument } from "@/lib/resident"

const RegisterStepOneForm = dynamic(
  () => import("@/components/auth/register/register-step-one-form").then((mod) => mod.RegisterStepOneForm),
  { loading: () => <RegisterStepSkeleton /> },
)

const RegisterStepTwoDocuments = dynamic(
  () => import("@/components/auth/register/register-step-two-documents").then((mod) => mod.RegisterStepTwoDocuments),
  { loading: () => <RegisterStepSkeleton /> },
)



type RegisterFormData = {
  firstName: string
  lastName: string
  middleInitial: string
  gender: string
  dateOfBirth: string
  contactNumber: string
  street: string
  barangay: string
  city: string
  statuses: string[]
  email: string
  password: string
  confirmPassword: string
}

const defaultFormData: RegisterFormData = {
  firstName: "",
  lastName: "",
  middleInitial: "",
  gender: "",
  dateOfBirth: "",
  contactNumber: "",
  street: "",
  barangay: "",
  city: "",
  statuses: [],
  email: "",
  password: "",
  confirmPassword: "",
}

const defaultUploadState: Record<UploadField, File | null> = {
  validId: null,
  parentId: null,
  seniorId: null,
  votersId: null,
}

const defaultUploadingState: Record<UploadField, boolean> = {
  validId: false,
  parentId: false,
  seniorId: false,
  votersId: false,
}

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<RegisterFormData>(defaultFormData)
  const [uploadedFiles, setUploadedFiles] = useState<Record<UploadField, File | null>>(defaultUploadState)
  const [uploadingFiles, setUploadingFiles] = useState<Record<UploadField, boolean>>(defaultUploadingState)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isContinuing, setIsContinuing] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [uploadedProofs, setUploadedProofs] = useState<ResidentProofDocument[]>([])
  const [verificationEmailSent, setVerificationEmailSent] = useState(true)
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)
  const registrationOperationId = useRef<string | null>(
    typeof window !== "undefined" ? sessionStorage.getItem("talasys_reg_op_id") : null,
  )
  const [countdown, setCountdown] = useState(10)

  useEffect(() => {
    let isMounted = true
    const checkRecovery = async () => {
      try {
        const { auth } = await import("@/lib/firebase")
        const currentUser = auth.currentUser
        if (!currentUser) return
        const token = await currentUser.getIdToken()
        const storedOpId = typeof window !== "undefined" ? sessionStorage.getItem("talasys_reg_op_id") : null
        const res = await fetch(`/api/resident/registration/status${storedOpId ? `?operationId=${storedOpId}` : ""}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (!isMounted) return
        if (data.status === "completed") {
          setStep(3)
          setVerificationEmailSent(true)
        } else if (data.status === "incomplete") {
          if (currentUser.email) {
            setFormData((prev) => ({ ...prev, email: currentUser.email || prev.email }))
          }
          setRecoveryNotice("Incomplete registration detected. You can resume uploading your documents to complete your account.")
        } else if (data.status === "rejected") {
          setRecoveryNotice(
            `Your previous registration was rejected: ${data.details?.rejectionReason || "Please review requirements"}. Please log in to resubmit with updated documents.`,
          )
        }
      } catch {
        // Silently ignore background recovery check failures on mount
      }
    }
    checkRecovery()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (step === 3) {
      if (countdown <= 0) {
        router.push("/auth/login")
        return
      }
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1)
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [step, countdown, router])

  useEffect(() => {
    const calculatedAge = calculateAge(formData.dateOfBirth)
    if (calculatedAge === null) {
      return
    }

    setFormData((prev) => ({
      ...prev,
      statuses: mergeWithAutoStatuses(prev.statuses, calculatedAge),
    }))
  }, [formData.dateOfBirth])

  const validateContactNumber = (value: string): boolean => {
    const digits = value.replace(/\s/g, "")
    return /^\d{11}$/.test(digits)
  }

  const validateEmail = (value: string): boolean => {
    return /^[^\s@]+@gmail\.com$/.test(value.toLowerCase())
  }

  const validatePassword = (value: string): boolean => {
    const hasMinLength = value.length >= 8
    const hasLowercase = /[a-z]/.test(value)
    const hasUppercase = /[A-Z]/.test(value)
    const hasNumber = /\d/.test(value)
    const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)
    return hasMinLength && hasLowercase && hasUppercase && hasNumber && hasSpecialChar
  }

  const getPasswordRequirements = () => {
    const p = formData.password;
    return [
      { label: "Minimum 8 characters", met: p.length >= 8 },
      { label: "Lowercase letter", met: /[a-z]/.test(p) },
      { label: "Uppercase letter", met: /[A-Z]/.test(p) },
      { label: "Number", met: /\d/.test(p) },
      { label: "Special character", met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
    ]
  }

  const handleInputChange = (field: string, value: string) => {
    if (field === "contactNumber") {
      const numbersOnly = value.replace(/\D/g, "")
      setFormData((prev) => ({ ...prev, [field]: numbersOnly }))
      return
    }

    if (field === "email") {
      setFormData((prev) => ({ ...prev, [field]: value.toLowerCase() }))
      return
    }

    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleStatusToggle = (status: string) => {
    if (status === "Senior Citizen" || status === "Adult" || status === "Underage") return

    setFormData((prev) => {
      const statuses = prev.statuses.includes(status)
        ? prev.statuses.filter((s) => s !== status)
        : [...prev.statuses, status]
      return { ...prev, statuses }
    })
  }

  const handleFileUpload = async (field: UploadField, file: File | null) => {
    if (!file) {
      setUploadedFiles((prev) => ({ ...prev, [field]: null }))
      return
    }

    setUploadingFiles((prev) => ({ ...prev, [field]: true }))
    await delay(800)
    setUploadedFiles((prev) => ({ ...prev, [field]: file }))
    setUploadingFiles((prev) => ({ ...prev, [field]: false }))
  }

  const computedFullName = [formData.firstName, formData.middleInitial ? formData.middleInitial + "." : "", formData.lastName].filter(Boolean).join(" ")
  const computedAddress = [formData.street, formData.barangay, formData.city].filter(Boolean).join(", ")

  const canProceedFromStep1 = () => {
    const emailValid = validateEmail(formData.email)
    const passwordValid = validatePassword(formData.password)
    const contactValid = validateContactNumber(formData.contactNumber)
    const passwordsMatch = formData.password === formData.confirmPassword

    return (
      formData.firstName.trim() !== "" &&
      formData.lastName.trim() !== "" &&
      formData.gender !== "" &&
      formData.dateOfBirth !== "" &&
      contactValid &&
      formData.contactNumber.trim() !== "" &&
      formData.street.trim() !== "" &&
      formData.barangay.trim() !== "" &&
      formData.city.trim() !== "" &&
      formData.statuses.length > 0 &&
      emailValid &&
      passwordValid &&
      passwordsMatch
    )
  }

  const canProceedFromStep2 = () => {
    if (!termsAccepted) return false

    const isUnderage = formData.statuses.includes("Underage")
    const isAdult = formData.statuses.includes("Adult")
    const isSenior = formData.statuses.includes("Senior Citizen")
    const isVoter = formData.statuses.includes("Registered Voter")

    if (isUnderage && !uploadedFiles.parentId) return false
    if (isAdult && !isSenior && !uploadedFiles.validId) return false
    if (isSenior && !uploadedFiles.seniorId) return false
    if (isVoter && !uploadedFiles.votersId) return false

    return true
  }

  const handleContinue = async () => {
    if (!canProceedFromStep1()) {
      showToastPreset("missingInformation")
      return
    }

    setIsContinuing(true)
    await delay(700)
    setStep(2)
    setIsContinuing(false)
  }

  const handleIdScan = (file: File, extractedData: { firstName: string, lastName: string, dateOfBirth: string }) => {
    setFormData(prev => ({
      ...prev,
      firstName: extractedData.firstName || prev.firstName,
      lastName: extractedData.lastName || prev.lastName,
      dateOfBirth: extractedData.dateOfBirth || prev.dateOfBirth
    }))
    setUploadedFiles(prev => ({ ...prev, validId: file, parentId: file }))
  }

  const handleRegister = async () => {
    if (!canProceedFromStep2()) {
      showToastPreset("missingDocuments")
      return
    }

    setIsCompleting(true)
    await delay(800)

    // #47: Upload documents to Cloudinary — required proofs must have durable URLs
    const finalProofs: ResidentProofDocument[] = uploadedProofs.length > 0 ? uploadedProofs : []
    const failedUploads: string[] = []

    for (const [index, [field, file]] of (uploadedProofs.length > 0 ? [] : Object.entries(uploadedFiles).filter(([, file]) => Boolean(file))).entries()) {
      const documentName =
        field === "validId"
          ? "Valid Government ID"
          : field === "parentId"
            ? "School ID or Parent's Valid ID"
            : field === "seniorId"
              ? "Senior Citizen ID"
              : "Voter's ID / Certificate"

      try {
        const url = await uploadFileToCloudinary(file as File, { folder: "talasys/proofs" })
        if (!url) {
          failedUploads.push(documentName)
        } else {
          finalProofs.push({
            id: `${Date.now()}-${index}`,
            name: documentName,
            filename: (file as File).name,
            url,
            uploadDate: new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            status: "Valid",
          })
        }
      } catch (err) {
        console.error(`Upload failed for ${documentName}:`, err)
        failedUploads.push(documentName)
      }
    }

    if (failedUploads.length > 0) {
      setIsCompleting(false)
      alert(`Failed to upload required document(s): ${failedUploads.join(", ")}. Please check your file size and connection, then try again.`)
      return
    }
    if (uploadedProofs.length === 0) setUploadedProofs(finalProofs)
    if (!registrationOperationId.current) {
      registrationOperationId.current = crypto.randomUUID()
      if (typeof window !== "undefined") {
        sessionStorage.setItem("talasys_reg_op_id", registrationOperationId.current)
      }
    }

    try {
      const registration = await registerResidentAccount({
        name: computedFullName,
        email: formData.email,
        password: formData.password,
        dateOfBirth: formData.dateOfBirth,
        contactNumber: formData.contactNumber,
        address: computedAddress,
        statuses: formData.statuses,
        proofs: finalProofs,
        gender: formData.gender,
        profilePicture: "",
        firstName: formData.firstName,
        lastName: formData.lastName,
        middleInitial: formData.middleInitial,
        street: formData.street,
        barangay: formData.barangay,
        city: formData.city,
        operationId: registrationOperationId.current,
      })
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("talasys_reg_op_id")
      }
      setVerificationEmailSent(registration.verificationEmailSent)
    } catch (err: any) {
      console.error("Registration Error:", err)
      setIsCompleting(false)
      if (err?.code === "auth/weak-password") {
        alert("Password is too weak. Please use at least 6 characters.")
      } else if (err?.code === "auth/email-already-in-use") {
        try {
          const { auth } = await import("@/lib/firebase")
          if (auth.currentUser && auth.currentUser.email?.toLowerCase() === formData.email.trim().toLowerCase()) {
            const token = await auth.currentUser.getIdToken()
            const res = await fetch("/api/resident/registration/status", {
              headers: { Authorization: `Bearer ${token}` },
            })
            const data = await res.json().catch(() => ({}))
            if (data.status === "completed") {
              setStep(3)
              return
            } else if (data.status === "incomplete") {
              alert("An in-progress account was found. Please ensure all required documents are selected, then try again.")
              return
            }
          }
        } catch {
          // Fall through to account exists toast
        }
        showToastPreset("accountExists")
      } else if (err?.outcome === "ambiguous") {
        alert("Registration completion could not be confirmed due to a connection issue. Your account has been preserved. Please keep this page open and click Register again to retry.")
      } else {
        alert(err?.message || "Failed to create account. Please check your details and try again.")
      }
      return
    }

    showToastPreset("registrationCompleted")
    setIsCompleting(false)
    setStep(3)
  }

  const requiredDocuments = getRequiredDocuments(formData.statuses, "register")

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center justify-between px-4 sm:px-8 shadow-md" role="banner">
        <Link href="/">
          <BrandMark subtitle="Barangay 634" />
        </Link>
        <Link href="/" className="text-white/80 hover:text-white text-sm font-medium flex items-center gap-2 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Home</span>
        </Link>
      </header>

      <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-3xl p-5 sm:p-8 lg:p-10 shadow-lg border-slate-200 dark:border-slate-700/80">
          <div className="text-center mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-[#0C2340] dark:text-blue-50 mb-2 tracking-tight">
              {step === 1 ? "Create Your Account" : step === 2 ? "Upload Required Documents" : "Registration Successful!"}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {step === 1
                ? "Register to access barangay digital services"
                : step === 2
                ? `Based on your status: ${formData.statuses.length > 0 ? formData.statuses.join(", ") : "None selected"}`
                : verificationEmailSent
                  ? "Please verify your email address to continue."
                  : "Your registration is complete. Send a new verification email from the login page."}
            </p>
            {recoveryNotice && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs rounded-lg text-left">
                {recoveryNotice}
              </div>
            )}
          </div>

          {step < 3 && <RegisterStepIndicator step={step} />}

          {step === 1 ? (
            <RegisterStepOneForm
              formData={formData}
              onInputChange={handleInputChange}
              onStatusToggle={handleStatusToggle}
              validateContactNumber={validateContactNumber}
              validateEmail={validateEmail}
              validatePassword={validatePassword}
              getPasswordRequirements={getPasswordRequirements}
              canContinue={canProceedFromStep1()}
              isContinuing={isContinuing}
              onContinue={handleContinue}
              onIdScan={handleIdScan}
            />
          ) : step === 2 ? (
            <RegisterStepTwoDocuments
              requiredDocuments={requiredDocuments}
              uploadedFiles={uploadedFiles}
              uploadingFiles={uploadingFiles}
              termsAccepted={termsAccepted}
              onTermsChange={setTermsAccepted}
              onFileUpload={handleFileUpload}
              canComplete={canProceedFromStep2()}
              isCompleting={isCompleting}
              onComplete={handleRegister}
              onBack={() => setStep(1)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 space-y-6 text-center animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2 shadow-sm border border-green-200 dark:border-green-800">
                <span className="text-4xl">✉️</span>
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                  Verify Your Account
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
                  {verificationEmailSent ? "We've sent" : "We couldn't send"} a verification link to <span className="font-semibold text-slate-900 dark:text-white break-all">{formData.email}</span>.
                  <br /><br />
                  {verificationEmailSent
                    ? "Please click the link in the email to verify your account before logging in."
                    : "Your account and documents are safely registered. Sign in from the login page to trigger a new verification email."}
                  <br /><br />
                  <span className="text-xs italic text-slate-500 dark:text-slate-500">
                    If you don't see the email, please check your spam or junk folder.
                  </span>
                </p>
              </div>
              
              <div className="pt-6 w-full max-w-xs mx-auto">
                <button
                  onClick={() => router.push("/auth/login")}
                  className="w-full h-11 bg-[#0C2340] dark:bg-slate-800 hover:bg-[#1a3a5c] text-white font-semibold rounded-md shadow-sm transition-colors"
                >
                  Back to Login
                </button>
                <div className="mt-5 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-[#0C2340] dark:border-t-blue-400 animate-spin" />
                  <p className="text-xs text-slate-500 font-medium">
                    Redirecting automatically in <span className="text-[#0C2340] dark:text-blue-400 font-bold">{countdown}</span> seconds...
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <footer className="text-center py-4 text-xs text-slate-400">
        <p>TALASYS © 2025 — Barangay Digital Services System</p>
      </footer>
    </div>
  )
}
