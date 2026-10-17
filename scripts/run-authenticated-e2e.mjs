import { spawn } from "node:child_process"

const projectId = "talasys-e2e"
const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8180",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
  NEXT_PUBLIC_AUTH_EMULATOR_URL: "http://127.0.0.1:9199",
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "127.0.0.1",
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: "8180",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyB00000000000000000000000000000000",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "talasys-test-cloud",
  NEXT_PUBLIC_CLOUDINARY_API_KEY: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || "talasys-test-key",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "talasys-test-secret-123456789",
  PORT: process.env.PORT || "3000",
  PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT || "3000",
}
const firebaseCli = "node_modules/firebase-tools/lib/bin/firebase.js"
const command = "node node_modules/@playwright/test/cli.js test test/e2e/authenticated-workflows.spec.ts --project=chromium"
const child = spawn(process.execPath, [firebaseCli, "emulators:exec", "--config", "firebase.e2e.json", "--project", projectId, "--only", "auth,firestore", command], { cwd: process.cwd(), env, stdio: "inherit", shell: false })
child.on("exit", code => { process.exitCode = code ?? 1 })
child.on("error", error => { console.error(error); process.exitCode = 1 })
