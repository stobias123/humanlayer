/**
 * HTTP client for workspace daemon API
 */

import { logger } from '@/lib/logging'
import type {
  WorkspaceClient as IWorkspaceClient,
  Workspace,
  WorkspaceEvent,
  CreateWorkspaceRequest,
  HealthResponse,
  WorkspaceResponse,
  WorkspaceListResponse,
  EventListResponse,
  MessageResponse,
} from './types'

const DEFAULT_WORKSPACE_DAEMON_URL = 'http://localhost:8888'

function getWorkspaceDaemonUrl(): string {
  // Check for environment variable override
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WORKSPACE_DAEMON_URL) {
    return import.meta.env.VITE_WORKSPACE_DAEMON_URL
  }
  // Check for localStorage override
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('workspace.daemon.url')
    if (stored) return stored
  }
  return DEFAULT_WORKSPACE_DAEMON_URL
}

export class HTTPWorkspaceClient implements IWorkspaceClient {
  private baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? getWorkspaceDaemonUrl()
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      if (!response.ok) {
        const errorBody = await response.text()
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorJson = JSON.parse(errorBody)
          if (errorJson.error) {
            errorMessage = errorJson.error
          }
        } catch {
          // Use default error message
        }
        logger.error('[WorkspaceClient] Request failed:', { url, status: response.status, error: errorMessage })
        throw new Error(errorMessage)
      }

      const data = await response.json()
      return data as T
    } catch (error) {
      if (error instanceof Error && error.message.includes('Failed to fetch')) {
        logger.error('[WorkspaceClient] Connection failed:', { url })
        throw new Error('Cannot connect to workspace daemon. Is it running?')
      }
      throw error
    }
  }

  async health(): Promise<HealthResponse> {
    return this.fetch<HealthResponse>('/health')
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const response = await this.fetch<WorkspaceListResponse>('/workspaces')
    if (response.error) {
      throw new Error(response.error)
    }
    return response.data
  }

  async getWorkspace(id: string): Promise<Workspace> {
    const response = await this.fetch<WorkspaceResponse>(`/workspaces/${id}`)
    if (response.error) {
      throw new Error(response.error)
    }
    return response.data
  }

  async createWorkspace(request: CreateWorkspaceRequest): Promise<Workspace> {
    const response = await this.fetch<WorkspaceResponse>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(request),
    })
    if (response.error) {
      throw new Error(response.error)
    }
    return response.data
  }

  async deleteWorkspace(id: string): Promise<void> {
    const response = await this.fetch<MessageResponse>(`/workspaces/${id}`, {
      method: 'DELETE',
    })
    if (response.error) {
      throw new Error(response.error)
    }
  }

  async startWorkspace(id: string): Promise<Workspace> {
    const response = await this.fetch<WorkspaceResponse>(`/workspaces/${id}/start`, {
      method: 'POST',
    })
    if (response.error) {
      throw new Error(response.error)
    }
    return response.data
  }

  async stopWorkspace(id: string): Promise<Workspace> {
    const response = await this.fetch<WorkspaceResponse>(`/workspaces/${id}/stop`, {
      method: 'POST',
    })
    if (response.error) {
      throw new Error(response.error)
    }
    return response.data
  }

  async getEvents(id: string, limit = 50): Promise<WorkspaceEvent[]> {
    const response = await this.fetch<EventListResponse>(`/workspaces/${id}/events?limit=${limit}`)
    if (response.error) {
      throw new Error(response.error)
    }
    return response.data
  }
}

// Singleton instance
let clientInstance: HTTPWorkspaceClient | null = null

export function getWorkspaceClient(): HTTPWorkspaceClient {
  if (!clientInstance) {
    clientInstance = new HTTPWorkspaceClient()
  }
  return clientInstance
}

// Reset the singleton instance (used when URL changes)
export function resetWorkspaceClient(): void {
  clientInstance = null
}

// Export for testing or custom configuration
export function createWorkspaceClient(baseUrl?: string): HTTPWorkspaceClient {
  return new HTTPWorkspaceClient(baseUrl)
}
