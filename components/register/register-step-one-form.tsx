import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const BARANGAY_OPTIONS = [
  "Barangay 1", "Barangay 2", "Barangay 3", "Barangay 4", "Barangay 5",
  "Barangay 6", "Barangay 7", "Barangay 8", "Barangay 9", "Barangay 10",
  "Barangay Sample",
]

const CITY_OPTIONS = [
  "Quezon City", "Manila", "Makati", "Pasig", "Taguig",
  "Caloocan", "Las Piñas", "Marikina", "Muntinlupa", "Parañaque",
  "Pasay", "San Juan", "Valenzuela", "Mandaluyong", "Malabon", "Navotas",
]

interface RegisterStepOneFormProps {
  formData: {
    firstName: string
    lastName: string
    middleInitial: string
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
  onInputChange: (field: string, value: string) => void
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
  const contactDigits = formData.contactNumber.replace(/\s/g, "")

  return (
    <div className="space-y-4">
      {/* Name Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        <div className="sm:col-span-5">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">First Name *</label>
          <Input
            value={formData.firstName}
            onChange={(e) => onInputChange("firstName", e.target.value)}
            placeholder="Juan"
            className="w-full"
          />
        </div>
        <div className="sm:col-span-5">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Last Name *</label>
          <Input
            value={formData.lastName}
            onChange={(e) => onInputChange("lastName", e.target.value)}
            placeholder="Dela Cruz"
            className="w-full"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">M.I.</label>
          <Input
            value={formData.middleInitial}
            onChange={(e) => onInputChange("middleInitial", e.target.value.slice(0, 1).toUpperCase())}
            placeholder="A"
            className="w-full text-center"
            maxLength={1}
          />
        </div>
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
          {formData.contactNumber && (
            contactDigits.length > 0 && contactDigits.length !== 11 ? (
              <p className="text-red-500 text-xs mt-1">Contact number must be exactly 11 digits ({contactDigits.length}/11)</p>
            ) : contactDigits.length === 11 && !/^\d{11}$/.test(contactDigits) ? (
              <p className="text-red-500 text-xs mt-1">Contact number must contain only numbers</p>
            ) : contactDigits.length === 11 ? (
              <p className="text-green-600 text-xs mt-1">✓ Valid contact number</p>
            ) : null
          )}
        </div>
      </div>

      {/* Address Fields */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Street / House No. *</label>
        <Input
          value={formData.street}
          onChange={(e) => onInputChange("street", e.target.value)}
          placeholder="123 Rizal Street"
          className="w-full"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Barangay *</label>
          <Select value={formData.barangay} onValueChange={(v) => onInputChange("barangay", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select barangay" />
            </SelectTrigger>
            <SelectContent>
              {BARANGAY_OPTIONS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">City / Municipality *</label>
          <Select value={formData.city} onValueChange={(v) => onInputChange("city", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              {CITY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
              <p className="text-[11px] text-slate-400">(Requires: Parent&apos;s Valid ID)</p>
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
              <p className="text-[11px] text-slate-500">(Requires: Voter&apos;s ID / Cert)</p>
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

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password *</label>
        <Input
          type="password"
          value={formData.confirmPassword}
          onChange={(e) => onInputChange("confirmPassword", e.target.value)}
          placeholder="••••••••••••"
          className="w-full"
        />
        {formData.confirmPassword && (
          <div className="mt-1 text-xs">
            {formData.password === formData.confirmPassword ? (
              <p className="text-green-600 font-medium">✓ Passwords match</p>
            ) : (
              <p className="text-red-500">Passwords do not match</p>
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
