"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { BrandMark } from "@/components/layout/brand-mark"
import { RegisterStepIndicator } from "@/components/register/register-step-indicator"
import { RegisterStepSkeleton } from "@/components/register/register-step-skeleton"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { getRequiredDocuments, type UploadField } from "@/lib/resident-documents"
import { calculateAge, mergeWithAutoStatuses } from "@/lib/resident-status"
import { registerResidentAccount, type ResidentProofDocument } from "@/lib/local-storage-store"

const RegisterStepOneForm = dynamic(
  () => import("@/components/register/register-step-one-form").then((mod) => mod.RegisterStepOneForm),
  { loading: () => <RegisterStepSkeleton /> },
)

const RegisterStepTwoDocuments = dynamic(
  () => import("@/components/register/register-step-two-documents").then((mod) => mod.RegisterStepTwoDocuments),
  { loading: () => <RegisterStepSkeleton /> },
)

type RegisterFormData = {
  fullName: string
  dateOfBirth: string
  contactNumber: string
  address: string
  statuses: string[]
  email: string
  password: string
}

const defaultFormData: RegisterFormData = {
  fullName: "",
  dateOfBirth: "",
  contactNumber: "",
  address: "",
  statuses: [],
  email: "",
  password: "",
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
    return /^\d+$/.test(value.replace(/\s/g, ""))
  }

  const validateEmail = (value: string): boolean => {
    return /^[^\s@]+@gmail\.com$/.test(value.toLowerCase())
  }

  const validatePassword = (value: string): boolean => {
    const hasLowercase = /[a-z]/.test(value)
    const hasUppercase = /[A-Z]/.test(value)
    const hasNumber = /\d/.test(value)
    const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)
    return hasLowercase && hasUppercase && hasNumber && hasSpecialChar
  }

  const getPasswordStrengthMessage = (): string[] => {
    const messages: string[] = []
    if (!/[a-z]/.test(formData.password)) messages.push("• Lowercase letter")
    if (!/[A-Z]/.test(formData.password)) messages.push("• Uppercase letter")
    if (!/\d/.test(formData.password)) messages.push("• Number")
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(formData.password)) messages.push("• Special character")
    return messages
  }

  const handleInputChange = (field: keyof RegisterFormData, value: string) => {
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

  const canProceedFromStep1 = () => {
    const emailValid = validateEmail(formData.email)
    const passwordValid = validatePassword(formData.password)
    const contactValid = validateContactNumber(formData.contactNumber)

    return (
      formData.fullName.trim() !== "" &&
      formData.dateOfBirth !== "" &&
      contactValid &&
      formData.contactNumber.trim() !== "" &&
      formData.address.trim() !== "" &&
      formData.statuses.length > 0 &&
      emailValid &&
      passwordValid
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

  const handleCompleteRegistration = async () => {
    if (!canProceedFromStep2()) {
      showToastPreset("missingDocuments")
      return
    }

    const uploadedProofs: ResidentProofDocument[] = Object.entries(uploadedFiles)
      .filter(([, file]) => Boolean(file))
      .map(([field, file], index) => {
        const documentName =
          field === "validId"
            ? "Valid Government ID"
            : field === "parentId"
              ? "Parent's Valid Government ID"
              : field === "seniorId"
                ? "Senior Citizen ID"
                : "Voter's ID / Certificate"

        return {
          id: `${Date.now()}-${index}`,
          name: documentName,
          filename: (file as File).name,
          uploadDate: new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          status: "Valid",
        }
      })

    setIsCompleting(true)
    await delay(1200)

    try {
      await registerResidentAccount({
        name: formData.fullName,
        email: formData.email,
        password: formData.password,
        dateOfBirth: formData.dateOfBirth,
        contactNumber: formData.contactNumber,
        address: formData.address,
        statuses: formData.statuses,
        proofs: uploadedProofs,
      })
    } catch {
      setIsCompleting(false)
      showToastPreset("accountExists")
      return
    }

    showToastPreset("registrationCompleted")
    router.push("/login")
  }

  const requiredDocuments = getRequiredDocuments(formData.statuses, "register")

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center px-4 sm:px-8 shadow-md" role="banner">
        <BrandMark subtitle="Barangay Digital Services" />
      </header>

      <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-3xl p-5 sm:p-8 lg:p-10 shadow-lg border-slate-200/80">
          <div className="text-center mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-[#0C2340] mb-2 tracking-tight">
              {step === 1 ? "Create Your Account" : "Upload Required Documents"}
            </h2>
            <p className="text-sm text-slate-600">
              {step === 1
                ? "Register to access barangay digital services"
                : `Based on your status: ${formData.statuses.length > 0 ? formData.statuses.join(", ") : "None selected"}`}
            </p>
          </div>

          <RegisterStepIndicator step={step} />

          {step === 1 ? (
            <RegisterStepOneForm
              formData={formData}
              onInputChange={handleInputChange}
              onStatusToggle={handleStatusToggle}
              validateContactNumber={validateContactNumber}
              validateEmail={validateEmail}
              validatePassword={validatePassword}
              getPasswordStrengthMessage={getPasswordStrengthMessage}
              canContinue={canProceedFromStep1()}
              isContinuing={isContinuing}
              onContinue={handleContinue}
            />
          ) : (
            <RegisterStepTwoDocuments
              requiredDocuments={requiredDocuments}
              uploadedFiles={uploadedFiles}
              uploadingFiles={uploadingFiles}
              termsAccepted={termsAccepted}
              onTermsChange={setTermsAccepted}
              onFileUpload={handleFileUpload}
              canComplete={canProceedFromStep2()}
              isCompleting={isCompleting}
              onComplete={handleCompleteRegistration}
              onBack={() => setStep(1)}
            />
          )}
        </Card>
      </div>

      <footer className="text-center py-4 text-xs text-slate-400">
        <p>TALASYS © 2025 — Barangay Digital Services System</p>
      </footer>
    </div>
  )
}
