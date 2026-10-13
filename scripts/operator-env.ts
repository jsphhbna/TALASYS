import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { loadEnvFile } from "node:process"

/** Explicitly load operator env files because ordinary Node scripts do not load Next.js env files. */
export function loadOperatorEnv(cwd = process.cwd()): string[] {
  const loaded: string[] = []
  for (const name of [".env.local", ".env"]) {
    const path = resolve(cwd, name)
    if (!existsSync(path)) continue
    loadEnvFile(path)
    loaded.push(name)
  }
  return loaded
}
