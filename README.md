# TALASYS - Barangay 634 Management System

TALASYS is a modern, secure, and comprehensive Barangay Management System built to streamline operations for Barangay 634. It features a robust Role-Based Access Control (RBAC) architecture, separating concerns between Residents, Administrators, and Super Administrators. 

## 🚀 Key Features

### 👤 Resident Portal
- **Account Creation & Verification:** Residents can securely register and upload their 1x1 IDs and proof of residency.
- **Document Requests:** Request barangay certificates, clearances, and permits directly from the dashboard.
- **Real-Time Tracking:** Track the status of requests (Pending, Processing, Ready for Pickup) in real-time.
- **History & Notifications:** View past requests and receive instant notifications upon approval or rejection.

### 🛡️ Admin Portal (Barangay Officials & Clerks)
- **Request Processing:** Review, approve, or reject document requests efficiently.
- **Resident Verification:** Verify resident identities to grant them full access to request services.
- **Data Privacy Enforcement:** Built-in Data Privacy Act of 2012 compliance checks and security disclaimers for handling PII (Personally Identifiable Information).
- **Customizable Access:** Admins can have granular roles (e.g., *Verification Only*, *Documents Only*, *Full Access*).

### 👑 Super Admin Portal
- **System Configuration:** Manage system variables, create new Admin accounts, and oversee the entire barangay operation.
- **Audit Logs:** Track all actions performed by Admins for full transparency and accountability.
- **Automated Backups:** Manually trigger or download system backups of the Firestore database to prevent data loss.
- **Analytics & Reporting:** Generate statistical reports on resident demographics, document requests, and system usage.

## 💻 Tech Stack

- **Framework:** [Next.js 14/15](https://nextjs.org/) (App Router, Turbopack)
- **UI & Styling:** [Tailwind CSS](https://tailwindcss.com/) & [shadcn/ui](https://ui.shadcn.com/) (Radix UI Primitives)
- **Database & Authentication:** [Firebase](https://firebase.google.com/) (Firestore, Firebase Auth)
- **Media Storage:** [Cloudinary](https://cloudinary.com/) (Secure signed uploads with client-side WebP canvas compression)
- **Icons:** [Lucide React](https://lucide.dev/)

## 🔒 Security Highlights
- **Strict Firestore Rules:** Complex `firestore.rules` ensure users can only read/write their own data, preventing privilege escalation.
- **Client-Side Compression:** Images are compressed and converted to WebP on the client side before uploading, preventing massive file uploads (Zip bombs) and reducing bandwidth.
- **Signed Cloudinary Uploads:** API routes (`/api/cloudinary/sign`) prevent unauthorized direct uploads to the storage bucket.
- **Session Timeout:** Inactive sessions are automatically logged out after 3 days (or 30 days if "Trust this device" is checked).
- **Unguessable URLs:** Sensitive documents are stored with cryptographically secure URLs.

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or pnpm
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
4. Configure your `.env.local` file with the following variables:
   ```env
   # Firebase Config
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

   # Cloudinary Config
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
   NEXT_PUBLIC_CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

### Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📜 License
This project is proprietary software developed for Barangay 634. Unauthorized duplication, distribution, or public sharing of the source code is strictly prohibited.
