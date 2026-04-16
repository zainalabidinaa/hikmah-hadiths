import { readFile } from "node:fs/promises"
import { join } from "node:path"

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`
}

export async function readText(relativePath: string, source: { localPath?: string; baseUrl?: string }): Promise<string> {
  if (source.localPath) {
    return readFile(join(source.localPath, relativePath), "utf8")
  }

  if (source.baseUrl) {
    const response = await fetch(new URL(relativePath, ensureTrailingSlash(source.baseUrl)))
    if (!response.ok) {
      throw new Error(`Failed to fetch ${relativePath}: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }

  throw new Error(`No local path or base URL configured for ${relativePath}`)
}

export async function readJson<T>(relativePath: string, source: { localPath?: string; baseUrl?: string }): Promise<T> {
  return JSON.parse(await readText(relativePath, source)) as T
}
