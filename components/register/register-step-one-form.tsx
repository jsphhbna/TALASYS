import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

interface RegisterStepOneFormProps {
  formData: {
    fullName: string
    dateOfBirth: string
    contactNumber: string
    address: string
    statuses: string[]
    email: string
    password: string
  }
  onInputChange: (field: "fullName" | "dateOfBirth" | "contactNumber" | "address" | "statuses" | "email" | "password", value: string) => void
  onStatusToggle: (status: string) => void
  validateContactNumber: (value: string) => boolean
  validateEmail: (value: string) => boolean
  validatePassword: (value: string) => boolean
  getPasswordStrengthMessage: () => string[]
  canContinue: boolean
  isContinuing: boolean
  onContinue: () => void
}

export function RegisterStepOneForm({
  formData,
  onInputChange,
  onStatusToggle,
  validateContactNumber,
  validateEmail,
  validatePassword,
  getPasswordStrengthMessage,
  canContinue,
  isContinuing,
  onContinue,
}: RegisterStepOneFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name *</label>
        <Input
          value={formData.fullName}
          onChange={(e) => onInputChange("fullName", e.target.value)}
          placeholder="Enter your complete name"
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date of Birth *</label>
          <Input
            type="date"
            value={formData.dateOfBirth}
            onChange={(e) => onInputChange("dateOfBirth", e.target.value)}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Contact Number *</label>
          <Input
            value={formData.contactNumber}
            onChange={(e) => onInputChange("contactNumber", e.target.value)}
            placeholder="09XX XXX XXXX"
            className="w-full"
            maxLength={11}
          />
          {formData.contactNumber && !validateContactNumber(formData.contactNumber) && (
            <p className="text-red-500 text-xs mt-1">Contact number must contain only numbers</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Complete Address *</label>
        <Input
          value={formData.address}
          onChange={(e) => onInputChange("address", e.target.value)}
          placeholder="House No., Street, Barangay"
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Resident Status * (Select all that apply)
        </label>
        <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
          <div className="flex items-start gap-3 opacity-50">
            <Checkbox checked={formData.statuses.includes("Underage")} disabled={true} />
            <div className="flex-1">
              <label className="text-sm text-slate-500 cursor-not-allowed">
                Underage (Under 18) - Auto-calculated from date of birth
              </label>
              <p className="text-[11px] text-slate-400">(Requires: Parent's Valid ID)</p>
            </div>
          </div>
          <div className="flex items-start gap-3 opacity-50">
            <Checkbox checked={formData.statuses.includes("Adult")} disabled={true} />
            <div className="flex-1">
              <label className="text-sm text-slate-500 cursor-not-allowed">
                Adult (18-59) - Auto-calculated from date of birth
              </label>
              <p className="text-[11px] text-slate-400">(Requires: Valid Government ID)</p>
            </div>
          </div>
          <div className="flex items-start gap-3 opacity-50">
            <Checkbox checked={formData.statuses.includes("Senior Citizen")} disabled={true} />
            <div className="flex-1">
              <label className="text-sm text-slate-500 cursor-not-allowed">
                Senior Citizen (60+) - Auto-calculated from date of birth
              </label>
              <p className="text-[11px] text-slate-400">(Requires: Senior Citizen ID)</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              checked={formData.statuses.includes("Registered Voter")}
              onCheckedChange={() => onStatusToggle("Registered Voter")}
            />
            <div className="flex-1">
              <label className="text-sm text-slate-700 cursor-pointer">Registered Voter</label>
              <p className="text-[11px] text-slate-500">(Requires: Voter's ID / Cert)</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address *</label>
        <Input
          type="email"
          value={formData.email}
          onChange={(e) => onInputChange("email", e.target.value.toLowerCase())}
          placeholder="your.email@gmail.com"
          className="w-full"
        />
        {formData.email && !validateEmail(formData.email) && (
          <p className="text-red-500 text-xs mt-1">Email must be a valid Gmail address (@gmail.com)</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password *</label>
        <Input
          type="password"
          value={formData.password}
          onChange={(e) => onInputChange("password", e.target.value)}
          placeholder="••••••••••••"
          className="w-full"
        />
        {formData.password && (
          <div className="mt-2 text-xs">
            {validatePassword(formData.password) ? (
              <p className="text-green-600 font-medium">✓ Password is strong</p>
            ) : (
              <div className="text-slate-600">
                <p className="font-medium text-slate-700 mb-1">Password must contain:</p>
                {getPasswordStrengthMessage().map((msg, idx) => (
                  <p key={idx} className="text-red-500">
                    {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Button
        onClick={onContinue}
        disabled={!canContinue || isContinuing}
        className="w-full bg-[#0C2340] hover:bg-[#1a3a5c] h-11 text-sm font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed"
      >
        {isContinuing ? "Loading..." : "Continue to Documents"}
      </Button>

      <p className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <a href="/login" className="text-[#0C2340] font-semibold hover:underline">
          Sign In
        </a>
      </p>
    </div>
  )
}
