import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { useStore } from './AppStore'
import { createMockSession } from '@/test-utils'
import { ViewMode } from '@/lib/daemon/types'
import type { Folder } from '@/lib/daemon/types'

// Create mock functions with proper typing
const mockBulkMoveSessions = mock(() => Promise.resolve({ success: true }))
const mockGetSessionLeaves = mock(() =>
  Promise.resolve({ sessions: [] as any[], counts: { normal: 0, archived: 0, draft: 0 } }),
)
const mockListFolders = mock(() => Promise.resolve([] as Folder[]))

// Mock the daemon client module
mock.module('@/lib/daemon', () => ({
  daemonClient: {
    bulkMoveSessions: mockBulkMoveSessions,
    getSessionLeaves: mockGetSessionLeaves,
    listFolders: mockListFolders,
  },
}))

// Mock logger to avoid console noise
mock.module('@/lib/logging', () => ({
  logger: {
    log: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
  },
}))

// Helper to create mock folder
function createMockFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: `folder-${Math.random().toString(36).substring(7)}`,
    name: 'Test Folder',
    parentId: undefined,
    position: 0,
    archived: false,
    sessionCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('AppStore - Folder Assignment', () => {
  beforeEach(async () => {
    // Reset store to initial state
    useStore.setState({
      sessions: [],
      folders: [],
      focusedSession: null,
      selectedSessions: new Set(),
      currentFolderId: null,
      isRefreshing: false,
    })
    useStore.getState().setViewMode(ViewMode.Normal)

    // Clear all mocks
    mockBulkMoveSessions.mockClear()
    mockGetSessionLeaves.mockClear()
    mockListFolders.mockClear()

    // Make sure any pending operations are complete
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  test('moveSessionsToFolder calls daemon API with correct params', async () => {
    const session = createMockSession({ id: 'session-1' })
    useStore.setState({ sessions: [session] })

    mockGetSessionLeaves.mockResolvedValueOnce({
      sessions: [session],
      counts: { normal: 1, archived: 0, draft: 0 },
    })
    mockListFolders.mockResolvedValueOnce([])

    await useStore.getState().moveSessionsToFolder(['session-1'], 'folder-123')

    expect(mockBulkMoveSessions).toHaveBeenCalledWith(['session-1'], 'folder-123')
  })

  test('moveSessionsToFolder refreshes sessions after move', async () => {
    const session = createMockSession({ id: 'session-1' })
    useStore.setState({ sessions: [session] })

    // Mock response with updated session (now has folderId)
    const updatedSession = createMockSession({ id: 'session-1', folderId: 'folder-123' })
    mockGetSessionLeaves.mockResolvedValueOnce({
      sessions: [updatedSession],
      counts: { normal: 1, archived: 0, draft: 0 },
    })
    mockListFolders.mockResolvedValueOnce([])

    await useStore.getState().moveSessionsToFolder(['session-1'], 'folder-123')

    // Verify refreshSessions was called (getSessionLeaves is called by refreshSessions)
    expect(mockGetSessionLeaves).toHaveBeenCalled()
  })

  test('moveSessionsToFolder with null removes from folder', async () => {
    const session = createMockSession({ id: 'session-1', folderId: 'folder-123' })
    useStore.setState({ sessions: [session] })

    mockGetSessionLeaves.mockResolvedValueOnce({
      sessions: [session],
      counts: { normal: 1, archived: 0, draft: 0 },
    })
    mockListFolders.mockResolvedValueOnce([])

    await useStore.getState().moveSessionsToFolder(['session-1'], null)

    expect(mockBulkMoveSessions).toHaveBeenCalledWith(['session-1'], null)
  })

  test('setCurrentFolderId updates state and refreshes sessions', async () => {
    mockGetSessionLeaves.mockResolvedValueOnce({
      sessions: [],
      counts: { normal: 0, archived: 0, draft: 0 },
    })

    await useStore.getState().setCurrentFolderId('folder-123')

    const state = useStore.getState()
    expect(state.currentFolderId).toBe('folder-123')
    expect(mockGetSessionLeaves).toHaveBeenCalled()
  })

  test('setCurrentFolderId with null clears filter', async () => {
    // First set a folder
    useStore.setState({ currentFolderId: 'folder-123' })

    mockGetSessionLeaves.mockResolvedValueOnce({
      sessions: [],
      counts: { normal: 0, archived: 0, draft: 0 },
    })

    await useStore.getState().setCurrentFolderId(null)

    const state = useStore.getState()
    expect(state.currentFolderId).toBe(null)
  })

  test('refreshSessions passes folder_id when currentFolderId is set', async () => {
    useStore.setState({ currentFolderId: 'folder-123' })

    mockGetSessionLeaves.mockResolvedValueOnce({
      sessions: [],
      counts: { normal: 0, archived: 0, draft: 0 },
    })

    await useStore.getState().refreshSessions()

    // Verify folder_id was passed to the API
    expect(mockGetSessionLeaves).toHaveBeenCalledWith(
      expect.objectContaining({ folder_id: 'folder-123' }),
    )
  })

  test('refreshSessions passes undefined folder_id when currentFolderId is null', async () => {
    useStore.setState({ currentFolderId: null })

    mockGetSessionLeaves.mockResolvedValueOnce({
      sessions: [],
      counts: { normal: 0, archived: 0, draft: 0 },
    })

    await useStore.getState().refreshSessions()

    // Verify no folder_id filter (undefined)
    expect(mockGetSessionLeaves).toHaveBeenCalledWith(expect.objectContaining({ folder_id: undefined }))
  })

  test('sessions returned from API should have folderId populated', async () => {
    const folder = createMockFolder({ id: 'folder-123', name: 'Test Folder' })
    const session = createMockSession({ id: 'session-1', folderId: 'folder-123' })

    useStore.setState({ folders: [folder] })
    mockGetSessionLeaves.mockResolvedValueOnce({
      sessions: [session],
      counts: { normal: 1, archived: 0, draft: 0 },
    })

    await useStore.getState().refreshSessions()

    const state = useStore.getState()
    expect(state.sessions[0].folderId).toBe('folder-123')
  })
})
