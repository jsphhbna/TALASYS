"use client"

import { useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSuperAdminData } from "@/hooks/use-superadmin-data"
import { useMounted } from "@/hooks/use-mounted"
import {
  Users, ShieldCheck, Lock, Wifi, TrendingUp, TrendingDown,
  CheckCircle, Eye, AlertTriangle, Settings,
} from "lucide-react"

// --- Mini Sparkline ---
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 56; const h = 24
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4)}`).join(" ")
  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const activityDotColors: Record<string, string> = {
  approval: "bg-emerald-500", verification: "bg-blue-500", rejection: "bg-red-500",
  generation: "bg-[#C5A55A]", system: "bg-slate-500",
}

export default function AdminManagement() {
  const { adminAccounts, auditLogs, addAdmin, updateAdmin, deleteAdmin } = useSuperAdminData()
  const mounted = useMounted()
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [selectedAdmin, setSelectedAdmin] = useState<any>(null)
  
  const adminRecentActions = auditLogs.slice(0, 5).map(l => ({
    admin: l.admin?.name || "System",
    action: l.actionType,
    target: l.details,
    time: l.date
  }))

  // Real activity trend from audit logs grouped by day
  const now = Date.now()
  const dayMs = 1000 * 60 * 60 * 24
  const adminActivityTrend = Array.from({ length: 7 }).map((_, i) => {
    const start = now - (6 - i) * dayMs
    const end = start + dayMs
    const count = auditLogs.filter(l => {
      const ts = typeof l.timestamp === 'number' ? l.timestamp : new Date(l.timestamp).getTime()
      return ts >= start && ts < end
    }).length
    return {
      day: new Date(now - (6 - i) * dayMs).toLocaleDateString('en-US', { weekday: 'short' }),
      actions: count
    }
  })
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showActionsDropdown, setShowActionsDropdown] = useState<string | null>(null)
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)
  const [selectedRole, setSelectedRole] = useState("Select role...")
  const [selectedAdminForEdit, setSelectedAdminForEdit] = useState<string | null>(null)
  const [showEditPrivilegesModal, setShowEditPrivilegesModal] = useState(false)
  const [showActionDialog, setShowActionDialog] = useState(false)
  const [actionType, setActionType] = useState<"reset" | "lock" | "unlock" | "delete" | null>(null)
  const [selectedAdminName, setSelectedAdminName] = useState("")
  const [selectedAdminId, setSelectedAdminId] = useState("")
  const [actionMessage, setActionMessage] = useState("")

  // Form states for creating admin
  const [newAdminName, setNewAdminName] = useState("")
  const [newAdminEmail, setNewAdminEmail] = useState("")
  const [newAdminPassword, setNewAdminPassword] = useState("")

  const filteredAdmins = adminAccounts.filter((admin) => {
    const matchesSearch =
      admin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      admin.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || admin.status.toLowerCase() === statusFilter
    return matchesSearch && matchesStatus
  })

  const activeCount = adminAccounts.filter((a) => a.status === "Active").length
  const lockedCount = adminAccounts.filter((a) => a.status === "Locked").length
  const onlineCount = adminAccounts.filter((a) => a.isOnline).length

  const roles = [
    { label: "Full Access", description: "All features" },
    { label: "Verification Only", description: "Verify accounts only" },
    { label: "Documents Only", description: "Process documents only" },
    { label: "View Only", description: "Read-only access" },
  ]

  const handleEditPrivileges = (adminId: string) => {
    setSelectedAdminForEdit(adminId)
    setShowEditPrivilegesModal(true)
    setShowActionsDropdown(null)
  }

  const handleResetPassword = (adminId: string, adminName: string) => {
    setSelectedAdminId(adminId)
    setSelectedAdminName(adminName)
    setActionType("reset")
    setActionMessage(`A temporary password has been sent to ${adminName}'s email.`)
    setShowActionDialog(true)
    setShowActionsDropdown(null)
  }

  const handleLockAccount = (adminId: string, adminName: string, isLocked: boolean) => {
    setSelectedAdminId(adminId)
    setSelectedAdminName(adminName)
    setActionType(isLocked ? "unlock" : "lock")
    setActionMessage(
      isLocked
        ? `Are you sure you want to unlock ${adminName}'s account?`
        : `Are you sure you want to lock ${adminName}'s account? This action can be reversed.`
    )
    setShowActionDialog(true)
    setShowActionsDropdown(null)
  }

  const handleDeleteAccount = (adminId: string, adminName: string) => {
    setSelectedAdminId(adminId)
    setSelectedAdminName(adminName)
    setActionType("delete")
    setActionMessage(`Are you sure you want to delete ${adminName}'s account? This action is permanent.`)
    setShowActionDialog(true)
    setShowActionsDropdown(null)
  }

  const confirmAction = async () => {
    if (actionType === "reset") {
      try {
        const { sendPasswordResetEmail } = await import("firebase/auth")
        const { auth } = await import("@/lib/firebase")
        const adminToReset = adminAccounts.find(a => a.id === selectedAdminId)
        if (adminToReset) {
          await sendPasswordResetEmail(auth, adminToReset.email)
          setActionMessage(`Password reset email sent to ${selectedAdminName}`)
        }
      } catch (e) {
        setActionMessage(`Failed to send password reset email.`)
      }
    } else if (actionType === "lock") {
      updateAdmin(selectedAdminId, { status: "Locked" })
      setActionMessage(`Account locked successfully for ${selectedAdminName}`)
    } else if (actionType === "unlock") {
      updateAdmin(selectedAdminId, { status: "Active" })
      setActionMessage(`Account unlocked successfully for ${selectedAdminName}`)
    } else if (actionType === "delete") {
      deleteAdmin(selectedAdminId)
      setActionMessage(`Account deleted successfully for ${selectedAdminName}`)
    }
    setTimeout(() => {
      setShowActionDialog(false)
      setActionType(null)
    }, 1500)
  }

  const handleCreateAdmin = () => {
    if (!newAdminName || !newAdminEmail || !newAdminPassword || selectedRole === "Select role...") return
    addAdmin({
      name: newAdminName,
      email: newAdminEmail,
      password: newAdminPassword,
      role: selectedRole as any,
      status: "Active"
    })
    setShowCreateModal(false)
    setNewAdminName("")
    setNewAdminEmail("")
    setNewAdminPassword("")
    setSelectedRole("Select role...")
  }

  const kpis = [
    { label: "Total Admins", value: adminAccounts.length, icon: Users, color: "#0C2340", spark: [3, 3, 4, 4, 5, 5], change: +25 },
    { label: "Active", value: activeCount, icon: ShieldCheck, color: "#10b981", spark: [2, 3, 3, 3, 4, 4], change: +33 },
    { label: "Locked", value: lockedCount, icon: Lock, color: "#ef4444", spark: [1, 1, 0, 1, 1, 1], change: 0 },
    { label: "Online Now", value: onlineCount, icon: Wifi, color: "#3b82f6", spark: [1, 2, 3, 2, 3, 3], change: +50 },
  ]

  if (!mounted) {
    return <div className="flex h-full items-center justify-center p-8">Loading admins...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Admin Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create, manage, and control admin account access</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="bg-[#0C2340] hover:bg-[#0a1c33]">
          + Create Admin
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center">
                <kpi.icon className="w-4 h-4 text-[#0C2340]" />
              </div>
              <Sparkline data={kpi.spark} color={kpi.color} />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">{kpi.label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#0C2340]">{kpi.value}</span>
              {kpi.change !== 0 && (
                <span className={`text-[10px] font-medium flex items-center gap-0.5 ${kpi.change > 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {kpi.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {kpi.change > 0 ? "+" : ""}{kpi.change}%
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Analytics Row: Activity Trend + Role Distribution + Recent Actions */}
      <div className="grid grid-cols-12 gap-6">
        {/* Activity Trend */}
        <Card className="col-span-5 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Admin Activity</h2>
          <p className="text-[11px] text-slate-500 mb-4">Logins and actions over 6 months</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={adminActivityTrend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradLogins" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0C2340" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#0C2340" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradActions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C5A55A" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#C5A55A" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                labelStyle={{ fontWeight: 600, color: "#0C2340" }}
              />
              <Area type="monotone" dataKey="logins" stroke="#0C2340" strokeWidth={2} fill="url(#gradLogins)" name="Logins" />
              <Area type="monotone" dataKey="actions" stroke="#C5A55A" strokeWidth={2} fill="url(#gradActions)" name="Actions" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-[10px]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#0C2340]" /> Logins</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#C5A55A]" /> Actions</span>
          </div>
        </Card>

        {/* Role Distribution */}
        <Card className="col-span-3 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Role Distribution</h2>
          <p className="text-[11px] text-slate-500 mb-3">Admin access levels</p>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={stats.roleDistribution} cx="50%" cy="50%" innerRadius={32} outerRadius={52} dataKey="value" stroke="none" paddingAngle={3}>
                {stats.roleDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold" fill="#0C2340">{adminAccounts.length}</text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-[9px]" fill="#94a3b8">total</text>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-1">
            {stats.roleDistribution.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-slate-600">{r.name}</span>
                </span>
                <span className="font-semibold text-[#0C2340]">{r.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Admin Actions */}
        <Card className="col-span-4 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-3">Recent Actions</h2>
          <div className="space-y-3">
            {adminRecentActions.map((act, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className={`w-6 h-6 rounded-full ${activityDotColors[act.type]} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <span className="text-[8px] text-white font-bold">{act.admin.split(" ")[0][0]}{act.admin.split(" ")[1]?.[0] || ""}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-800">
                    <span className="font-semibold text-[#0C2340]">{act.admin}</span> {act.action.toLowerCase()}
                  </p>
                  <p className="text-[10px] text-slate-400">{act.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-3">
        <Input
          placeholder="Search admin by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-md text-sm"
        >
          <option value="all">Status: All</option>
          <option value="active">Active</option>
          <option value="locked">Locked</option>
        </select>
      </div>

      {/* Admin Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
        <div className="min-w-[800px]">
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-3"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Admin</p></div>
              <div className="col-span-3"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Email</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Role</p></div>
              <div className="col-span-1"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last Active</p></div>
              <div className="col-span-1"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</p></div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
          {filteredAdmins.map((admin) => (
            <div key={admin.id} className="px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
              <div className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0C2340] flex items-center justify-center shrink-0">
                    <span className="text-[10px] text-white font-medium">{admin.initials}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0C2340]">{admin.name}</p>
                    <p className="text-[10px] text-slate-500">Since {admin.createdDate}</p>
                  </div>
                </div>
                <div className="col-span-3"><p className="text-sm text-slate-700">{admin.email}</p></div>
                <div className="col-span-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                    {admin.role === "Full Access" && <ShieldCheck className="w-3 h-3 text-[#0C2340]" />}
                    {admin.role === "Verification Only" && <CheckCircle className="w-3 h-3 text-blue-500" />}
                    {admin.role === "Documents Only" && <Settings className="w-3 h-3 text-[#C5A55A]" />}
                    {admin.role === "View Only" && <Eye className="w-3 h-3 text-slate-400" />}
                    {admin.role}
                  </span>
                </div>
                <div className="col-span-1">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${admin.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}>
                    {admin.status === "Active" && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {admin.status}
                  </div>
                </div>
                <div className="col-span-2"><p className="text-sm text-slate-600">{admin.lastActive}</p></div>
                <div className="col-span-1 relative">
                  <button
                    onClick={() => setShowActionsDropdown(showActionsDropdown === admin.id ? null : admin.id)}
                    className="px-3 py-2 text-slate-500 hover:bg-slate-100 rounded transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="3" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="8" cy="13" r="1.5" />
                    </svg>
                  </button>

                  {showActionsDropdown === admin.id && (
                    <div className="absolute right-0 mt-2 w-44 bg-white rounded-lg border border-slate-200 shadow-lg z-10">
                      <button onClick={() => handleEditPrivileges(admin.id)} className="w-full text-left px-4 py-2.5 text-sm text-slate-900 hover:bg-slate-50">Edit Privileges</button>
                      <div className="h-px bg-slate-200" />
                      <button onClick={() => handleResetPassword(admin.id, admin.name)} className="w-full text-left px-4 py-2.5 text-sm text-slate-900 hover:bg-slate-50">Reset Password</button>
                      <div className="h-px bg-slate-200" />
                      <button onClick={() => handleLockAccount(admin.id, admin.name, admin.status === "Locked")} className="w-full text-left px-4 py-2.5 text-sm text-slate-900 hover:bg-slate-50">{admin.status === "Locked" ? "Unlock Account" : "Lock Account"}</button>
                      <div className="h-px bg-slate-200" />
                      <button onClick={() => handleDeleteAccount(admin.id, admin.name)} className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-slate-50">Delete Account</button>
                    </div>
                  )}
                </div>
              </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Admin Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#0C2340]">Create New Admin</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-[#0C2340] mb-4">Personal Information</h3>
                <div className="space-y-4">
                  <div><label className="block text-xs text-slate-600 mb-2">Full Name *</label><Input value={newAdminName} onChange={e => setNewAdminName(e.target.value)} placeholder="Enter full name" /></div>
                  <div><label className="block text-xs text-slate-600 mb-2">Email Address *</label><Input value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} placeholder="admin@barangay.gov.ph" /></div>
                  <div><label className="block text-xs text-slate-600 mb-2">Contact Number</label><Input placeholder="+63 9XX XXX XXXX" /></div>
                </div>
              </div>
              <div className="h-px bg-slate-200" />
              <div>
                <h3 className="text-sm font-bold text-[#0C2340] mb-4">Access Privileges</h3>
                <div className="relative">
                  <button onClick={() => setShowRoleDropdown(!showRoleDropdown)} className="w-full px-4 py-3 border border-slate-300 rounded-md text-left text-sm text-slate-900 flex justify-between items-center">
                    {selectedRole}
                    <span className="text-slate-600">▼</span>
                  </button>
                  {showRoleDropdown && (
                    <div className="absolute w-full mt-2 bg-white rounded-lg border border-slate-200 shadow-lg z-10">
                      {roles.map((role, i) => (
                        <button key={role.label} onClick={() => { setSelectedRole(role.label); setShowRoleDropdown(false) }}
                          className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 ${i === 0 ? "bg-slate-50" : ""}`}>
                          <p className="font-medium text-slate-900">{role.label}</p>
                          <p className="text-xs text-slate-600 text-right">{role.description}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-2">Temporary Password *</label>
                <div className="flex gap-3">
                  <Input value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} placeholder="Auto-generated or enter manually" className="flex-1" />
                  <Button variant="outline" onClick={() => setNewAdminPassword("Tal@sys" + Math.floor(Math.random() * 1000))} className="px-6 bg-transparent">Generate</Button>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button onClick={handleCreateAdmin} className="bg-[#0C2340] hover:bg-[#0a1c33]">Create Admin</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Privileges Modal */}
      {showEditPrivilegesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#0C2340]">Edit Admin Privileges</h2>
              <button onClick={() => setShowEditPrivilegesModal(false)} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
            </div>
            <div className="p-6">
              <label className="block text-xs text-slate-600 mb-3 font-semibold">SELECT ROLE</label>
              <div className="space-y-2">
                {roles.map((role) => (
                  <button key={role.label} onClick={() => { updateAdmin(selectedAdminForEdit!, { role: role.label as any }); setShowEditPrivilegesModal(false) }} className="w-full text-left px-4 py-2.5 border border-slate-200 rounded-md hover:bg-slate-50 text-sm">
                    <p className="font-medium text-slate-900">{role.label}</p>
                    <p className="text-xs text-slate-600">{role.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowEditPrivilegesModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Action Dialog */}
      {showActionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-bold text-[#0C2340]">
                {actionType === "reset" ? "Reset Password" : actionType === "lock" ? "Lock Account" : actionType === "unlock" ? "Unlock Account" : "Delete Account"}
              </h2>
            </div>
            <div className="p-6"><p className="text-sm text-slate-700">{actionMessage}</p></div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowActionDialog(false)}>Cancel</Button>
              <Button
                className={actionType === "lock" || actionType === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-[#0C2340] hover:bg-[#0a1c33]"}
                onClick={() => { confirmAction() }}
              >
                {actionType === "reset" ? "Confirm Reset" : actionType === "lock" ? "Lock Account" : actionType === "unlock" ? "Unlock Account" : "Delete Account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
