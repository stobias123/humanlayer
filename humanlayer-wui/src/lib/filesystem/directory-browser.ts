import { isTauri } from '@/lib/utils'
import { daemonClient } from '@/lib/daemon'
import type { DirectoryEntry, DirectoryBrowseOptions } from './types'

/**
 * Tauri API types (imported dynamically)
 */
interface TauriApis {
  readDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }>>
  homeDir: () => Promise<string>
}

/**
 * Lazily load Tauri filesystem APIs
 */
let tauriApis: TauriApis | null = null
async function getTauriApis(): Promise<TauriApis | null> {
  if (!isTauri()) return null

  if (!tauriApis) {
    try {
      const [fsPlugin, pathApi] = await Promise.all([
        import('@tauri-apps/plugin-fs'),
        import('@tauri-apps/api/path'),
      ])
      tauriApis = {
        readDir: fsPlugin.readDir,
        homeDir: pathApi.homeDir,
      }
    } catch (error) {
      console.error('Failed to load Tauri APIs:', error)
      return null
    }
  }
  return tauriApis
}

/**
 * Expand ~ to home directory path
 * In Tauri: uses homeDir() API
 * In Web: returns path as-is (daemon handles expansion)
 */
export async function expandHomePath(path: string): Promise<string> {
  if (!path.startsWith('~')) return path

  const tauri = await getTauriApis()
  if (tauri) {
    const home = await tauri.homeDir()
    return path.replace(/^~(?=$|\/|\\)/, home)
  }

  // In web, return as-is - daemon will expand
  return path
}

/**
 * Contract home directory back to ~
 * Used to display paths with ~ instead of full home path
 */
export function contractToHomePath(path: string, homePath: string): string {
  if (path.startsWith(homePath)) {
    return '~' + path.slice(homePath.length)
  }
  return path
}

/**
 * Parse search path into directory and search pattern
 */
function parseSearchPath(searchPath: string): { dirPath: string; searchQuery: string } {
  if (searchPath === '~' || searchPath === '/') {
    return { dirPath: searchPath, searchQuery: '' }
  }

  if (searchPath.endsWith('/')) {
    return { dirPath: searchPath.slice(0, -1), searchQuery: '' }
  }

  const lastSlashIndex = searchPath.lastIndexOf('/')
  if (lastSlashIndex === -1) {
    return { dirPath: '.', searchQuery: searchPath }
  }

  return {
    dirPath: searchPath.substring(0, lastSlashIndex) || '/',
    searchQuery: searchPath.substring(lastSlashIndex + 1),
  }
}

/**
 * Browse directory using Tauri APIs (desktop)
 */
async function browseWithTauri(
  searchPath: string,
  options: DirectoryBrowseOptions,
): Promise<DirectoryEntry[]> {
  const tauri = await getTauriApis()
  if (!tauri) throw new Error('Tauri APIs not available')

  const { dirPath, searchQuery } = parseSearchPath(searchPath)

  // Expand ~ if needed
  let expandedPath = dirPath
  if (dirPath === '~' || dirPath.startsWith('~/')) {
    const home = await tauri.homeDir()
    expandedPath = dirPath === '~' ? home : dirPath.replace('~', home)
  }

  // Read directory
  const entries = await tauri.readDir(expandedPath)

  // Filter by type
  const filtered = entries.filter(entry => {
    if (entry.isDirectory && options.includeDirectories !== false) return true
    if (entry.isFile && options.includeFiles) {
      if (options.fileExtensions?.length) {
        return options.fileExtensions.some(ext => entry.name?.endsWith(ext))
      }
      return true
    }
    return false
  })

  // Apply search filter if query exists
  let results = filtered
  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    results = filtered.filter(e => e.name?.toLowerCase().includes(query))
  }

  // Limit results
  const limited = results.slice(0, options.maxResults || 10)

  // Normalize to DirectoryEntry format
  return limited.map(entry => ({
    name: entry.name || '',
    isDirectory: entry.isDirectory,
    isFile: entry.isFile,
    fullPath: `${expandedPath}/${entry.name}`,
  }))
}

/**
 * Browse directory using daemon API (web)
 */
async function browseWithDaemon(
  searchPath: string,
  options: DirectoryBrowseOptions,
): Promise<DirectoryEntry[]> {
  const { dirPath, searchQuery } = parseSearchPath(searchPath)

  // Build query for daemon - it handles ~ expansion
  const query = searchQuery ? `${dirPath}/${searchQuery}` : `${dirPath}/`

  const response = await daemonClient.fuzzySearchFiles({
    query,
    paths: ['/'], // Not used when query is absolute path
    limit: options.maxResults || 10,
    filesOnly: options.includeFiles && !options.includeDirectories,
    respectGitignore: false, // Don't filter by gitignore for directory browsing
  })

  // Filter results by type
  const filtered = response.results.filter(match => {
    if (match.isDirectory && options.includeDirectories !== false) return true
    if (!match.isDirectory && options.includeFiles) {
      if (options.fileExtensions?.length) {
        return options.fileExtensions.some(ext => match.path.endsWith(ext))
      }
      return true
    }
    return false
  })

  // Normalize to DirectoryEntry format
  return filtered.map(match => {
    // Extract basename from path
    const name = match.path.split('/').pop() || match.path

    return {
      name,
      isDirectory: match.isDirectory,
      isFile: !match.isDirectory,
      fullPath: match.path,
      matchedIndexes: match.matchedIndexes,
    }
  })
}

/**
 * Check if directory browsing is available
 * In Tauri: always available
 * In Web: requires daemon connection
 */
export async function isDirectoryBrowsingAvailable(): Promise<boolean> {
  if (isTauri()) return true

  try {
    // Quick health check
    await daemonClient.health()
    return true
  } catch {
    return false
  }
}

/**
 * Get home directory path
 * In Tauri: uses homeDir() API
 * In Web: returns undefined (daemon handles ~ expansion)
 */
export async function getHomePath(): Promise<string | undefined> {
  const tauri = await getTauriApis()
  if (tauri) {
    return tauri.homeDir()
  }
  return undefined
}

/**
 * Browse a directory path, using platform-appropriate implementation
 */
export async function browseDirectory(
  searchPath: string,
  options: DirectoryBrowseOptions = {},
): Promise<DirectoryEntry[]> {
  if (!searchPath) return []

  if (isTauri()) {
    return browseWithTauri(searchPath, options)
  } else {
    return browseWithDaemon(searchPath, options)
  }
}
