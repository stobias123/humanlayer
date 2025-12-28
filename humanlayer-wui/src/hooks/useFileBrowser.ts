import { useState, useEffect } from 'react'
import { browseDirectory, isDirectoryBrowsingAvailable } from '@/lib/filesystem'
import type { DirectoryEntry, DirectoryBrowseOptions } from '@/lib/filesystem'
import { fuzzySearch } from '@/lib/fuzzy-search'

export interface FileBrowserOptions extends DirectoryBrowseOptions {
  // Inherits: includeFiles, includeDirectories, fileExtensions, maxResults
}

export interface FileBrowserResult extends DirectoryEntry {
  matches?: Array<{ indices: number[]; value?: string; key?: string }>
}

export function useFileBrowser(searchPath: string, options: FileBrowserOptions = {}) {
  const {
    includeFiles = false,
    includeDirectories = true,
    fileExtensions = [],
    maxResults = 10,
  } = options

  const [results, setResults] = useState<FileBrowserResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState(true)

  // Stabilize the fileExtensions array reference
  const fileExtensionsKey = fileExtensions.join(',')

  // Check availability on mount
  useEffect(() => {
    isDirectoryBrowsingAvailable().then(setIsAvailable)
  }, [])

  useEffect(() => {
    if (!searchPath) {
      setResults([])
      setIsLoading(false)
      setError(null)
      return
    }

    // If browsing not available, don't try
    if (!isAvailable) {
      setResults([])
      setIsLoading(false)
      setError(null)
      return
    }

    // Debounce the file fetching
    const timeoutId = setTimeout(async () => {
      setIsLoading(true)
      setError(null)

      try {
        const entries = await browseDirectory(searchPath, {
          includeFiles,
          includeDirectories,
          fileExtensions,
          maxResults: maxResults * 2, // Get more for fuzzy filtering
        })

        // Extract search query for fuzzy matching
        const lastSlashIndex = searchPath.lastIndexOf('/')
        const searchQuery =
          lastSlashIndex === -1 ? searchPath : searchPath.substring(lastSlashIndex + 1)

        // Apply fuzzy search if there's a search query
        let searchResults: FileBrowserResult[]
        if (searchQuery) {
          const fuzzyResults = fuzzySearch(entries, searchQuery, {
            keys: ['name'],
            threshold: 0.01,
            minMatchCharLength: 1,
            includeMatches: true,
          })

          searchResults = fuzzyResults.slice(0, maxResults).map(result => ({
            ...result.item,
            matches: result.matches,
          }))
        } else {
          searchResults = entries.slice(0, maxResults)
        }

        setResults(searchResults)
      } catch (err) {
        console.error('useFileBrowser: error reading directory:', err)
        setError(err instanceof Error ? err.message : 'Failed to read directory')
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 150)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [searchPath, includeFiles, includeDirectories, fileExtensionsKey, maxResults, isAvailable])

  return { results, isLoading, error, isAvailable }
}
