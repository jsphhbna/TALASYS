"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DEMO_CREDENTIALS, useAuth } from "@/lib/auth-context"
import { BrandMark } from "@/components/layout/brand-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { delay } from "@/lib/async-delay"

const credentialHint = `Invalid credentials. Use your registered email/password, or try "${DEMO_CREDENTIALS.resident.username}/${DEMO_CREDENTIALS.resident.password}", "${DEMO_CREDENTIALS.admin.username}/${DEMO_CREDENTIALS.admin.password}", or "${DEMO_CREDENTIALS.superadmin.username}/${DEMO_CREDENTIALS.superadmin.password}"`

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSigningIn, setIsSigningIn] = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSigningIn) return

    setError("")
    setIsSigningIn(true)
    await delay(650)

    const success = login(username, password)
    if (success) {
      if (username === DEMO_CREDENTIALS.superadmin.username) {
        router.push("/superadmin/dashboard")
      } else if (username === DEMO_CREDENTIALS.admin.username) {
        router.push("/admin/dashboard")
      } else {
        router.push("/dashboard")
      }
    } else {
      setError(credentialHint)
      setIsSigningIn(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center px-4 sm:px-8 shadow-md" role="banner">
        <BrandMark subtitle="Barangay Digital Services" />
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-5 sm:p-8 shadow-lg border-slate-200/80">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#0C2340] mb-2 tracking-tight">Welcome Back</h2>
            <p className="text-sm text-slate-500">Sign in to access your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full h-11"
                disabled={isSigningIn}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full h-11"
                disabled={isSigningIn}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
            )}

            <div className="relative">
              <Button
                type="submit"
                disabled={isSigningIn}
                className="w-full bg-[#0C2340] hover:bg-[#1a3a5c] text-white h-11 font-semibold disabled:opacity-100"
              >
                {isSigningIn ? "Signing In..." : "Sign In"}
              </Button>
              {isSigningIn && <div className="absolute inset-0 rounded-md bg-slate-300/55 animate-pulse" />}
            </div>
          </form>

          <div className="mt-6 text-center space-y-3">
            <div className="space-y-1 bg-slate-50 rounded-md p-3 border border-slate-100">
              <p className="text-xs text-slate-500 font-medium mb-1.5">Demo Credentials</p>
              <p className="text-sm text-slate-600">
                Resident: <span className="font-mono font-semibold text-[#0C2340]">user / user123</span>
              </p>
              <p className="text-sm text-slate-600">
                Admin: <span className="font-mono font-semibold text-[#0C2340]">admin / admin123</span>
              </p>
              <p className="text-sm text-slate-600">
                Super Admin: <span className="font-mono font-semibold text-[#0C2340]">superadmin / superadmin123</span>
              </p>
            </div>
            <p className="text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-[#0C2340] font-semibold hover:underline">
                Create Account
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
