"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/admin"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import {
  Users, UserCheck, Clock, AlertTriangle, Search, Inbox,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import dynamic from 'next/dynamic'
import { ModalOverlay } from "@/components/ui/modal-overlay"

const ResidentProfileModal = dynamic(
  () => import('@/components/admin/resident-profile-modal').then(mod => mod.ResidentProfileModal),
  { ssr: false }
)

export default function ResidentManagement() {
  const { residents: allResidents, activityLogs, stats, deleteResident, deactivateResident, activateResident, updateResident } = useAdminData()
  const { user } = useAuth()
  type ResidentRecord = (typeof allResidents)[number]

  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedGender, setSelectedGender] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [showActivateDialog, setShowActivateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedResident, setSelectedResident] = useState<ResidentRecord | null>(null)

  const filteredResidents = allResidents.filter((r) => {
    const matchesCategory = selectedCategory === "all" || r.categories.some(c => c.toLowerCase().includes(selectedCategory.toLowerCase()))
    const matchesStatus = selectedStatus === "all" || r.status === selectedStatus
    const matchesGender = selectedGender === "all" || (r.gender || "").toLowerCase() === selectedGender.toLowerCase()
    const matchesSearch =
      searchQuery === "" ||
      (r.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.contactNumber || "").toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch && matchesStatus && matchesCategory && matchesGender
  })

  const getCategoryDisplay = (categories: string[]) => {
    const cat = categories[0] || "Resident"
    if (cat.includes("Senior")) return { label: "Senior", color: "bg-blue-50 text-blue-900" }
    if (cat.includes("Underage") || cat.includes("Minor")) return { label: "Minor", color: "bg-amber-50 text-amber-900" }
    if (cat.includes("Adult")) return { label: "Adult", color: "bg-green-50 text-green-900" }
    if (cat.includes("Voter")) return { label: "Voter", color: "bg-teal-50 text-teal-900" }
    return { label: cat, color: "bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100" }
  }

  const activeCount = allResidents.filter(r => r.status === "Verified").length
  const expiringCount = allResidents.filter(r => r.status === "Expiring").length
  const expiredCount = allResidents.filter(r => r.status === "Expired").length

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Resident Management</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">View, search, and manage all registered residents</p>
      </div>

      {/* Filters Section */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-5 shadow-sm mb-4">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by resident name or contact number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:border-[#0C2340] dark:focus:border-blue-400 bg-white dark:bg-slate-900 transition-colors"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">Category</label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Senior">Senior</SelectItem>
                <SelectItem value="Underage">Minor</SelectItem>
                <SelectItem value="Adult">Adult</SelectItem>
                <SelectItem value="Voter">Voter</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">Status</label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Verified">Verified</SelectItem>
                <SelectItem value="Expiring">Expiring</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">Gender</label>
            <Select value={selectedGender} onValueChange={setSelectedGender}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genders</SelectItem>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3">
        Showing {filteredResidents.length} {selectedCategory !== "all" ? `${selectedCategory} residents` : "residents"} (filtered from {allResidents.length} total)
      </p>

      {/* Residents Table */}
      <Card className="shadow-sm overflow-hidden p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3 font-bold">RESIDENT</th>
                <th className="px-6 py-3 font-bold">CATEGORY</th>
                <th className="px-6 py-3 font-bold">STATUS</th>
                <th className="px-6 py-3 font-bold">EXPIRES</th>
                <th className="px-6 py-3 font-bold text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredResidents.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-12 text-center text-slate-400">
                <div className="flex flex-col items-center justify-center">
                  <Inbox className="w-8 h-8 mb-2" />
                  <p className="text-sm">No residents found</p>
                  <p className="text-[10px] mt-1">Residents will appear here after registration</p>
                </div>
              </td>
            </tr>
          ) : filteredResidents.map((resident) => {
            const categoryDisplay = getCategoryDisplay(resident.categories)
            return (
              <tr key={resident.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    {resident.profilePicture ? (
                      <img 
                        src={resident.profilePicture} 
                        alt={resident.name} 
                        className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#0C2340] dark:bg-slate-800 flex items-center justify-center text-[10px] font-semibold text-white dark:text-blue-50">
                        {resident.initials}
                      </div>
                    )}
                    <div>
                      <p className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{resident.name}</p>
                      <p className="text-[10px] text-slate-400">{resident.gender}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {resident.categories.map((cat, ci) => {
                      const d = getCategoryDisplay([cat])
                      return (
                        <span key={ci} className={`px-2.5 py-0.5 rounded text-[10px] font-medium ${d.color}`}>
                          {d.label}
                        </span>
                      )
                    })}
                  </div>
                </td>
                <td className="px-6 py-3.5">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-medium ${resident.status === "Verified" ? "bg-emerald-50 text-emerald-700" :
                      resident.status === "Expiring" ? "bg-amber-50 text-amber-700" :
                        "bg-red-50 text-red-700"
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${resident.status === "Verified" ? "bg-emerald-500" :
                        resident.status === "Expiring" ? "bg-amber-500" :
                          "bg-red-500"
                        }`} />
                      {resident.status}
                    </span>
                </td>
                <td className="px-6 py-3.5 whitespace-nowrap">
                  <span className={`text-[11px] ${resident.status === "Expired" || resident.status === "Expiring" ? "text-red-500 font-medium" : "text-slate-500 dark:text-slate-400"}`}>
                      {resident.expiryDate}
                    </span>
                </td>
                <td className="px-6 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-2 relative">
                    <Button variant="outline" size="sm" onClick={() => { setSelectedResident(resident); setShowViewDialog(true) }} className="h-6 text-[10px] bg-transparent hover:bg-[#0C2340] hover:text-white transition-colors">View Profile</Button>
                    {user?.role !== "View Only" && (
                      <>
                        <button onClick={() => setShowActionsMenu(showActionsMenu === resident.id ? null : resident.id)} className="w-6 h-6 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:bg-slate-800">
                          <span className="text-slate-600 dark:text-slate-400">⋮</span>
                        </button>
                        {showActionsMenu === resident.id && (
                          <div className="absolute right-0 top-8 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10">
                            {resident.status === "Expired" ? (
                              <button onClick={() => { setSelectedResident(resident); setShowActivateDialog(true); setShowActionsMenu(null) }} className="w-full px-4 py-2 text-[11px] text-left hover:bg-slate-50 dark:bg-slate-950 text-emerald-600">Activate Account</button>
                            ) : (
                              <button onClick={() => { setSelectedResident(resident); setShowDeactivateDialog(true); setShowActionsMenu(null) }} className="w-full px-4 py-2 text-[11px] text-left hover:bg-slate-50 dark:bg-slate-950 text-amber-600">Deactivate Account</button>
                            )}
                            <div className="border-t border-slate-200 dark:border-slate-700" />
                            <button onClick={() => { setSelectedResident(resident); setShowDeleteDialog(true); setShowActionsMenu(null) }} className="w-full px-4 py-2 text-[11px] text-left hover:bg-slate-50 dark:bg-slate-950 text-red-600">Delete Resident</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          </tbody>
          </table>
        </div>
        <div className="px-6 py-3.5 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Showing 1-{Math.min(10, filteredResidents.length)} of {filteredResidents.length} residents</p>
          <div className="flex items-center gap-1.5">
            <button className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950"><span className="text-slate-500 dark:text-slate-400 text-xs">‹</span></button>
            <button className="w-7 h-7 flex items-center justify-center bg-[#0C2340] dark:bg-slate-800 text-white text-[10px] rounded">1</button>
            <button className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950 text-[10px] text-slate-500 dark:text-slate-400">2</button>
            <button className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950 text-[10px] text-slate-500 dark:text-slate-400">3</button>
            <button className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950"><span className="text-slate-500 dark:text-slate-400 text-xs">›</span></button>
          </div>
        </div>
      </Card>

      {/* Resident Profile Modal */}
      <ResidentProfileModal
        isOpen={showViewDialog}
        onClose={() => setShowViewDialog(false)}
        resident={selectedResident}
        userRole={user?.role}
        adminName={user?.name}
        updateResident={updateResident}
      />

      {/* Deactivate Dialog */}
      {showDeactivateDialog && selectedResident && (
        <ModalOverlay isOpen={true} onClose={() => setShowDeactivateDialog(false)}>
          <Card className="w-full max-w-md p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Deactivate Account</h3>
              <button onClick={() => setShowDeactivateDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Are you sure you want to deactivate <strong>{selectedResident.name}</strong>&apos;s account? This action can be reversed later.</p>
              <div className="flex gap-4">
                <Button onClick={() => { deactivateResident(selectedResident.id, user?.name || "Admin", selectedResident.name); setShowDeactivateDialog(false) }} className="flex-1 h-11 bg-red-600 hover:bg-red-700">Deactivate</Button>
                <Button variant="outline" onClick={() => setShowDeactivateDialog(false)} className="flex-1 h-11 bg-transparent">Cancel</Button>
              </div>
            </div>
          </Card>
        </ModalOverlay>
      )}

      {/* Activate Dialog */}
      {showActivateDialog && selectedResident && (
        <ModalOverlay isOpen={true} onClose={() => setShowActivateDialog(false)}>
          <Card className="w-full max-w-md p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Activate Account</h3>
              <button onClick={() => setShowActivateDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Are you sure you want to activate <strong>{selectedResident.name}</strong>&apos;s account? They will regain access to the system.</p>
              <div className="flex gap-4">
                <Button onClick={() => { activateResident(selectedResident.id, user?.name || "Admin", selectedResident.name); setShowActivateDialog(false) }} className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white">Activate</Button>
                <Button variant="outline" onClick={() => setShowActivateDialog(false)} className="flex-1 h-11 bg-transparent">Cancel</Button>
              </div>
            </div>
          </Card>
        </ModalOverlay>
      )}


      {/* Delete Dialog */}
      {showDeleteDialog && selectedResident && (
        <ModalOverlay isOpen={true} onClose={() => setShowDeleteDialog(false)}>
          <Card className="w-full max-w-md p-0 shadow-2xl border-red-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-red-100 bg-red-50">
              <h3 className="text-lg font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Delete Resident
              </h3>
              <button onClick={() => setShowDeleteDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
                This will remove a resident from your baranggay and will be logged. It will be seen by your head of baranggay.
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-6">
                Are you sure?
              </p>
              <div className="flex gap-4">
                <Button 
                  onClick={() => { 
                    deleteResident(selectedResident.id, user?.name || "Admin", selectedResident.name); 
                    setShowDeleteDialog(false) 
                  }} 
                  className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white"
                >
                  Yes, Delete Resident
                </Button>
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="flex-1 h-11 bg-transparent">Cancel</Button>
              </div>
            </div>
          </Card>
        </ModalOverlay>
      )}
    </AdminPageShell>
  )
}
