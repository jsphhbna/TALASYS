"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { AdminResident } from "@/lib/admin"
import { ModalOverlay } from "@/components/ui/modal-overlay"

interface ResidentProfileModalProps {
  isOpen: boolean
  onClose: () => void
  resident: AdminResident | null
  userRole: string | undefined
  adminName: string | undefined
  updateResident: (id: string, updates: Partial<AdminResident>, adminName?: string, residentName?: string, removePhotoReason?: string) => Promise<void>
}

export function ResidentProfileModal({ isOpen, onClose, resident, userRole, adminName, updateResident }: ResidentProfileModalProps) {
  const [isEditMode, setIsEditMode] = useState(false)
  const [formData, setFormData] = useState<Partial<AdminResident>>({})
  const [documents, setDocuments] = useState<{name: string; url: string; status: string}[]>([])
  const [validIdUrl, setValidIdUrl] = useState<string | null>(null)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [removePhotoReason, setRemovePhotoReason] = useState("")
  const [isFullImageOpen, setIsFullImageOpen] = useState(false)
  const [isPhotoLightboxOpen, setIsPhotoLightboxOpen] = useState(false)

  // Reset state when opened/closed
  useEffect(() => {
    if (isOpen && resident) {
      setIsEditMode(false)
      setFormData({
        name: resident.name,
        contactNumber: resident.contactNumber,
        email: resident.email,
        dateOfBirth: resident.dateOfBirth,
        address: resident.address,
        profilePicture: resident.profilePicture || "",
      })
      
      // Fetch documents (Valid ID) from verifications collection
      const fetchDocs = async () => {
        setIsLoadingDocuments(true)
        try {
          const { query, where } = await import("firebase/firestore")
          const q = query(
            collection(db, "verifications"), 
            where("residentId", "==", resident.id)
          )
          const snapshot = await getDocs(q)
          if (!snapshot.empty) {
            const allVerifs = snapshot.docs.map(d => d.data())
            allVerifs.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
            
            const aggregatedDocs = new Map<string, any>()
            for (let i = allVerifs.length - 1; i >= 0; i--) {
              const v = allVerifs[i]
              if (v.documents) {
                v.documents.forEach((doc: any) => {
                  const status = v.status === "approved" ? "Valid" : (v.status === "rejected" ? "Rejected" : "Pending")
                  aggregatedDocs.set(doc.name, { ...doc, status })
                })
              }
            }
            
            const validDocs = Array.from(aggregatedDocs.values()).filter(d => d.status === "Valid" || d.status === "Pending")
            setDocuments(validDocs)
          } else {
            setDocuments([])
          }
        } catch (error) {
          console.error("Error fetching resident documents:", error)
          setDocuments([])
        } finally {
          setIsLoadingDocuments(false)
        }
      }
      fetchDocs()
    }
  }, [isOpen, resident])

  if (!isOpen || !resident) return null

  const handleSave = async () => {
    if (resident.profilePicture && formData.profilePicture === "" && removePhotoReason.trim() === "") {
      alert("Please provide a reason for removing the profile picture.")
      return
    }

    await updateResident(resident.id, formData, adminName, resident.name, removePhotoReason)
    setIsEditMode(false)
    setRemovePhotoReason("")
  }

  const canEdit = userRole === "SuperAdmin" || userRole === "Super Admin" || userRole === "Full Access" || userRole === "admin"

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <Card onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl p-0 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Resident Profile</h3>
            {canEdit && (
              <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded uppercase tracking-wider font-semibold">
                {isEditMode ? "Editing Mode" : "View Mode"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !isEditMode && (
              <Button onClick={() => setIsEditMode(true)} variant="outline" size="sm" className="h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
                Edit Profile
              </Button>
            )}
            {isEditMode && (
              <Button onClick={() => {
                setIsEditMode(false)
                setRemovePhotoReason("")
                setFormData({
                  name: resident.name,
                  contactNumber: resident.contactNumber,
                  email: resident.email,
                  dateOfBirth: resident.dateOfBirth,
                  address: resident.address,
                  profilePicture: resident.profilePicture || "",
                })
              }} variant="outline" size="sm" className="h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                Cancel
              </Button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md transition-colors ml-2">✕</button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div id="resident-modal-scroll" className="p-6 overflow-y-auto overscroll-none space-y-8 flex-1">
          {/* Identity Section */}
          <div className="flex items-start gap-5 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="shrink-0 relative group flex flex-col items-center">
              {resident.profilePicture && formData.profilePicture !== "" ? (
                <button
                  onClick={() => setIsPhotoLightboxOpen(true)}
                  className="relative focus:outline-none"
                  title="Click to enlarge"
                >
                  <img src={resident.profilePicture} alt={resident.name} className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shadow-sm transition-all group-hover:ring-2 group-hover:ring-[#0C2340]/40" />
                  <span className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                    <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                  </span>
                </button>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl font-bold text-slate-400 dark:text-slate-500 shadow-sm">
                  {resident.initials}
                </div>
              )}
              {isEditMode && resident.profilePicture && formData.profilePicture !== "" && (
                <button 
                  onClick={() => setFormData({ ...formData, profilePicture: "" })}
                  className="mt-2 text-[10px] text-red-500 font-semibold hover:text-red-600 uppercase tracking-wider"
                >
                  Remove Photo
                </button>
              )}
            </div>
            
            <div className="flex-1 min-w-0 pt-1">
              {isEditMode && resident.profilePicture && formData.profilePicture === "" && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg">
                  <label className="block text-[10px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-1">
                    Reason for Photo Removal (Required)
                  </label>
                  <Input 
                    value={removePhotoReason} 
                    onChange={e => setRemovePhotoReason(e.target.value)}
                    placeholder="e.g., Inappropriate content, not a face" 
                    className="h-8 text-xs bg-white dark:bg-slate-900 border-red-200 dark:border-red-800" 
                  />
                  <button 
                    onClick={() => {
                      setFormData({ ...formData, profilePicture: resident.profilePicture })
                      setRemovePhotoReason("")
                    }}
                    className="mt-2 text-[10px] text-slate-500 hover:text-slate-700 font-medium"
                  >
                    Undo Removal
                  </button>
                </div>
              )}
              {isEditMode ? (
                <input 
                  type="text" 
                  value={formData.name || ''} 
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 bg-transparent border-b-2 border-slate-200 dark:border-slate-700 focus:border-[#0C2340] dark:focus:border-blue-400 outline-none w-full max-w-sm mb-1 px-1 -ml-1 transition-colors"
                  placeholder="Full Name"
                />
              ) : (
                <h2 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 truncate">{resident.name}</h2>
              )}
              
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                  resident.status === "Active" || resident.status === "Verified" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20" : 
                  resident.status === "Expiring" ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" : 
                  "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
                }`}>
                  {resident.status}
                </span>
                
                {resident.categories.map((c: string, i: number) => (
                  <span key={i} className="px-2.5 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-full text-[10px] font-semibold border border-blue-200 dark:border-blue-500/20">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-6 border-b border-slate-100 dark:border-slate-800">
            {/* Personal Details */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-[#0C2340] dark:text-blue-50 uppercase tracking-wider">Personal Details</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Date of Birth</label>
                  {isEditMode ? (
                    <Input type="date" value={formData.dateOfBirth || ''} onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })} className="h-8 text-xs px-2" />
                  ) : (
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{resident.dateOfBirth || "N/A"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Gender</label>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 py-1">{resident.gender || "N/A"}</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Address</label>
                {isEditMode ? (
                  <Input value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} className="h-8 text-xs px-2" />
                ) : (
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{resident.address || "N/A"}</p>
                )}
              </div>
            </div>

            {/* Contact & Account */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-[#0C2340] dark:text-blue-50 uppercase tracking-wider">Contact & Account</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Contact Number</label>
                  {isEditMode ? (
                    <Input value={formData.contactNumber || ''} onChange={e => setFormData({ ...formData, contactNumber: e.target.value })} className="h-8 text-xs px-2" maxLength={11} />
                  ) : (
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{resident.contactNumber || "N/A"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Expiry Date</label>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 py-1">{resident.expiryDate || "N/A"}</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Email Address</label>
                {isEditMode ? (
                  <Input type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} className="h-8 text-xs px-2" />
                ) : (
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{resident.email || "N/A"}</p>
                )}
              </div>
            </div>
          </div>

          {/* Valid ID Section */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-[#0C2340] dark:text-blue-50 uppercase tracking-wider">Submitted Documents</h4>
            {isLoadingDocuments ? (
              <div className="h-40 w-full max-w-sm bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse flex items-center justify-center border border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-400 font-medium">Loading documents...</span>
              </div>
            ) : documents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {documents.map((doc, idx) => (
                  <div key={idx} className="group relative w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
                    <div className="p-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-[#0C2340] dark:text-blue-50 truncate pr-2">{doc.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${doc.status === 'Valid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {doc.status}
                      </span>
                    </div>
                    <div className="relative">
                      <img src={doc.url} alt={doc.name} className="w-full h-auto object-cover max-h-48 bg-slate-100 dark:bg-slate-800" />
                      <div className="absolute inset-0 bg-[#0C2340]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                        <button onClick={() => { setValidIdUrl(doc.url); setIsFullImageOpen(true); }} className="bg-white text-[#0C2340] text-xs font-bold px-4 py-2 rounded shadow-lg hover:bg-slate-50 transition-colors">
                          Open Full Image
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-32 w-full max-w-sm bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">No Documents on file</span>
                <span className="text-[10px] text-slate-400">Resident has not uploaded any documents yet.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {isEditMode && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0">
            <Button variant="outline" onClick={() => {
              setIsEditMode(false)
              setRemovePhotoReason("")
              setFormData({
                name: resident.name,
                contactNumber: resident.contactNumber,
                email: resident.email,
                dateOfBirth: resident.dateOfBirth,
                address: resident.address,
                profilePicture: resident.profilePicture || "",
              })
            }} className="h-9 text-xs font-medium border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              Discard Changes
            </Button>
            <Button onClick={handleSave} className="h-9 text-xs font-medium bg-[#0C2340] hover:bg-[#0a1c33] dark:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm">
              Save & Log Changes
            </Button>
          </div>
        )}
      </Card>

      {/* Full Image Modal */}
      <ModalOverlay isOpen={isFullImageOpen && !!validIdUrl} onClose={() => setIsFullImageOpen(false)} className="bg-black/90 z-[60]">
        <button 
          onClick={() => setIsFullImageOpen(false)}
          className="absolute top-4 right-4 text-white hover:text-slate-300 p-2 rounded-full bg-black/50 hover:bg-black/80 transition-colors"
        >
          ✕
        </button>
        <img 
          src={validIdUrl as string} 
          alt="Valid ID Full View" 
          className="max-w-full max-h-[90vh] object-contain rounded-sm"
        />
      </ModalOverlay>

      {/* Profile Photo Lightbox */}
      <ModalOverlay isOpen={isPhotoLightboxOpen && !!resident.profilePicture} onClose={() => setIsPhotoLightboxOpen(false)} className="bg-black/90 z-[70] flex-col">
        <button
          onClick={() => setIsPhotoLightboxOpen(false)}
          className="absolute top-4 right-4 text-white hover:text-slate-300 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          ✕
        </button>

        <p className="text-white/60 text-sm font-medium mb-4 tracking-wide">{resident.name}'s Profile Photo</p>

        <img
          src={resident.profilePicture}
          alt={resident.name}
          onClick={(e) => e.stopPropagation()}
          className="max-w-sm w-full max-h-[65vh] object-contain rounded-2xl shadow-2xl border border-white/10"
        />

        <div onClick={(e) => e.stopPropagation()} className="mt-6 flex items-center gap-3">
          <p className="text-white/50 text-xs">Judge if the photo is appropriate before deciding to remove it.</p>
          {canEdit && (
            <button
              onClick={() => {
                setFormData({ ...formData, profilePicture: "" })
                setIsPhotoLightboxOpen(false)
                if (!isEditMode) setIsEditMode(true)
              }}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Remove Photo
            </button>
          )}
        </div>
      </ModalOverlay>
    </ModalOverlay>
  )
}
