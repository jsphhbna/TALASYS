# TALASYS - Advanced Barangay Management System

<div align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase" />
</div>

<br />

**TALASYS** is a production-ready, highly secure, and modern Barangay Management System built to digitize and streamline local government operations for Barangay 634. Designed with a mobile-first philosophy and rigorous security standards, it handles everything from resident document requests to strictly audited administrative oversight.

---

## ✨ What Makes TALASYS Stand Out?

Unlike traditional legacy LGU (Local Government Unit) systems, TALASYS is built on a modern, real-time architecture emphasizing **Speed, Security, and User Experience**:

1. **True Real-Time Reactivity:** Powered by Firebase `onSnapshot`, admins and residents see status updates, new requests, and document approvals instantly—no page reloads required.
2. **Zero-Trust Security Architecture:** Every database read/write is guarded by strict Firestore Security Rules. Admins cannot elevate their own privileges, and residents are cryptographically isolated from each other's data.
3. **Data Privacy Act (DPA) of 2012 Compliant:** The system actively guards Personally Identifiable Information (PII). Admins are forced to acknowledge legal disclaimers before accessing sensitive resident data, and the system logs administrative actions.
4. **Intelligent Media Handling:** To prevent bandwidth abuse and storage exhaustion (Zip bombs), all uploaded valid IDs and proofs of residency are strictly compressed and converted to WebP on the client's browser *before* hitting the secure Cloudinary bucket.
5. **Premium UI/UX:** Built with Radix UI (shadcn) and Tailwind CSS, the system features a fluid, responsive, accessible, and beautiful interface complete with a Dark Mode toggle and micro-animations.

---

## 👥 Comprehensive Feature Breakdown

### 👑 Super Admin (System Overseer)
*The master controller of the system with full unhindered access and recovery capabilities.*
- **System Bootstrapping:** Fallback un-lockable local login ensures the Superadmin can never be completely locked out.
- **Admin Management:** Create, suspend, lock, or delete Admin accounts.
- **Role Assignment:** Granularly assign roles to admins (e.g., *Verification Only*, *Documents Only*, *Full Access*).
- **Audit Logging:** View a tamper-proof log of every action taken by any Admin in the system.
- **Disaster Recovery (Backups):** Trigger manual Firestore database backups, download encrypted JSON snapshots, and securely archive barangay data.
- **Global Settings:** Control system-wide variables and configurations.

### 🛡️ Admin (Barangay Officials & Clerks)
*The daily operators who process requests and manage the resident lifecycle.*
- **DPA-Compliant Workspace:** Mandatory acknowledgment of Data Privacy constraints before accessing resident PII.
- **Resident Verification Pipeline:** Review uploaded IDs and proofs of residency. Approve or reject accounts with built-in feedback messaging.
- **Document Processing:** Handle requests for Barangay Certificates, Clearances, and Indigency documents.
- **Status Workflows:** Move requests through states: *Pending* ➔ *Processing* ➔ *Ready for Pickup* ➔ *Completed*.
- **Dashboard Analytics:** Quick insights into pending verifications, total requests, and daily operations.

### 👤 Resident (The Citizens)
*A mobile-first portal for citizens to interact with the barangay office from home.*
- **Secure Registration:** Email verification and OTP integration for account creation.
- **Profile Management:** Upload and manage 1x1 photos and valid IDs (automatically compressed for fast uploading).
- **Document Requests:** Request necessary documents with a few clicks without visiting the barangay hall.
- **Real-Time Tracking:** Watch the status of their documents update live.
- **Notification Center:** Receive instant alerts when an account is verified, a document is ready, or if an ID was rejected for being blurry.

---

## 🔒 Enterprise-Grade Security Features

Security is the backbone of TALASYS. Designed to be a portfolio centerpiece for secure web development:

- **Client-Side Image Compression:** Prevents malicious payload sizes. Uploads are drawn to a hidden HTML5 canvas, downscaled, and converted to lightweight WebP formats.
- **Signed Cloudinary Uploads:** Uses Next.js secure API routes to generate cryptographic signatures. Residents can only upload files; they cannot view or list the storage bucket.
- **Firestore Security Rules:** Complete RBAC (Role-Based Access Control) enforced at the database level.
- **Smart Session Timeouts:** Inactive sessions are automatically destroyed. Untrusted devices are logged out after 3 days; trusted devices after 30 days.
- **Tab-Session Defense:** Highly sensitive legal modals use `sessionStorage` to ensure that even if an admin logs out and logs back in on the same browser tab, their clearance is correctly reset.
- **XSS & CSRF Protection:** Built natively into the Next.js App Router and React's DOM-escaping architecture.

---

## ⚖️ Privacy Policy & Terms of Use

TALASYS is heavily modeled around the **Philippine Data Privacy Act of 2012 (Republic Act No. 10173)**. 
- **Data Collection:** The system only collects strictly necessary data (Names, Addresses, Contact info, Government IDs) required for legal barangay document processing.
- **Consent:** Residents explicitly agree to data collection upon registration.
- **Admin Liability:** Administrators are presented with a non-bypassable legal disclaimer acknowledging that unauthorized sharing, downloading, or leaking of resident PII is punishable by law.
- **Right to be Forgotten:** Residents have workflows to request account deletion and data scrubbing.

---

## 💻 Tech Stack

- **Core:** [Next.js 14/15](https://nextjs.org/) (App Router, Server Components, Turbopack)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/) (Radix UI Primitives)
- **Database / Auth:** [Firebase](https://firebase.google.com/) (Auth, Firestore)
- **Media CDN:** [Cloudinary](https://cloudinary.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Date Formatting:** `date-fns`

---

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Firebase Project configured
- Cloudinary Account configured

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/jsphhbna/TALASYS.git
   ```
2. Navigate into the project directory:
   ```bash
   cd TALASYS
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Configure your `.env.local` file:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
   NEXT_PUBLIC_CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

### Running the Development Server
```bash
npm run dev
```

---
*Built with passion and a focus on community empowerment and digital security.*
