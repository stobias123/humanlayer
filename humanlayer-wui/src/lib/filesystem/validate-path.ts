import { isTauri } from '@/lib/utils'
import { daemonClient } from '@/lib/daemon'
import { expandHomePath } from './directory-browser'

/**
 * Check if a path exists
 * In Tauri: uses exists() API
 * In Web: uses daemon validateDirectory API
 */
export async function pathExists(path: string): Promise<boolean> {
  if (!path) return false

  if (isTauri()) {
    try {
      const { exists } = await import('@tauri-apps/plugin-fs')
      const expandedPath = await expandHomePath(path)
      return await exists(expandedPath)
    } catch {
      return false
    }
  } else {
    try {
      const response = await daemonClient.validateDirectory(path)
      return response._exists
    } catch {
      return false
    }
  }
}

/**
 * Validate a directory path before use
 * Returns error message if invalid, null if valid
 */
export async function validateDirectoryPath(path: string): Promise<string | null> {
  if (!path) return null // Empty is allowed

  try {
    const exists = await pathExists(path)
    if (!exists) {
      return `Directory does not exist: ${path}`
    }
    return null
  } catch (error) {
    return `Error checking directory: ${error}`
  }
}
