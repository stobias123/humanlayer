import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { renderHook, waitFor } from '@testing-library/react'

// Mock the filesystem abstraction layer
const mockBrowseDirectory = mock<() => Promise<any[]>>(() => Promise.resolve([]))
const mockIsDirectoryBrowsingAvailable = mock<() => Promise<boolean>>(() => Promise.resolve(true))
const mockFuzzySearch = mock<(items: any[]) => any[]>((items: any[]) =>
  items.map((item: any) => ({ item, matches: [] })),
)

// Mock the modules
mock.module('@/lib/filesystem', () => ({
  browseDirectory: mockBrowseDirectory,
  isDirectoryBrowsingAvailable: mockIsDirectoryBrowsingAvailable,
}))

mock.module('@/lib/fuzzy-search', () => ({
  fuzzySearch: mockFuzzySearch,
}))

// Now import the module under test
import { useFileBrowser } from './useFileBrowser'

describe('useFileBrowser', () => {
  beforeEach(() => {
    mockBrowseDirectory.mockClear()
    mockIsDirectoryBrowsingAvailable.mockClear()
    mockFuzzySearch.mockClear()
    mockIsDirectoryBrowsingAvailable.mockResolvedValue(true)
    mockBrowseDirectory.mockResolvedValue([])

    // Default fuzzy search behavior - return all items
    mockFuzzySearch.mockImplementation((items: any[]) => {
      return items.map((item: any) => ({ item, matches: [] }))
    })
  })

  test('returns empty results for empty search path', () => {
    const { result } = renderHook(() => useFileBrowser(''))

    expect(result.current.results).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  test('returns isAvailable from abstraction layer', async () => {
    mockIsDirectoryBrowsingAvailable.mockResolvedValue(true)

    const { result } = renderHook(() => useFileBrowser(''))

    await waitFor(() => {
      expect(result.current.isAvailable).toBe(true)
    })
  })

  test('expands home directory in paths', async () => {
    mockBrowseDirectory.mockResolvedValueOnce([
      { name: 'file.ts', isFile: true, isDirectory: false, fullPath: '/Users/test/Documents/file.ts' },
    ])

    const { result } = renderHook(() => useFileBrowser('~/Documents/', { includeFiles: true }))

    // Wait for the debounce timeout (150ms) and loading to complete
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.results.length).toBeGreaterThan(0)
      },
      { timeout: 1000 },
    )

    expect(mockBrowseDirectory).toHaveBeenCalled()
    expect(result.current.results).toHaveLength(1)
    expect(result.current.results[0].fullPath).toBe('/Users/test/Documents/file.ts')
  })

  test('treats single word as search query not directory navigation', async () => {
    // When given a single word like "humanlayer", it should search for it
    // in the current directory rather than trying to navigate into it
    mockBrowseDirectory.mockResolvedValueOnce([
      { name: 'humanlayer', isFile: false, isDirectory: true, fullPath: './humanlayer' },
      { name: 'humanlayer-go', isFile: false, isDirectory: true, fullPath: './humanlayer-go' },
      { name: 'humanlayer-tui', isFile: false, isDirectory: true, fullPath: './humanlayer-tui' },
    ])

    const { result } = renderHook(() => useFileBrowser('humanlayer'))

    // Wait for debounce and loading
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
        // Check that results were populated
        if (result.current.results.length > 0) {
          return true
        }
        throw new Error('Waiting for results')
      },
      { timeout: 500 },
    )

    // Should search in current directory for "humanlayer"
    expect(mockBrowseDirectory).toHaveBeenCalled()
    // Should return fuzzy search results
    expect(result.current.results.length).toBeGreaterThan(0)
  })

  test('navigates into directory when path ends with slash', async () => {
    // When path ends with slash, should list directory contents
    mockBrowseDirectory.mockResolvedValueOnce([
      { name: 'cli', isFile: false, isDirectory: true, fullPath: 'humanlayer/cli' },
      { name: 'core', isFile: false, isDirectory: true, fullPath: 'humanlayer/core' },
    ])

    const { result } = renderHook(() => useFileBrowser('humanlayer/'))

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
        if (result.current.results.length > 0) {
          return true
        }
        throw new Error('Waiting for results')
      },
      { timeout: 500 },
    )

    // Should have called browseDirectory
    expect(mockBrowseDirectory).toHaveBeenCalled()
    // Should list directory contents without search
    expect(result.current.results).toHaveLength(2)
    expect(result.current.results[0].name).toBe('cli')
    expect(result.current.results[1].name).toBe('core')
  })

  test('searches for query in absolute path directories', async () => {
    // When given an absolute path with a search term, should search in that directory
    mockBrowseDirectory.mockResolvedValueOnce([
      {
        name: 'README.md',
        isFile: true,
        isDirectory: false,
        fullPath: '/Users/test/project/README.md',
      },
      {
        name: 'release.md',
        isFile: true,
        isDirectory: false,
        fullPath: '/Users/test/project/release.md',
      },
      {
        name: 'package.json',
        isFile: true,
        isDirectory: false,
        fullPath: '/Users/test/project/package.json',
      },
    ])

    const { result } = renderHook(() =>
      useFileBrowser('/Users/test/project/release', { includeFiles: true }),
    )

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
        if (result.current.results.length > 0) {
          return true
        }
        throw new Error('Waiting for results')
      },
      { timeout: 500 },
    )

    // Should have called browseDirectory
    expect(mockBrowseDirectory).toHaveBeenCalled()
    // Fuzzy search should find results
    expect(result.current.results.length).toBeGreaterThan(0)
  })

  test('lists directory contents when path has trailing slash', async () => {
    // When given a path with trailing slash, should list directory contents
    mockBrowseDirectory.mockResolvedValueOnce([
      {
        name: 'README.md',
        isFile: true,
        isDirectory: false,
        fullPath: '/Users/test/project/README.md',
      },
      {
        name: 'package.json',
        isFile: true,
        isDirectory: false,
        fullPath: '/Users/test/project/package.json',
      },
      { name: 'src', isFile: false, isDirectory: true, fullPath: '/Users/test/project/src' },
    ])

    const { result } = renderHook(() => useFileBrowser('/Users/test/project/', { includeFiles: true }))

    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
        if (result.current.results.length > 0) {
          return true
        }
        throw new Error('Waiting for results')
      },
      { timeout: 500 },
    )

    // Should have called browseDirectory
    expect(mockBrowseDirectory).toHaveBeenCalled()
    // Should show all files and directories
    expect(result.current.results).toHaveLength(3)
    expect(result.current.results.map(r => r.name)).toContain('README.md')
    expect(result.current.results.map(r => r.name)).toContain('package.json')
    expect(result.current.results.map(r => r.name)).toContain('src')
  })

  test('does not browse when unavailable', async () => {
    mockIsDirectoryBrowsingAvailable.mockResolvedValue(false)

    const { result, rerender } = renderHook(({ path }) => useFileBrowser(path), {
      initialProps: { path: '' },
    })

    // Wait for availability check
    await waitFor(() => {
      expect(result.current.isAvailable).toBe(false)
    })

    // Now try to browse
    rerender({ path: '/some/path' })

    // Should not call browseDirectory since unavailable
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockBrowseDirectory).not.toHaveBeenCalled()
    expect(result.current.results).toEqual([])
  })
})
