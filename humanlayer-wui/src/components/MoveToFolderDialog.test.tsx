import { describe, test, expect } from 'bun:test'
import type { Folder } from '@/lib/daemon/types'

/**
 * This test validates the folder hierarchy building logic in MoveToFolderDialog.
 *
 * BUG DISCOVERED: The MoveToFolderDialog.tsx uses `f.parentId === null` to find
 * root-level folders. However, the SDK's FolderFromJSONTyped converts null parent_id
 * to undefined, so root folders have `parentId: undefined` instead of `parentId: null`.
 *
 * This causes the folder dialog to appear empty even when folders exist.
 */
describe('MoveToFolderDialog - Folder Hierarchy Building', () => {
  // Replicate the buildOptions logic from MoveToFolderDialog.tsx
  const buildFolderOptions = (
    folders: Folder[],
    parentId: string | null,
    depth: number,
  ): Array<{ id: string | null; name: string; depth: number }> => {
    const children = folders.filter(f => f.parentId === parentId && !f.archived)
    const result: Array<{ id: string | null; name: string; depth: number }> = []

    for (const folder of children) {
      result.push({ id: folder.id, name: folder.name, depth })
      result.push(...buildFolderOptions(folders, folder.id, depth + 1))
    }
    return result
  }

  // This is the correct implementation that handles undefined parentId
  const buildFolderOptionsFixed = (
    folders: Folder[],
    parentId: string | null,
    depth: number,
  ): Array<{ id: string | null; name: string; depth: number }> => {
    const children = folders.filter(f => {
      // Handle both null and undefined for root-level folders
      const folderParentId = f.parentId ?? null
      return folderParentId === parentId && !f.archived
    })
    const result: Array<{ id: string | null; name: string; depth: number }> = []

    for (const folder of children) {
      result.push({ id: folder.id, name: folder.name, depth })
      result.push(...buildFolderOptionsFixed(folders, folder.id, depth + 1))
    }
    return result
  }

  test('BUG: folders with undefined parentId are not found when filtering with null', () => {
    // This simulates what the SDK returns - parentId is undefined for root folders
    const foldersFromSDK: Folder[] = [
      {
        id: 'folder-1',
        name: 'Work',
        parentId: undefined, // SDK converts null to undefined
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'folder-2',
        name: 'Personal',
        parentId: undefined, // SDK converts null to undefined
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    // Current buggy implementation - filters with parentId === null
    const options = buildFolderOptions(foldersFromSDK, null, 0)

    // BUG: This returns empty because undefined !== null
    expect(options.length).toBe(0) // This is the bug - should be 2
  })

  test('FIXED: folders with undefined parentId are found when using nullish coalescing', () => {
    // Same SDK folders with undefined parentId
    const foldersFromSDK: Folder[] = [
      {
        id: 'folder-1',
        name: 'Work',
        parentId: undefined,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'folder-2',
        name: 'Personal',
        parentId: undefined,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    // Fixed implementation using nullish coalescing
    const options = buildFolderOptionsFixed(foldersFromSDK, null, 0)

    // Now it correctly finds root folders
    expect(options.length).toBe(2)
    expect(options[0].name).toBe('Work')
    expect(options[1].name).toBe('Personal')
  })

  test('FIXED: nested folder hierarchy works correctly', () => {
    const folders: Folder[] = [
      {
        id: 'folder-1',
        name: 'Work',
        parentId: undefined, // Root folder
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'folder-2',
        name: 'Projects',
        parentId: 'folder-1', // Child of Work
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'folder-3',
        name: 'Personal',
        parentId: undefined, // Root folder
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const options = buildFolderOptionsFixed(folders, null, 0)

    expect(options.length).toBe(3)
    expect(options[0]).toEqual({ id: 'folder-1', name: 'Work', depth: 0 })
    expect(options[1]).toEqual({ id: 'folder-2', name: 'Projects', depth: 1 })
    expect(options[2]).toEqual({ id: 'folder-3', name: 'Personal', depth: 0 })
  })

  test('archived folders are excluded', () => {
    const folders: Folder[] = [
      {
        id: 'folder-1',
        name: 'Active',
        parentId: undefined,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'folder-2',
        name: 'Archived',
        parentId: undefined,
        archived: true, // Should be excluded
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const options = buildFolderOptionsFixed(folders, null, 0)

    expect(options.length).toBe(1)
    expect(options[0].name).toBe('Active')
  })
})
