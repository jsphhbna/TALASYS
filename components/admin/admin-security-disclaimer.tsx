"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ShieldAlert, AlertTriangle, CheckCircle2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

export function AdminSecurityDisclaimer() {
  const [isOpen, setIsOpen] = useState(false)
  const [neverShowAgain, setNeverShowAgain] = useState(false)

  useEffect(() => {
    const hasSeenSession = sessionStorage.getItem("adminSecurityDisclaimerShown")
    const hasSeenForever = localStorage.getItem("adminSecurityDisclaimerShownForever")
    
    if (!hasSeenSession && !hasSeenForever) {
      const timer = setTimeout(() => setIsOpen(true), 500)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAccept = () => {
    if (neverShowAgain) {
      localStorage.setItem("adminSecurityDisclaimerShownForever", "true")
    } else {
      sessionStorage.setItem("adminSecurityDisclaimerShown", "true")
    }
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent 
        className="sm:max-w-[500px] bg-white dark:bg-slate-900 border-red-100 dark:border-red-900 shadow-2xl overflow-hidden p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Administrator Access Granted</DialogTitle>
          <DialogDescription>Data Privacy Act of 2012 Compliance Warning</DialogDescription>
        </DialogHeader>

        <div className="bg-red-50 dark:bg-red-950/30 p-6 flex flex-col items-center text-center border-b border-red-100 dark:border-red-900">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-red-700 dark:text-red-400">
            Administrator Access Granted
          </h2>
          <p className="text-red-600/80 dark:text-red-400/80 font-medium mt-1">
            Data Privacy Act of 2012 Compliance Warning
          </p>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            You are now accessing a restricted area containing highly sensitive Personally Identifiable Information (PII), including government-issued IDs, contact numbers, and addresses of barangay residents.
          </p>
          
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-700 space-y-3">
            <h4 className="text-sm font-bold text-[#0C2340] dark:text-blue-50 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> By proceeding, you agree to:
            </h4>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span><strong>Never share or leak</strong> direct links to resident IDs or photos.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span><strong>Do not screenshot or download</strong> resident documents for personal use.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <span>Keep your session secure and <strong>log out</strong> when leaving your device.</span>
              </li>
            </ul>
          </div>
          
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic">
            Unauthorized disclosure of this information is strictly prohibited and punishable by law.
          </p>
        </div>

        <DialogFooter className="p-6 pt-0 flex-col sm:flex-col sm:items-center gap-4">
          <div className="flex items-center space-x-2 w-full justify-center">
            <Checkbox 
              id="never-show" 
              checked={neverShowAgain} 
              onCheckedChange={(checked) => setNeverShowAgain(checked === true)}
            />
            <label
              htmlFor="never-show"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-600 dark:text-slate-400 cursor-pointer"
            >
              Don't show this again
            </label>
          </div>
          <Button 
            onClick={handleAccept}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-semibold px-8"
          >
            I Understand and Agree
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
