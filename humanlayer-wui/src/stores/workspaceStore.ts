/**
 * Zustand store for workspace management
 */

import { create } from 'zustand'
import { toast } from 'sonner'
import { logger } from '@/lib/logging'
import type { Workspace, WorkspaceEvent, CreateWorkspaceRequest } from '@/lib/workspace/types'
import { getWorkspaceClient } from '@/lib/workspace/client'

interface WorkspaceStore {
  // State
  workspaces: Workspace[]
  selectedWorkspace: Workspace | null
  selectedWorkspaceEvents: WorkspaceEvent[]
  isLoading: boolean
  isCreating: boolean
  isStarting: boolean
  isStopping: boolean
  isDeleting: boolean
  error: string | null

  // Actions
  fetchWorkspaces: (silent?: boolean) => Promise<void>
  createWorkspace: (request: CreateWorkspaceRequest) => Promise<Workspace>
  startWorkspace: (id: string) => Promise<void>
  stopWorkspace: (id: string) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  refreshWorkspace: (id: string) => Promise<void>
  selectWorkspace: (id: string | null) => Promise<void>
  fetchWorkspaceEvents: (id: string, limit?: number) => Promise<void>
  clearError: () => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  // Initial state
  workspaces: [],
  selectedWorkspace: null,
  selectedWorkspaceEvents: [],
  isLoading: false,
  isCreating: false,
  isStarting: false,
  isStopping: false,
  isDeleting: false,
  error: null,

  // Actions
  fetchWorkspaces: async (silent = false) => {
    if (!silent) {
      set({ isLoading: true, error: null })
    }
    try {
      const client = getWorkspaceClient()
      const newWorkspaces = await client.listWorkspaces()

      // Only update if data actually changed (prevents unnecessary re-renders)
      const { workspaces: current } = get()
      const hasChanged = JSON.stringify(newWorkspaces) !== JSON.stringify(current)

      if (hasChanged) {
        set({ workspaces: newWorkspaces, isLoading: false, error: null })
        logger.info('[WorkspaceStore] Fetched workspaces', { count: newWorkspaces.length })
      } else if (!silent) {
        set({ isLoading: false })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch workspaces'
      logger.error('[WorkspaceStore] Failed to fetch workspaces', { error: message })
      if (!silent) {
        set({ error: message, isLoading: false })
        toast.error(message)
      }
    }
  },

  createWorkspace: async (request: CreateWorkspaceRequest) => {
    set({ isCreating: true, error: null })
    try {
      const client = getWorkspaceClient()
      const workspace = await client.createWorkspace(request)

      // Add to list optimistically
      set(state => ({
        workspaces: [workspace, ...state.workspaces],
        isCreating: false,
      }))

      logger.info('[WorkspaceStore] Created workspace', { id: workspace.id, name: workspace.name })
      toast.success(`Workspace "${workspace.name}" created`)

      return workspace
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create workspace'
      logger.error('[WorkspaceStore] Failed to create workspace', { error: message })
      set({ error: message, isCreating: false })
      toast.error(message)
      throw error
    }
  },

  startWorkspace: async (id: string) => {
    const { workspaces } = get()
    const workspace = workspaces.find(w => w.id === id)
    if (!workspace) {
      toast.error('Workspace not found')
      return
    }

    set({ isStarting: true })

    // Optimistic update
    set(state => ({
      workspaces: state.workspaces.map(w =>
        w.id === id ? { ...w, status: 'pending' as const } : w
      ),
    }))

    try {
      const client = getWorkspaceClient()
      const updated = await client.startWorkspace(id)

      // Update with server response
      set(state => ({
        workspaces: state.workspaces.map(w =>
          w.id === id ? updated : w
        ),
        selectedWorkspace: state.selectedWorkspace?.id === id ? updated : state.selectedWorkspace,
        isStarting: false,
      }))

      logger.info('[WorkspaceStore] Started workspace', { id })
      toast.success(`Workspace "${workspace.name}" started`)
    } catch (error) {
      // Revert optimistic update
      set(state => ({
        workspaces: state.workspaces.map(w =>
          w.id === id ? workspace : w
        ),
        isStarting: false,
      }))

      const message = error instanceof Error ? error.message : 'Failed to start workspace'
      logger.error('[WorkspaceStore] Failed to start workspace', { id, error: message })
      toast.error(message)
    }
  },

  stopWorkspace: async (id: string) => {
    const { workspaces } = get()
    const workspace = workspaces.find(w => w.id === id)
    if (!workspace) {
      toast.error('Workspace not found')
      return
    }

    set({ isStopping: true })

    // Optimistic update
    set(state => ({
      workspaces: state.workspaces.map(w =>
        w.id === id ? { ...w, status: 'pending' as const } : w
      ),
    }))

    try {
      const client = getWorkspaceClient()
      const updated = await client.stopWorkspace(id)

      // Update with server response
      set(state => ({
        workspaces: state.workspaces.map(w =>
          w.id === id ? updated : w
        ),
        selectedWorkspace: state.selectedWorkspace?.id === id ? updated : state.selectedWorkspace,
        isStopping: false,
      }))

      logger.info('[WorkspaceStore] Stopped workspace', { id })
      toast.success(`Workspace "${workspace.name}" stopped`)
    } catch (error) {
      // Revert optimistic update
      set(state => ({
        workspaces: state.workspaces.map(w =>
          w.id === id ? workspace : w
        ),
        isStopping: false,
      }))

      const message = error instanceof Error ? error.message : 'Failed to stop workspace'
      logger.error('[WorkspaceStore] Failed to stop workspace', { id, error: message })
      toast.error(message)
    }
  },

  deleteWorkspace: async (id: string) => {
    const { workspaces } = get()
    const workspace = workspaces.find(w => w.id === id)
    if (!workspace) {
      toast.error('Workspace not found')
      return
    }

    set({ isDeleting: true })

    // Optimistic removal
    set(state => ({
      workspaces: state.workspaces.filter(w => w.id !== id),
      selectedWorkspace: state.selectedWorkspace?.id === id ? null : state.selectedWorkspace,
    }))

    try {
      const client = getWorkspaceClient()
      await client.deleteWorkspace(id)

      set({ isDeleting: false })
      logger.info('[WorkspaceStore] Deleted workspace', { id })
      toast.success(`Workspace "${workspace.name}" deleted`)
    } catch (error) {
      // Revert optimistic removal
      set(state => ({
        workspaces: [...state.workspaces, workspace],
        isDeleting: false,
      }))

      const message = error instanceof Error ? error.message : 'Failed to delete workspace'
      logger.error('[WorkspaceStore] Failed to delete workspace', { id, error: message })
      toast.error(message)
    }
  },

  refreshWorkspace: async (id: string) => {
    try {
      const client = getWorkspaceClient()
      const workspace = await client.getWorkspace(id)

      set(state => ({
        workspaces: state.workspaces.map(w =>
          w.id === id ? workspace : w
        ),
        selectedWorkspace: state.selectedWorkspace?.id === id ? workspace : state.selectedWorkspace,
      }))

      logger.debug('[WorkspaceStore] Refreshed workspace', { id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh workspace'
      logger.error('[WorkspaceStore] Failed to refresh workspace', { id, error: message })
    }
  },

  selectWorkspace: async (id: string | null) => {
    if (id === null) {
      set({ selectedWorkspace: null, selectedWorkspaceEvents: [] })
      return
    }

    const { workspaces } = get()
    const workspace = workspaces.find(w => w.id === id)

    if (workspace) {
      set({ selectedWorkspace: workspace })
      // Fetch events for selected workspace
      await get().fetchWorkspaceEvents(id)
    } else {
      // Fetch from server if not in local state
      try {
        const client = getWorkspaceClient()
        const fetched = await client.getWorkspace(id)
        set({ selectedWorkspace: fetched })
        await get().fetchWorkspaceEvents(id)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get workspace'
        logger.error('[WorkspaceStore] Failed to select workspace', { id, error: message })
        toast.error(message)
      }
    }
  },

  fetchWorkspaceEvents: async (id: string, limit = 50) => {
    try {
      const client = getWorkspaceClient()
      const events = await client.getEvents(id, limit)
      set({ selectedWorkspaceEvents: events })
      logger.debug('[WorkspaceStore] Fetched workspace events', { id, count: events.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch events'
      logger.error('[WorkspaceStore] Failed to fetch workspace events', { id, error: message })
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))
