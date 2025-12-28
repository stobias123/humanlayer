/**
 * Normalized directory entry that works across Tauri and daemon APIs
 */
export interface DirectoryEntry {
  /** Entry name (basename only) */
  name: string
  /** Whether this is a directory */
  isDirectory: boolean
  /** Whether this is a file */
  isFile: boolean
  /** Full absolute path */
  fullPath: string
  /** Fuzzy match indices (optional, for highlighting) */
  matchedIndexes?: number[]
}

/**
 * Options for directory browsing
 */
export interface DirectoryBrowseOptions {
  /** Include files in results (default: false) */
  includeFiles?: boolean
  /** Include directories in results (default: true) */
  includeDirectories?: boolean
  /** Filter by file extensions (only when includeFiles is true) */
  fileExtensions?: string[]
  /** Maximum results to return (default: 10) */
  maxResults?: number
}

/**
 * Result of directory browsing operation
 */
export interface DirectoryBrowseResult {
  entries: DirectoryEntry[]
  isLoading: boolean
  error: string | null
  /** Whether browsing is available (false when daemon unavailable in web) */
  isAvailable: boolean
}
