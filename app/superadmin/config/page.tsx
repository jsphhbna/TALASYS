"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ModalOverlay } from "@/components/ui/modal-overlay"
import { db, auth } from "@/lib/firebase"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
const systemHealthMetrics: any = { uptime: 100, storageUsed: 12, storageTotal: 100, responseTime: 45, activeModules: 4, totalModules: 4, activeDocTypes: 5, totalDocTypes: 6 };
import { useSuperAdminData } from "@/hooks/superadmin"
import { useAdminData } from "@/hooks/admin"
import {
  Server, HardDrive, Clock, Activity, Shield, FileText,
  Palette, LayoutTemplate, Files, Settings, CheckCircle, Pencil, Trash2, Plus, X, UploadCloud, Loader2,
  Database, Download, AlertTriangle, History
} from "lucide-react"
import { toast } from "sonner"
import { uploadFileToCloudinary } from "@/lib/resident/cloudinary"
import { BackupHistoryList } from "@/components/superadmin/layout/backup-history-list"

const changeTypeIcons: Record<string, typeof Palette> = {
  branding: Palette,
  module: Settings,
  template: LayoutTemplate,
  document: FileText,
}

export default function SystemConfig() {
  const { systemConfig, updateConfig, auditLogs } = useSuperAdminData()
  const { documentRequests } = useAdminData()
  const [activeTab, setActiveTab] = useState<"branding" | "templates" | "documents" | "backups">("branding")
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [isSavingChanges, setIsSavingChanges] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState("funeral")
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [lastDownload, setLastDownload] = useState(0)

  // Add Document Type modal state
  const [showAddDocModal, setShowAddDocModal] = useState(false)
  const [newDocName, setNewDocName] = useState("")
  const [newDocIcon, setNewDocIcon] = useState("📄")
  const [newDocFee, setNewDocFee] = useState("0")
  const [newDocHeader, setNewDocHeader] = useState("C E R T I F I C A T I O N")
  const [newDocTemplate, setNewDocTemplate] = useState(
    "This is to certify that {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for {{purpose}} purposes.\n\nCity of Manila, {{date_issued}}."
  )
  const [isAddingDoc, setIsAddingDoc] = useState(false)

  const configChangeLog = auditLogs.filter(l => l.actionType === "Config Edit" || l.actionType === "Settings Updated" || l.action === "Config Edit" || l.action === "Settings Updated").slice(0, 5).map(l => ({
    admin: l.admin?.name || (l as any).adminName || "System",
    action: l.actionType || l.action || "Unknown",
    detail: l.details || (l as any).residentName || "",
    timestamp: l.date,
    type: (l.details || "").toLowerCase().includes("template") ? "template" : 
          (l.details || "").toLowerCase().includes("branding") ? "branding" :
          (l.details || "").toLowerCase().includes("document") ? "document" : "module"
  }))

  // Local state for branding edits
  const [formData, setFormData] = useState({
    barangayName: systemConfig.barangayName || "",
    address: systemConfig.address || "",
    contactNumber: systemConfig.contactNumber || "",
    emailAddress: systemConfig.emailAddress || "",
    barangayCaptainName: systemConfig.barangayCaptainName || "",
    secretaryName: systemConfig.secretaryName || "",
    captainSignatureUrl: systemConfig.captainSignatureUrl || "",
    secretarySignatureUrl: systemConfig.secretarySignatureUrl || "",
    templates: systemConfig.templates || {
      funeral: `This is to certify that {{name}}, age {{age}}, is a bonafide resident of {{barangay_name}}, with postal address located at {{address}}.

This Certification is issued upon the request of the above-named person for FUNERAL ASSISTANCE purposes.

City of Manila, {{date_issued}}.`,
      pwd_adult: `This is to certify that {{name}} is a bonified resident and registered voter of {{barangay_name}}, with postal address located at {{address}}.

This Certification is issued upon the request of the above-named person for <strong>PWD-Application</strong> purposes.

Issued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.`,
      pwd_minor: `This is to certify that {{name}} {{age}} years old of age, is a bonified resident of {{barangay_name}}, with postal address located at {{address}}.

This Certification is issued upon the request of the above-named person for <strong>PWD-Application</strong> purposes.

Issued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.`,
      indigency: `This is to certify that {{name}} is a bonafide resident of {{barangay_name}} with postal address {{address}}.

This further certifies that the said person belongs to indigent families in our Barangay.

This Certification is issued upon the request of the above-named person for {{purpose}} purposes.

Issued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.`,
      residency: `This is to certify {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.

This Certification is issued upon the request of the above-mentioned name for {{purpose}} purposes.

Issued this {{date_day_issued}}, City of Manila.`,
      business: `This is to certify that {{name}} located at {{address}} with Business Style _________________ conducted "__________________" at _________________ today {{date_issued}}.

This Certification is issued upon the request of the above-cited for whatever legal purpose this is intended.

Donation for venue Php 500.00

City Manila, {{date_issued}}.`,
      business_homeowner: `This is to certify that {{name}} is hereby issued Barangay Clearance for "__________________" entity located at {{address}}. This is under the territorial jurisdiction of {{barangay_name}}.

This certification is issued upon the request of the above-cited person for whatever purposes it may serve.

Issued this {{date_ordinal_issued}}, City of Manila.`,
      business_contractor: `This is to certify that {{name}} is hereby issued Barangay Clearance for "__________________" entity located along {{address}} Under the territorial jurisdiction of {{barangay_name}}.

This certification is issued upon the request of the above-cited name for whatever legal purpose this is intended.

City of Manila, {{date_issued}}.`,
      osca: `This is to certify that {{name}} is bonafide resident of {{barangay_name}}, with postal address at {{address}}.

This Certification is issued upon the request of the above cited person for <strong>OSCA ID application</strong> purposes.

City of Manila, {{date_issued}}.`
    }
  })

  // Sync formData when systemConfig loads
  useEffect(() => {
    if (systemConfig.barangayName !== undefined) {
      setFormData({
        barangayName: systemConfig.barangayName || "",
        address: systemConfig.address || "",
        contactNumber: systemConfig.contactNumber || "",
        emailAddress: systemConfig.emailAddress || "",
        barangayCaptainName: systemConfig.barangayCaptainName || "",
        secretaryName: systemConfig.secretaryName || "",
        captainSignatureUrl: systemConfig.captainSignatureUrl || "",
        secretarySignatureUrl: systemConfig.secretarySignatureUrl || "",
        templates: {
          funeral: `This is to certify that {{name}}, age {{age}}, is a bonafide resident of {{barangay_name}}, with postal address located at {{address}}.

This Certification is issued upon the request of the above-named person for FUNERAL ASSISTANCE purposes.

City of Manila, {{date_issued}}.`,
          pwd_adult: `This is to certify that {{name}} is a bonified resident and registered voter of {{barangay_name}}, with postal address located at {{address}}.

This Certification is issued upon the request of the above-named person for <strong>PWD-Application</strong> purposes.

Issued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.`,
          pwd_minor: `This is to certify that {{name}} {{age}} years old of age, is a bonified resident of {{barangay_name}}, with postal address located at {{address}}.

This Certification is issued upon the request of the above-named person for <strong>PWD-Application</strong> purposes.

Issued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.`,
          indigency: `This is to certify that {{name}} is a bonafide resident of {{barangay_name}} with postal address {{address}}.

This further certifies that the said person belongs to indigent families in our Barangay.

This Certification is issued upon the request of the above-named person for {{purpose}} purposes.

Issued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.`,
          residency: `This is to certify {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.

This Certification is issued upon the request of the above-mentioned name for {{purpose}} purposes.

Issued this {{date_day_issued}}, City of Manila.`,
          business: `This is to certify that {{name}} located at {{address}} with Business Style _________________ conducted "__________________" at _________________ today {{date_issued}}.

This Certification is issued upon the request of the above-cited for whatever legal purpose this is intended.

Donation for venue Php 500.00

City Manila, {{date_issued}}.`,
          business_homeowner: `This is to certify that {{name}} is hereby issued Barangay Clearance for "__________________" entity located at {{address}}. This is under the territorial jurisdiction of {{barangay_name}}.

This certification is issued upon the request of the above-cited person for whatever purposes it may serve.

Issued this {{date_ordinal_issued}}, City of Manila.`,
          business_contractor: `This is to certify that {{name}} is hereby issued Barangay Clearance for "__________________" entity located along {{address}} Under the territorial jurisdiction of {{barangay_name}}.

This certification is issued upon the request of the above-cited name for whatever legal purpose this is intended.

City of Manila, {{date_issued}}.`,
          osca: `This is to certify that {{name}} is bonafide resident of {{barangay_name}}, with postal address at {{address}}.

This Certification is issued upon the request of the above cited person for <strong>OSCA ID application</strong> purposes.

City of Manila, {{date_issued}}.`,
          // merge any saved Firebase templates on top of defaults
          ...(systemConfig.templates || {})
        }
      })
    }
  }, [systemConfig.barangayName, systemConfig.address, systemConfig.contactNumber, systemConfig.emailAddress, systemConfig.barangayCaptainName, systemConfig.templates])

  const tabs = [
    { id: "branding" as const, label: "Branding", icon: Palette },
    { id: "templates" as const, label: "Templates", icon: LayoutTemplate },
    { id: "documents" as const, label: "Document Types", icon: Files },
    { id: "backups" as const, label: "Database Backups", icon: Database },
  ]

  const templates = [
    { id: "funeral", name: "Funeral Certification", lastEdited: "1 day ago" },
    { id: "pwd_adult", name: "PWD Certification (Adult)", lastEdited: "1 day ago" },
    { id: "pwd_minor", name: "PWD Certification (Minor)", lastEdited: "1 day ago" },
    { id: "indigency", name: "Certificate of Indigency", lastEdited: "1 day ago" },
    { id: "residency", name: "Proof of Residency", lastEdited: "1 day ago" },
    { id: "business", name: "Business Clearance", lastEdited: "1 day ago" },
    { id: "business_homeowner", name: "Business Clearance (Homeowner)", lastEdited: "1 day ago" },
    { id: "business_contractor", name: "Business Clearance (Contractor)", lastEdited: "1 day ago" },
    { id: "osca", name: "OSCA Certification", lastEdited: "1 day ago" },
    ...(systemConfig.customDocumentTypes || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      lastEdited: "Custom"
    }))
  ]

  const documentTypesList = [
    { name: "Funeral Certification", requests: documentRequests.filter(r => r.documentType === "Funeral Certification").length },
    { name: "PWD Certification (Adult)", requests: documentRequests.filter(r => r.documentType === "PWD Certification (Adult)").length },
    { name: "PWD Certification (Minor)", requests: documentRequests.filter(r => r.documentType === "PWD Certification (Minor)").length },
    { name: "Certificate of Indigency", requests: documentRequests.filter(r => r.documentType === "Certificate of Indigency").length },
    { name: "Proof of Residency", requests: documentRequests.filter(r => r.documentType === "Proof of Residency").length },
    { name: "Business Clearance", requests: documentRequests.filter(r => r.documentType === "Business Clearance").length },
    { name: "Business Clearance (Homeowner)", requests: documentRequests.filter(r => r.documentType === "Business Clearance (Homeowner)").length },
    { name: "Business Clearance (Contractor)", requests: documentRequests.filter(r => r.documentType === "Business Clearance (Contractor)").length },
    { name: "OSCA Certification", requests: documentRequests.filter(r => r.documentType === "OSCA Certification").length },
    ...(systemConfig.customDocumentTypes || []).map((c: any) => ({
      name: c.name,
      requests: documentRequests.filter(r => r.documentType === c.name).length
    }))
  ]

  const currentDocumentTypes = systemConfig.documentTypes !== undefined ? systemConfig.documentTypes : ["Funeral Certification", "PWD Certification (Adult)", "PWD Certification (Minor)", "Certificate of Indigency", "Proof of Residency", "Business Clearance", "Business Clearance (Homeowner)", "Business Clearance (Contractor)", "OSCA Certification"];
  const currentDocumentFees = systemConfig.documentFees || {};

  const documentTypes = documentTypesList.map(d => ({
    ...d,
    enabled: currentDocumentTypes.includes(d.name),
    fee: currentDocumentFees[d.name] ?? (d.name === "Proof of Residency" ? 50 : d.name.includes("Business") ? 150 : 0)
  }))


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

  const handleAddDocType = async () => {
    if (!newDocName.trim()) return
    setIsAddingDoc(true)
    const docId = newDocName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")
    const newDocTypes = [...currentDocumentTypes, newDocName.trim()]
    const newFees = { ...currentDocumentFees, [newDocName.trim()]: parseFloat(newDocFee) || 0 }
    const newCustomDocTypes = [
      ...(systemConfig.customDocumentTypes || []),
      { id: docId, name: newDocName.trim(), icon: newDocIcon, fee: parseFloat(newDocFee) || 0, header: newDocHeader }
    ]
    const newTemplates = { ...(systemConfig.templates || {}), [docId]: newDocTemplate }
    await updateConfig({ documentTypes: newDocTypes, documentFees: newFees, customDocumentTypes: newCustomDocTypes, templates: newTemplates })
    setFormData(prev => ({ ...prev, templates: { ...prev.templates, [docId]: newDocTemplate } }))
    setShowAddDocModal(false)
    setNewDocName("")
    setNewDocIcon("📄")
    setNewDocFee("0")
    setNewDocHeader("C E R T I F I C A T I O N")
    setNewDocTemplate("This is to certify that {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for {{purpose}} purposes.\n\nCity of Manila, {{date_issued}}.")
    setIsAddingDoc(false)
  }

  const handleDeleteDocType = async (docName: string, docId: string) => {
    const newDocTypes = currentDocumentTypes.filter(t => t !== docName)
    const newFees = { ...currentDocumentFees }
    delete newFees[docName]
    const newCustomDocTypes = (systemConfig.customDocumentTypes || []).filter((d: any) => d.name !== docName)
    const newTemplates = { ...(systemConfig.templates || {}) }
    delete newTemplates[docId]
    await updateConfig({ documentTypes: newDocTypes, documentFees: newFees, customDocumentTypes: newCustomDocTypes, templates: newTemplates })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">System Configuration</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage system branding, templates, and document settings</p>
        </div>
        <Button onClick={() => setShowSaveDialog(true)} className="bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]">Save All Changes</Button>
      </div>



      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.id
                ? "border-[#0C2340] text-[#0C2340] dark:text-blue-50"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300"
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
        <Card className="p-6 shadow-sm">
          <div className="grid md:grid-cols-2 gap-10">
            <div>
              <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">Barangay Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Barangay Name</label>
                  <Input value={formData.barangayName} onChange={e => setFormData({ ...formData, barangayName: e.target.value })} placeholder="Barangay Sample" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Municipality / City</label>
                  <Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="City of Sample" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Contact Number</label>
                    <Input value={formData.contactNumber} onChange={e => setFormData({ ...formData, contactNumber: e.target.value })} placeholder="(02) 8123-4567" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
                    <Input value={formData.emailAddress} onChange={e => setFormData({ ...formData, emailAddress: e.target.value })} placeholder="barangay@sample.gov.ph" />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">E-Signatures</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Barangay Captain</label>
                  <div className="flex gap-2 mb-2">
                    <Input value={formData.barangayCaptainName} onChange={e => setFormData({ ...formData, barangayCaptainName: e.target.value })} placeholder="Hon. Juan Dela Cruz" className="flex-1" />
                    <Button variant="outline" className="text-xs bg-transparent relative overflow-hidden" onClick={() => document.getElementById("captain-sig-upload")?.click()}>
                      <UploadCloud className="w-4 h-4 mr-1.5" />
                      Upload Sig
                      <input 
                        id="captain-sig-upload" 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          toast.loading("Uploading captain's signature...");
                          try {
                            const url = await uploadFileToCloudinary(file);
                            setFormData(prev => ({ ...prev, captainSignatureUrl: url }));
                            toast.dismiss();
                            toast.success("Captain's signature uploaded successfully");
                          } catch (err) {
                            toast.dismiss();
                            toast.error("Failed to upload signature");
                          }
                        }} 
                      />
                    </Button>
                  </div>
                  {formData.captainSignatureUrl && (
                    <div className="w-full h-20 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-center p-2 relative group">
                      <img src={formData.captainSignatureUrl} alt="Captain Signature" className="max-h-full max-w-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                      <button onClick={() => setFormData(prev => ({ ...prev, captainSignatureUrl: "" }))} className="absolute top-1 right-1 p-1 bg-red-100 text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Secretary</label>
                  <div className="flex gap-2 mb-2">
                    <Input value={formData.secretaryName} onChange={e => setFormData({ ...formData, secretaryName: e.target.value })} placeholder="Maria Santos" className="flex-1" />
                    <Button variant="outline" className="text-xs bg-transparent relative overflow-hidden" onClick={() => document.getElementById("secretary-sig-upload")?.click()}>
                      <UploadCloud className="w-4 h-4 mr-1.5" />
                      Upload Sig
                      <input 
                        id="secretary-sig-upload" 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          toast.loading("Uploading secretary's signature...");
                          try {
                            const url = await uploadFileToCloudinary(file);
                            setFormData(prev => ({ ...prev, secretarySignatureUrl: url }));
                            toast.dismiss();
                            toast.success("Secretary's signature uploaded successfully");
                          } catch (err) {
                            toast.dismiss();
                            toast.error("Failed to upload signature");
                          }
                        }} 
                      />
                    </Button>
                  </div>
                  {formData.secretarySignatureUrl && (
                    <div className="w-full h-20 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-center p-2 relative group">
                      <img src={formData.secretarySignatureUrl} alt="Secretary Signature" className="max-h-full max-w-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                      <button onClick={() => setFormData(prev => ({ ...prev, secretarySignatureUrl: "" }))} className="absolute top-1 right-1 p-1 bg-red-100 text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
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
                  ? "border-[#0C2340] bg-[#0C2340] dark:bg-slate-800/[0.03] ring-1 ring-[#0C2340]/20"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-[12px] font-semibold ${selectedTemplate === t.id ? "text-white dark:text-blue-50" : "text-[#0C2340] dark:text-blue-50"}`}>{t.name}</p>
                    <p className={`text-[10px] ${selectedTemplate === t.id ? "text-blue-100 dark:text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>Edited {t.lastEdited}</p>
                  </div>
                  {selectedTemplate === t.id && <CheckCircle className={`w-4 h-4 ${selectedTemplate === t.id ? "text-white dark:text-blue-50" : "text-[#0C2340] dark:text-blue-50"}`} />}
                </div>
              </button>
            ))}
          </div>
          <Card className="col-span-8 shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-950 px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">Template Editor — {templates.find((t) => t.id === selectedTemplate)?.name}</h3>
              <Button variant="outline" className="text-xs bg-transparent h-8" onClick={() => setEditingTemplate(!editingTemplate)}>
                <Pencil className="w-3 h-3 mr-1.5" /> {editingTemplate ? "Preview" : "Edit"}
              </Button>
            </div>
            <div className="p-5">
              {editingTemplate ? (
                <textarea
                  className="w-full h-64 p-4 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[#0C2340]/20"
                  value={(formData.templates as Record<string, string>)[selectedTemplate] || ""}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    templates: { ...prev.templates, [selectedTemplate]: e.target.value }
                  }))}
                />
              ) : (
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-6 h-64 overflow-auto font-mono text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {((formData.templates as Record<string, string>)[selectedTemplate] || "").split(/({{.*?}})/).map((part, i) => {
                    if (part.startsWith("{{") && part.endsWith("}}")) {
                      return <span key={i} className="text-[#C5A55A] bg-[#C5A55A]/10 px-1 rounded font-medium">{part}</span>
                    }
                    return <span key={i}>{part}</span>
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Document Types Tab */}
      {activeTab === "documents" && (
        <Card className="shadow-sm overflow-hidden">
          <div className="bg-slate-50 dark:bg-slate-950 px-6 py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-4"><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Document Type</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fee (₱)</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Requests</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</p></div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {documentTypes.map((doc) => {
              const customEntry = (systemConfig.customDocumentTypes || []).find((c: any) => c.name === doc.name)
              const docId = customEntry?.id || doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")
              const isBuiltIn = ["Funeral Certification","PWD Certification (Adult)","PWD Certification (Minor)","Certificate of Indigency","Proof of Residency","Business Clearance","Business Clearance (Homeowner)","Business Clearance (Contractor)","OSCA Certification"].includes(doc.name)
              return (
              <div key={doc.name} className="px-6 py-3.5 hover:bg-slate-50/50 dark:bg-slate-900/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center">
                      <span className="text-sm">{customEntry?.icon || "📄"}</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[#0C2340] dark:text-blue-50">{doc.name}</span>
                      {!isBuiltIn && <span className="ml-2 text-[9px] bg-[#C5A55A]/20 text-[#C5A55A] font-semibold px-1.5 py-0.5 rounded">Custom</span>}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${doc.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${doc.enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {doc.enabled ? "Enabled" : "Disabled"}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="relative flex items-center">
                      <span className="absolute left-2 text-slate-500 dark:text-slate-400 text-xs font-semibold">₱</span>
                      <Input
                        type="number"
                        min="0"
                        defaultValue={doc.fee}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val)) {
                            const newFees = { ...currentDocumentFees, [doc.name]: val }
                            updateConfig({ documentFees: newFees })
                          }
                        }}
                        className="h-8 w-20 pl-6 text-xs text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{doc.requests.toLocaleString()}</span>
                    {doc.requests > 0 && (
                      <div className="mt-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden w-full max-w-[80px]">
                        <div className="h-full bg-[#0C2340] dark:bg-slate-800 rounded-full" style={{ width: `${(doc.requests / maxRequests) * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center gap-3">
                    <button 
                      onClick={() => {
                        const isCurrentlyEnabled = currentDocumentTypes.includes(doc.name);
                        const newTypes = isCurrentlyEnabled 
                          ? currentDocumentTypes.filter(t => t !== doc.name)
                          : [...currentDocumentTypes, doc.name];
                        updateConfig({ documentTypes: newTypes });
                      }}
                      className={`text-sm font-medium ${doc.enabled ? "text-amber-500 hover:text-amber-600" : "text-emerald-600 hover:text-emerald-700"}`}
                    >
                      {doc.enabled ? "Disable" : "Enable"}
                    </button>
                    {!isBuiltIn && (
                      <button
                        onClick={() => handleDeleteDocType(doc.name, docId)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="Delete this document type"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )})}
          </div>
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {documentTypes.filter(d => d.enabled).length} of {documentTypes.length} document types enabled
            </p>
            <Button onClick={() => setShowAddDocModal(true)} className="bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33] text-xs gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Document Type
            </Button>
          </div>
        </Card>
      )}

      {/* Database Backups Tab */}
      {activeTab === "backups" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold text-[#0C2340] dark:text-blue-50">On-Demand Database Backups</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Generate a full export of your entire database on-the-fly. No storage costs required.
            </p>
          </div>

          <Card>
            <div className="bg-slate-50 dark:bg-slate-950 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Full Database Export</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Exports users, residents, requests, logs, and more.</p>
                </div>
              </div>
            </div>
            
            <div className="p-8">
              <div className="flex flex-col sm:flex-row items-center gap-4 max-w-lg">
                <button 
                  onClick={async (e) => {
                    e.preventDefault();
                    const now = Date.now();
                    if (now - lastDownload < 5000) {
                      toast.error("You are clicking too fast! Please try again in 5 seconds.");
                      return;
                    }
                    setLastDownload(now);
                    
                    try {
                      const token = await auth.currentUser?.getIdToken();
                      if (!token) throw new Error("Not authenticated");
                      window.open(`/api/backup/download?type=json&token=${token}`, '_blank');
                    } catch (error) {
                      toast.error("Failed to authenticate download request.");
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-lg text-sm font-semibold border-2 border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900 py-3 px-4 transition-all text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Download className="w-4 h-4" />
                  Download as JSON
                </button>
                
                <button 
                  onClick={async (e) => {
                    e.preventDefault();
                    const now = Date.now();
                    if (now - lastDownload < 5000) {
                      toast.error("You are clicking too fast! Please try again in 5 seconds.");
                      return;
                    }
                    setLastDownload(now);
                    
                    try {
                      const token = await auth.currentUser?.getIdToken();
                      if (!token) throw new Error("Not authenticated");
                      window.open(`/api/backup/download?type=excel&token=${token}`, '_blank');
                    } catch (error) {
                      toast.error("Failed to authenticate download request.");
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-lg text-sm font-semibold border-2 border-[#0C2340] bg-[#0C2340] text-white hover:bg-[#1a3a5c] py-3 px-4 transition-all dark:bg-blue-600 dark:border-blue-600 dark:hover:bg-blue-700 shadow-md hover:shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  Download as Excel
                </button>
              </div>
              
              <div className="mt-6 flex items-start gap-3 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
                <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                  <strong>Zero-Storage Backup:</strong> Clicking these buttons will read your live Firestore database and stream the files directly to your browser. Your backups are generated instantly and securely without taking up any permanent cloud storage space.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="bg-slate-50 dark:bg-slate-950 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Recent Backup History</h3>
            </div>
            <div className="p-0">
              <BackupHistoryList />
            </div>
          </Card>
        </div>
      )}

      {/* Add Document Type Modal */}
      <ModalOverlay isOpen={showAddDocModal} onClose={() => setShowAddDocModal(false)}>
        <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Add New Document Type</h3>
            <button onClick={() => setShowAddDocModal(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Document Name *</label>
              <Input value={newDocName} onChange={e => setNewDocName(e.target.value)} placeholder="e.g. Good Moral Certificate" />
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Icon</label>
                <Input value={newDocIcon} onChange={e => setNewDocIcon(e.target.value)} placeholder="📄" className="w-16 text-center text-lg" />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Fee (₱)</label>
                <Input type="number" min="0" value={newDocFee} onChange={e => setNewDocFee(e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">PDF Header Title</label>
            <Input value={newDocHeader} onChange={e => setNewDocHeader(e.target.value)} placeholder="C E R T I F I C A T I O N" />
            <p className="text-[10px] text-slate-400 mt-1">This is the bold heading that appears at the top of the PDF. E.g. "C E R T I F I C A T I O N" or "BARANGAY CLEARANCE"</p>
          </div>

          <div className="mb-2">
            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Template Body</label>
            <textarea
              className="w-full h-48 p-4 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[#0C2340]/20"
              value={newDocTemplate}
              onChange={e => setNewDocTemplate(e.target.value)}
              placeholder="Write the certificate body text here..."
            />
          </div>
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-[11px] font-semibold text-amber-700 mb-1">Available Placeholders</p>
            <div className="flex flex-wrap gap-1.5">
              {["{{name}}","{{age}}","{{address}}","{{barangay_name}}","{{purpose}}","{{date_issued}}","{{date_ordinal_issued}}","{{captain_name}}"].map(ph => (
                <button key={ph} onClick={() => setNewDocTemplate(prev => prev + ph)}
                  className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono hover:bg-amber-200 transition-colors">
                  {ph}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-amber-600 mt-2">Use <code className="bg-amber-100 px-1 rounded">&lt;strong&gt;text&lt;/strong&gt;</code> to bold specific words in the output.</p>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAddDocModal(false)} disabled={isAddingDoc}>Cancel</Button>
            <Button onClick={handleAddDocType} className="min-w-[160px] bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]" disabled={isAddingDoc || !newDocName.trim()}>
              {isAddingDoc ? "Adding..." : "Add Document Type"}
            </Button>
          </div>
        </div>
      </ModalOverlay>

      {/* Save Dialog */}
      <ModalOverlay isOpen={showSaveDialog} onClose={() => setShowSaveDialog(false)}>
        <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50 mb-3">Save Changes?</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">All pending changes to branding, templates, and document types will be saved. These changes will take effect immediately.</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowSaveDialog(false)} disabled={isSavingChanges}>Cancel</Button>
            <Button onClick={handleSaveAllChanges} className="min-w-[140px] bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]" disabled={isSavingChanges}>
              {isSavingChanges ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </ModalOverlay>
    </div>
  )
}
