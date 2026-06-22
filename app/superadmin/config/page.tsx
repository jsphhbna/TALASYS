"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
const systemHealthMetrics: any = { uptime: 100, storageUsed: 12, storageTotal: 100, responseTime: 45, activeModules: 4, totalModules: 4, activeDocTypes: 5, totalDocTypes: 6 };
import { useSuperAdminData } from "@/hooks/use-superadmin-data"
import { useAdminData } from "@/hooks/use-admin-data"
import {
  Server, HardDrive, Clock, Activity, Shield, FileText,
  Palette, LayoutTemplate, Files, Settings, CheckCircle, Pencil,
} from "lucide-react"

const changeTypeIcons: Record<string, typeof Palette> = {
  branding: Palette,
  module: Settings,
  template: LayoutTemplate,
  document: FileText,
}

export default function SystemConfig() {
  const { systemConfig, updateConfig, auditLogs } = useSuperAdminData()
  const { documentRequests } = useAdminData()
  const [activeTab, setActiveTab] = useState<"branding" | "templates" | "documents">("branding")
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [isSavingChanges, setIsSavingChanges] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState("clearance")
  const [editingTemplate, setEditingTemplate] = useState(false)

  const configChangeLog = auditLogs.filter(l => l.actionType === "Config Edit" || l.actionType === "Settings Updated").slice(0, 5).map(l => ({
    action: l.details,
    type: "branding",
    time: l.date
  }))

  // Local state for edits
  const [formData, setFormData] = useState({
    barangayName: systemConfig.barangayName,
    address: systemConfig.address,
    contactNumber: systemConfig.contactNumber,
    emailAddress: systemConfig.emailAddress,
    barangayCaptainName: systemConfig.barangayCaptainName,
    documentFees: systemConfig.documentFees || {},
  })

  const tabs = [
    { id: "branding" as const, label: "Branding", icon: Palette },
    { id: "templates" as const, label: "Templates", icon: LayoutTemplate },
    { id: "documents" as const, label: "Document Types", icon: Files },
  ]

  const templates = [
    { id: "clearance", name: "Barangay Clearance", lastEdited: "2 days ago" },
    { id: "indigency", name: "Certificate of Indigency", lastEdited: "5 days ago" },
    { id: "residency", name: "Certificate of Residency", lastEdited: "1 week ago" },
    { id: "business", name: "Business Clearance", lastEdited: "2 weeks ago" },
    { id: "fistjob", name: "First Time Job Seeker", lastEdited: "3 weeks ago" },
  ]

  const documentTypes = [
    { name: "Barangay Clearance", enabled: true, requests: documentRequests.filter(r => r.documentType === "Barangay Clearance").length, fee: systemConfig.documentFees?.["Barangay Clearance"] ?? 50 },
    { name: "Certificate of Indigency", enabled: true, requests: documentRequests.filter(r => r.documentType === "Certificate of Indigency").length, fee: systemConfig.documentFees?.["Certificate of Indigency"] ?? 0 },
    { name: "Certificate of Residency", enabled: true, requests: documentRequests.filter(r => r.documentType === "Certificate of Residency").length, fee: systemConfig.documentFees?.["Certificate of Residency"] ?? 50 },
    { name: "Business Clearance", enabled: true, requests: documentRequests.filter(r => r.documentType === "Business Clearance").length, fee: systemConfig.documentFees?.["Business Clearance"] ?? 150 },
    { name: "First Time Job Seeker", enabled: true, requests: documentRequests.filter(r => r.documentType === "First Time Job Seeker").length, fee: systemConfig.documentFees?.["First Time Job Seeker"] ?? 0 },
    { name: "Community Tax Certificate", enabled: false, requests: documentRequests.filter(r => r.documentType === "Community Tax Certificate").length, fee: systemConfig.documentFees?.["Community Tax Certificate"] ?? 0 },
  ]

  const h = systemHealthMetrics

  const maxRequests = Math.max(...documentTypes.map(d => d.requests), 1)

  const handleSaveAllChanges = async () => {
    if (isSavingChanges) return

    setIsSavingChanges(true)
    updateConfig(formData)
    await delay(500)
    setShowSaveDialog(false)
    setIsSavingChanges(false)
    showToastPreset("configSaved")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">System Configuration</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage system branding, templates, and document settings</p>
        </div>
        <Button onClick={() => setShowSaveDialog(true)} className="bg-[#0C2340] hover:bg-[#0a1c33]">Save All Changes</Button>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-12 gap-6">
        {/* Health Metrics */}
        <div className="col-span-8 grid grid-cols-4 gap-4">
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
              <Server className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Uptime</p>
            <span className="text-2xl font-bold text-emerald-600">{h.uptime}%</span>
            <p className="text-[10px] text-slate-400 mt-0.5">System availability</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
              <HardDrive className="w-4 h-4 text-[#0C2340]" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Storage</p>
            <span className="text-2xl font-bold text-[#0C2340]">{h.storageUsed}%</span>
            <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#0C2340] rounded-full" style={{ width: `${h.storageUsed}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{h.storageUsed}GB of {h.storageTotal}GB</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
              <Activity className="w-4 h-4 text-[#0C2340]" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Response Time</p>
            <span className="text-2xl font-bold text-[#0C2340]">{h.responseTime}ms</span>
            <p className="text-[10px] text-slate-400 mt-0.5">Avg server response</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
              <Shield className="w-4 h-4 text-[#0C2340]" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Modules</p>
            <span className="text-2xl font-bold text-[#0C2340]">{h.activeModules}/{h.totalModules}</span>
            <p className="text-[10px] text-slate-400 mt-0.5">Active modules</p>
          </Card>
        </div>

        {/* Recent Changes */}
        <Card className="col-span-4 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-3">Recent Config Changes</h2>
          <div className="space-y-3">
            {configChangeLog.slice(0, 4).map((change, i) => {
              const Icon = changeTypeIcons[change.type] || Settings
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#0C2340]/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-3 h-3 text-[#0C2340]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-800">{change.action}</p>
                    <p className="text-[10px] text-slate-400">{change.time}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id
                ? "border-[#0C2340] text-[#0C2340]"
                : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Branding Tab */}
      {activeTab === "branding" && (
        <div className="grid grid-cols-12 gap-6">
          <Card className="col-span-7 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#0C2340] mb-4">Barangay Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Barangay Name</label>
                <Input value={formData.barangayName} onChange={e => setFormData({ ...formData, barangayName: e.target.value })} placeholder="Barangay Sample" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Municipality / City</label>
                <Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="City of Sample" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Contact Number</label>
                  <Input value={formData.contactNumber} onChange={e => setFormData({ ...formData, contactNumber: e.target.value })} placeholder="(02) 8123-4567" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <Input value={formData.emailAddress} onChange={e => setFormData({ ...formData, emailAddress: e.target.value })} placeholder="barangay@sample.gov.ph" />
                </div>
              </div>
            </div>
          </Card>
          <div className="col-span-5 space-y-6">
            <Card className="p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#0C2340] mb-3">Logo</h3>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <Palette className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-[11px] text-slate-500 mb-2">Drop your logo here or click to upload</p>
                <Button variant="outline" className="text-xs bg-transparent">Browse Files</Button>
              </div>
            </Card>
            <Card className="p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#0C2340] mb-3">E-Signatures</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Barangay Captain</label>
                  <div className="flex gap-2">
                    <Input value={formData.barangayCaptainName} onChange={e => setFormData({ ...formData, barangayCaptainName: e.target.value })} placeholder="Hon. Juan Dela Cruz" className="flex-1" />
                    <Button variant="outline" className="text-xs bg-transparent">Upload Sig</Button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Secretary</label>
                  <div className="flex gap-2">
                    <Input defaultValue="Maria Santos" className="flex-1" />
                    <Button variant="outline" className="text-xs bg-transparent">Upload Sig</Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === "templates" && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4 space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => { setSelectedTemplate(t.id); setEditingTemplate(false) }}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${selectedTemplate === t.id
                  ? "border-[#0C2340] bg-[#0C2340]/[0.03] ring-1 ring-[#0C2340]/20"
                  : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-semibold text-[#0C2340]">{t.name}</p>
                    <p className="text-[10px] text-slate-500">Edited {t.lastEdited}</p>
                  </div>
                  {selectedTemplate === t.id && <CheckCircle className="w-4 h-4 text-[#0C2340]" />}
                </div>
              </button>
            ))}
          </div>
          <Card className="col-span-8 shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-[#0C2340]">Template Editor — {templates.find((t) => t.id === selectedTemplate)?.name}</h3>
              <Button variant="outline" className="text-xs bg-transparent h-8" onClick={() => setEditingTemplate(!editingTemplate)}>
                <Pencil className="w-3 h-3 mr-1.5" /> {editingTemplate ? "Preview" : "Edit"}
              </Button>
            </div>
            <div className="p-5">
              {editingTemplate ? (
                <textarea
                  className="w-full h-64 p-4 border border-slate-200 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[#0C2340]/20"
                  defaultValue={`Republic of the Philippines\n{{barangay_name}}\n{{municipality}}, {{province}}\n\nBrgy. Clearance No.: {{clearance_number}}\n\nTO WHOM IT MAY CONCERN:\n\nThis is to certify that {{resident_name}}, of legal age, is a bonafide resident of this barangay with address at {{address}}.\n\nThis certification is issued upon the request of the above-named person for {{purpose}}.\n\nIssued this {{date_issued}}.\n\n{{captain_name}}\nBarangay Captain`}
                />
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 h-64 overflow-auto">
                  <div className="text-center space-y-1 mb-4">
                    <p className="text-[10px] text-slate-500">Republic of the Philippines</p>
                    <p className="text-[10px] text-slate-500 font-medium">
                      <span className="text-[#C5A55A] bg-[#C5A55A]/10 px-1 rounded">{"{{barangay_name}}"}</span>
                    </p>
                    <p className="text-[10px] text-slate-500">
                      <span className="text-[#C5A55A] bg-[#C5A55A]/10 px-1 rounded">{"{{municipality}}"}</span>,{" "}
                      <span className="text-[#C5A55A] bg-[#C5A55A]/10 px-1 rounded">{"{{province}}"}</span>
                    </p>
                  </div>
                  <div className="h-px bg-slate-200 mb-3" />
                  <p className="text-[11px] text-slate-800 leading-relaxed">
                    This is to certify that <span className="text-[#C5A55A] bg-[#C5A55A]/10 px-1 rounded font-medium">{"{{resident_name}}"}</span>, of legal age, is a bonafide resident of this barangay with address at <span className="text-[#C5A55A] bg-[#C5A55A]/10 px-1 rounded font-medium">{"{{address}}"}</span>.
                  </p>
                  <p className="text-[11px] text-slate-800 leading-relaxed mt-2">
                    This certification is issued upon the request of the above-named person for <span className="text-[#C5A55A] bg-[#C5A55A]/10 px-1 rounded font-medium">{"{{purpose}}"}</span>.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Document Types Tab */}
      {activeTab === "documents" && (
        <Card className="shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-4"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Document Type</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fee (₱)</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Requests</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</p></div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {documentTypes.map((doc) => (
              <div key={doc.name} className="px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center">
                      <FileText className="w-4 h-4 text-[#0C2340]" />
                    </div>
                    <span className="text-sm font-medium text-[#0C2340]">{doc.name}</span>
                  </div>
                  <div className="col-span-2">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${doc.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${doc.enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {doc.enabled ? "Enabled" : "Disabled"}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="relative flex items-center">
                      <span className="absolute left-2 text-slate-500 text-xs font-semibold">₱</span>
                      <Input
                        type="number"
                        min="0"
                        defaultValue={doc.fee}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val)) {
                            const newFees = { ...(formData as any).documentFees, [doc.name]: val }
                            setFormData({ ...formData, documentFees: newFees } as any)
                          }
                        }}
                        className="h-8 w-20 pl-6 text-xs text-slate-900 border-slate-200"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-slate-700">{doc.requests.toLocaleString()}</span>
                    {doc.requests > 0 && (
                      <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden w-full max-w-[80px]">
                        <div className="h-full bg-[#0C2340] rounded-full" style={{ width: `${(doc.requests / maxRequests) * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <button className={`text-sm font-medium ${doc.enabled ? "text-red-500 hover:text-red-600" : "text-emerald-600 hover:text-emerald-700"}`}>
                      {doc.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              {h.activeDocTypes} of {h.totalDocTypes} document types enabled
            </p>
            <Button variant="outline" className="text-xs bg-transparent">+ Add Document Type</Button>
          </div>
        </Card>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-[#0C2340] mb-3">Save Changes?</h3>
            <p className="text-sm text-slate-600 mb-6">All pending changes to branding, templates, and document types will be saved. These changes will take effect immediately.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowSaveDialog(false)} disabled={isSavingChanges}>Cancel</Button>
              <Button onClick={handleSaveAllChanges} className="bg-[#0C2340] hover:bg-[#0a1c33]" disabled={isSavingChanges}>
                {isSavingChanges ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
