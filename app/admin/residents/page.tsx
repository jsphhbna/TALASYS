"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { allResidents } from "@/lib/admin-data"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts"
import { Users, UserCheck, Clock, AlertTriangle, UserPlus } from "lucide-react"

export default function ResidentManagement() {
  type ResidentRecord = (typeof allResidents)[number]

  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedAccountStatus, setSelectedAccountStatus] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [showActionsMenu, setShowActionsMenu] = useState<string | null>(null)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [selectedResident, setSelectedResident] = useState<ResidentRecord | null>(null)

  const filteredResidents = allResidents.filter((r) => {
    const matchesCategory = selectedCategory === "all" || r.categories.some(c => c.toLowerCase().includes(selectedCategory.toLowerCase()))
    const matchesStatus = selectedStatus === "all" || r.status === selectedStatus
    const matchesAccountStatus =
      selectedAccountStatus === "all" ||
      (selectedAccountStatus === "Active" && r.status === "Active") ||
      (selectedAccountStatus === "Expiring Soon" && r.status === "Expiring") ||
      (selectedAccountStatus === "Expired" && r.status === "Expired")
    const matchesSearch =
      searchQuery === "" ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.contactNumber.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch && matchesStatus && matchesCategory && matchesAccountStatus
  })

  const getCategoryDisplay = (categories: string[]) => {
    const cat = categories[0] || "Resident"
    if (cat.includes("Senior")) return { label: "Senior", color: "bg-blue-50 text-blue-900" }
    if (cat.includes("Underage") || cat.includes("Minor")) return { label: "Minor", color: "bg-amber-50 text-amber-900" }
    if (cat.includes("Adult")) return { label: "Adult", color: "bg-green-50 text-green-900" }
    if (cat.includes("Voter")) return { label: "Voter", color: "bg-teal-50 text-teal-900" }
    return { label: cat, color: "bg-slate-50 text-slate-900" }
  }

  const activeCount = allResidents.filter(r => r.status === "Active").length
  const expiringCount = allResidents.filter(r => r.status === "Expiring").length
  const expiredCount = allResidents.filter(r => r.status === "Expired").length

  const statusDistribution = [
    { name: "Active", value: activeCount, color: "#16a34a" },
    { name: "Expiring", value: expiringCount, color: "#d97706" },
    { name: "Expired", value: expiredCount, color: "#dc2626" },
  ]

  const recentUpdates = [
    { name: "Maria Santos", action: "New Registration", time: "2m ago" },
    { name: "Ana Cruz", action: "Profile Edit", time: "1h ago" },
    { name: "Jose Garcia", action: "Reactivation", time: "3h ago" },
    { name: "Elena Rodriguez", action: "Expiring Soon", time: "5h ago" },
  ]

  return (
    <AdminPageShell>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Resident Management</h1>
            <p className="text-sm text-slate-500 mt-0.5">View, search, and manage all registered residents</p>
          </div>

          {/* Population Summary KPIs */}
          <div className="grid grid-cols-12 gap-6 mb-6">
            <div className="col-span-8 grid grid-cols-4 gap-4">
              <Card className="p-4 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
                  <Users className="w-4 h-4 text-[#0C2340]" />
                </div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Population</p>
                <p className="text-2xl font-bold text-[#0C2340]">{allResidents.length.toLocaleString()}</p>
              </Card>
              <Card className="p-4 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Active</p>
                <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
              </Card>
              <Card className="p-4 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Expiring</p>
                <p className="text-2xl font-bold text-amber-600">{expiringCount}</p>
              </Card>
              <Card className="p-4 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Expired</p>
                <p className="text-2xl font-bold text-red-600">{expiredCount}</p>
              </Card>
            </div>
            <Card className="col-span-4 p-4 shadow-sm">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Status Distribution</h3>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={20} outerRadius={38} dataKey="value" stroke="none">
                        {statusDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {statusDistribution.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-[10px] text-slate-600">{s.name}</span>
                      <span className="text-[10px] font-bold text-[#0C2340]">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Recent Updates Strip */}
          <Card className="p-4 shadow-sm mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#0C2340]" />
                <h3 className="text-[11px] font-semibold text-[#0C2340]">Recent Updates</h3>
              </div>
              <div className="flex items-center gap-4">
                {recentUpdates.map((u, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-[#0C2340]">{u.name}</span>
                    <span className="text-[10px] text-slate-400">• {u.action} • {u.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Filters Section */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm mb-4">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by resident name or contact number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#0C2340]"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Category</label>
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
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Expiring">Expiring</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Account Status</label>
                <Select value={selectedAccountStatus} onValueChange={setSelectedAccountStatus}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select account status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Expiring Soon">Expiring Soon</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 mb-3">
            Showing {filteredResidents.length} {selectedCategory !== "all" ? `${selectedCategory} residents` : "residents"} (filtered from {allResidents.length} total)
          </p>

          {/* Residents Table */}
          <Card className="shadow-sm">
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 rounded-t-lg">
              <div className="grid grid-cols-12 gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <div className="col-span-3">RESIDENT</div>
                <div className="col-span-2">CATEGORY</div>
                <div className="col-span-2">STATUS</div>
                <div className="col-span-2">EXPIRES</div>
                <div className="col-span-3">ACTIONS</div>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredResidents.map((resident) => {
                const categoryDisplay = getCategoryDisplay(resident.categories)
                return (
                  <div key={resident.id} className="px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                    <div className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#0C2340]/[0.08] flex items-center justify-center text-[10px] font-semibold text-[#0C2340]">
                          {resident.initials}
                        </div>
                        <div>
                          <p className="text-[12px] font-semibold text-[#0C2340]">{resident.name}</p>
                          <p className="text-[10px] text-slate-400">{resident.gender}</p>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-medium ${categoryDisplay.color}`}>
                          {categoryDisplay.label}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-medium ${resident.status === "Active" ? "bg-emerald-50 text-emerald-700" :
                            resident.status === "Expiring" ? "bg-amber-50 text-amber-700" :
                              "bg-red-50 text-red-700"
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${resident.status === "Active" ? "bg-emerald-500" :
                              resident.status === "Expiring" ? "bg-amber-500" :
                                "bg-red-500"
                            }`} />
                          {resident.status}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className={`text-[11px] ${resident.status === "Expired" || resident.status === "Expiring" ? "text-red-500 font-medium" : "text-slate-500"}`}>
                          {resident.expiryDate}
                        </span>
                      </div>
                      <div className="col-span-3 flex items-center gap-2 relative">
                        <Button variant="outline" size="sm" onClick={() => { setSelectedResident(resident); setShowViewDialog(true) }} className="h-6 text-[10px] bg-transparent">View</Button>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedResident(resident); setShowEditDialog(true) }} className="h-6 text-[10px] bg-transparent">Edit</Button>
                        <button onClick={() => setShowActionsMenu(showActionsMenu === resident.id ? null : resident.id)} className="w-6 h-6 flex items-center justify-center border border-slate-200 rounded hover:bg-slate-100">
                          <span className="text-slate-600">⋮</span>
                        </button>
                        {showActionsMenu === resident.id && (
                          <div className="absolute right-0 top-8 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                            <button onClick={() => { setSelectedResident(resident); setShowViewDialog(true); setShowActionsMenu(null) }} className="w-full px-4 py-2 text-[11px] text-left hover:bg-slate-50 text-slate-900">View Full Profile</button>
                            <button className="w-full px-4 py-2 text-[11px] text-left hover:bg-slate-50 text-slate-900">Generate Document</button>
                            <button className="w-full px-4 py-2 text-[11px] text-left hover:bg-slate-50 text-slate-900">View History</button>
                            <div className="border-t border-slate-200" />
                            <button onClick={() => { setSelectedResident(resident); setShowDeactivateDialog(true); setShowActionsMenu(null) }} className="w-full px-4 py-2 text-[11px] text-left hover:bg-slate-50 text-red-600">Deactivate Account</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-6 py-3.5 flex items-center justify-between border-t border-slate-200">
              <p className="text-[10px] text-slate-500">Showing 1-{Math.min(10, filteredResidents.length)} of {filteredResidents.length} residents</p>
              <div className="flex items-center gap-1.5">
                <button className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded hover:bg-slate-50"><span className="text-slate-500 text-xs">‹</span></button>
                <button className="w-7 h-7 flex items-center justify-center bg-[#0C2340] text-white text-[10px] rounded">1</button>
                <button className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded hover:bg-slate-50 text-[10px] text-slate-500">2</button>
                <button className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded hover:bg-slate-50 text-[10px] text-slate-500">3</button>
                <button className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded hover:bg-slate-50"><span className="text-slate-500 text-xs">›</span></button>
              </div>
            </div>
          </Card>

          {/* View Dialog */}
          {showViewDialog && selectedResident && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
              <Card className="w-full max-w-2xl p-0 shadow-2xl max-h-[90vh] overflow-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                  <h3 className="text-lg font-bold text-[#0C2340]">Resident Profile</h3>
                  <button onClick={() => setShowViewDialog(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                <div className="p-6 space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-[#0C2340]/[0.08] flex items-center justify-center text-lg font-semibold text-[#0C2340]">{selectedResident.initials}</div>
                    <div>
                      <h4 className="text-lg font-bold text-[#0C2340]">{selectedResident.name}</h4>
                      <p className="text-sm text-slate-500">{selectedResident.gender}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Date of Birth</p><p className="text-sm text-[#0C2340]">{selectedResident.dateOfBirth}</p></div>
                    <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Contact Number</p><p className="text-sm text-[#0C2340]">{selectedResident.contactNumber}</p></div>
                    <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Email</p><p className="text-sm text-[#0C2340]">{selectedResident.email}</p></div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Account Status</p>
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-medium ${selectedResident.status === "Active" ? "bg-emerald-50 text-emerald-700" : selectedResident.status === "Expiring" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{selectedResident.status}</span>
                    </div>
                    <div className="col-span-2"><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Address</p><p className="text-sm text-[#0C2340]">{selectedResident.address}</p></div>
                    <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Categories</p><div className="flex gap-1">{selectedResident.categories.map((c: string, i: number) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-900 rounded text-[10px]">{c}</span>)}</div></div>
                    <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Expiry Date</p><p className="text-sm text-[#0C2340]">{selectedResident.expiryDate}</p></div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Edit Dialog */}
          {showEditDialog && selectedResident && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
              <Card className="w-full max-w-2xl p-0 shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                  <h3 className="text-lg font-bold text-[#0C2340]">Edit Resident</h3>
                  <button onClick={() => setShowEditDialog(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                <div className="p-6">
                  <p className="text-sm text-slate-600 mb-4">Edit functionality would be implemented here with form fields for all resident data.</p>
                  <Button onClick={() => setShowEditDialog(false)} className="w-full h-11 bg-[#0C2340] hover:bg-[#0a1c33]">Save Changes</Button>
                </div>
              </Card>
            </div>
          )}

          {/* Deactivate Dialog */}
          {showDeactivateDialog && selectedResident && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
              <Card className="w-full max-w-md p-0 shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                  <h3 className="text-lg font-bold text-[#0C2340]">Deactivate Account</h3>
                  <button onClick={() => setShowDeactivateDialog(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                <div className="p-6">
                  <p className="text-sm text-slate-600 mb-4">Are you sure you want to deactivate <strong>{selectedResident.name}</strong>&apos;s account? This action can be reversed later.</p>
                  <div className="flex gap-4">
                    <Button onClick={() => setShowDeactivateDialog(false)} className="flex-1 h-11 bg-red-600 hover:bg-red-700">Deactivate</Button>
                    <Button variant="outline" onClick={() => setShowDeactivateDialog(false)} className="flex-1 h-11 bg-transparent">Cancel</Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
    </AdminPageShell>
  )
}
