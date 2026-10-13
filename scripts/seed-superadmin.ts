/**
 * Operator CLI Script: Provision Initial Super Admin Account (#54)
 *
 * Removes dependency on hardcoded client-side credentials by providing an authoritative
 * operator provisioning workflow via Firebase Admin.
 *
 * Usage:
 *   node --experimental-strip-types scripts/seed-superadmin.ts --email <admin-email> --password <password> [--name <name>]
 *
 * Options:
 *   --email       Email address for the Super Admin (required)
 *   --password    Strong password, minimum 8 characters (required)
 *   --name        Display name (optional, defaults to "Super Admin")
 *   --help        Show this help message
 *
 * Prerequisites:
 *   Ensure Firebase Admin environment variables are set (or a service account key is available):
 *   - FIREBASE_PROJECT_ID
 *   - FIREBASE_CLIENT_EMAIL
 *   - FIREBASE_PRIVATE_KEY
 *   (or GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account.json file)
 */

import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

function printHelp() {
  console.log(`
TALASYS - Super Admin Account Provisioning Tool

Usage:
  node --experimental-strip-types scripts/seed-superadmin.ts --email <email> --password <password> [--name <name>]

Options:
  --email       Email for the Super Admin account (required)
  --password    Password for the account, minimum 8 characters (required)
  --name        Display name (default: "Super Admin")
  --help        Show this help message

Environment Variables Required:
  FIREBASE_PROJECT_ID
  FIREBASE_CLIENT_EMAIL
  FIREBASE_PRIVATE_KEY
  (or GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json)

Manual Alternative (via Firebase Console):
  1. Go to Firebase Console -> Authentication -> Users -> Add user
     Enter email & password. Note the generated User UID.
  2. Go to Firestore Database -> "users" collection -> Add document with Document ID = UID:
     {
       "id": "<UID>",
       "name": "Super Admin",
       "email": "<email>",
       "role": "superadmin",
       "status": "Active",
       "isVerified": true,
       "createdAt": Date.now(),
       "initials": "SA",
       "address": "Barangay Office",
       "contactNumber": "09123456789"
     }
`)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--help" || arg === "-h") {
      parsed.help = "true"
    } else if (arg.startsWith("--") && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      const key = arg.slice(2)
      parsed[key] = args[i + 1]
      i++
    }
  }

  return parsed
}

async function main() {
  const args = parseArgs()

  if (args.help || (!args.email && !args.password)) {
    printHelp()
    process.exit(args.help ? 0 : 1)
  }

  const email = (args.email || "").trim().toLowerCase()
  const password = args.password || ""
  const name = (args.name || "Super Admin").trim()

  if (!email || !email.includes("@")) {
    console.error("Error: A valid email address is required (--email user@domain.com)")
    process.exit(1)
  }

  if (!password || password.length < 8) {
    console.error("Error: Password must be at least 8 characters long (--password <pass>)")
    process.exit(1)
  }

  // Initialize Firebase Admin
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp()
    } else if (projectId && clientEmail && privateKey) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      })
    } else {
      console.error(`
Error: Firebase Admin credentials not found in environment.
Please set:
  - FIREBASE_PROJECT_ID
  - FIREBASE_CLIENT_EMAIL
  - FIREBASE_PRIVATE_KEY
Or set GOOGLE_APPLICATION_CREDENTIALS pointing to your service account JSON file.

Alternatively, you can manually create the user in the Firebase Console:
  1. Add user in Firebase Authentication.
  2. Create document 'users/<UID>' in Firestore with role='superadmin' and status='Active'.
See --help for detailed fields.
`)
      process.exit(1)
    }
  }

  const auth = getAuth()
  const db = getFirestore()

  console.log(`\nProvisioning Super Admin: ${email} (${name})...`)

  let uid: string

  // Step 1: Create or fetch Auth user
  try {
    const existingUser = await auth.getUserByEmail(email)
    uid = existingUser.uid
    console.log(`User already exists in Firebase Auth (UID: ${uid}). Updating password and email verification...`)
    await auth.updateUser(uid, {
      password,
      displayName: name,
      emailVerified: true,
    })
  } catch (err: any) {
    if (err.code === "auth/user-not-found") {
      console.log("Creating new user in Firebase Auth...")
      const newUser = await auth.createUser({
        email,
        password,
        displayName: name,
        emailVerified: true,
      })
      uid = newUser.uid
      console.log(`Created Firebase Auth user (UID: ${uid}).`)
    } else {
      throw err
    }
  }

  // Step 2: Write Super Admin document in Firestore `users/{uid}`
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map(p => p[0].toUpperCase())
    .slice(0, 2)
    .join("") || "SA"

  const userDocRef = db.collection("users").doc(uid)
  const existingDoc = await userDocRef.get()

  const payload = {
    id: uid,
    name,
    email,
    role: "superadmin",
    status: "Active",
    isVerified: true,
    initials,
    contactNumber: "09123456789",
    address: "Barangay Office",
    accountExpiry: "",
    updatedAt: Date.now(),
    ...(existingDoc.exists ? {} : { createdAt: Date.now() }),
  }

  await userDocRef.set(payload, { merge: true })

  console.log(`\nSuccessfully provisioned Super Admin account!`)
  console.log(`- UID:      ${uid}`)
  console.log(`- Email:    ${email}`)
  console.log(`- Role:     superadmin`)
  console.log(`- Status:   Active`)
  console.log(`- Verified: true\n`)
  console.log(`You can now sign in at the TALASYS portal (/auth/login) using these credentials.`)
}

main().catch((err) => {
  console.error("Provisioning failed:", err)
  process.exit(1)
})
