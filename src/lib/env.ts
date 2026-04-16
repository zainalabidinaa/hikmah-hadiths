import { existsSync } from "node:fs"

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export function resolveSourceLocation(localPath?: string, baseUrl?: string): { localPath?: string; baseUrl?: string } {
  if (localPath && existsSync(localPath)) {
    return { localPath }
  }
  if (baseUrl) {
    return { baseUrl }
  }
  return {}
}
