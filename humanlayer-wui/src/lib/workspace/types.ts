/**
 * Workspace types matching the workspace-daemon OpenAPI spec
 */

export type WorkspaceStatus = 'pending' | 'running' | 'stopped' | 'error'

export interface DeploymentStatus {
  phase: string
  ready: boolean
  message?: string
  pod_ip?: string
  node_name?: string
  start_time?: string
}

export interface Workspace {
  id: string
  name: string
  status: WorkspaceStatus
  docker_image: string
  docker_image_tag: string
  helm_release_name: string
  namespace: string
  ingress_host?: string
  cpu_request?: string
  memory_request?: string
  cpu_limit?: string
  memory_limit?: string
  data_size?: string
  src_size?: string
  git_enabled: boolean
  git_user_name?: string
  git_user_email?: string
  created_at: string
  updated_at: string
  deployment_status?: DeploymentStatus
}

export interface WorkspaceEvent {
  id: number
  workspace_id: string
  event_type: string
  message?: string
  metadata?: string
  created_at: string
}

export interface CreateWorkspaceRequest {
  name: string
  docker_image?: string
  docker_image_tag?: string
  cpu_request?: string
  memory_request?: string
  cpu_limit?: string
  memory_limit?: string
  data_size?: string
  src_size?: string
  git_user_name?: string
  git_user_email?: string
  secrets?: Record<string, string>
}

// API Response types
export interface WorkspaceResponse {
  data: Workspace
  error: string | null
}

export interface WorkspaceListResponse {
  data: Workspace[]
  error: string | null
}

export interface EventListResponse {
  data: WorkspaceEvent[]
  error: string | null
}

export interface MessageResponse {
  message: string
  error: string | null
}

export interface ErrorResponse {
  data: null
  error: string
}

export interface HealthResponse {
  status: string
  version: string
}

/**
 * Client interface for workspace daemon
 */
export interface WorkspaceClient {
  health(): Promise<HealthResponse>
  listWorkspaces(): Promise<Workspace[]>
  getWorkspace(id: string): Promise<Workspace>
  createWorkspace(request: CreateWorkspaceRequest): Promise<Workspace>
  deleteWorkspace(id: string): Promise<void>
  startWorkspace(id: string): Promise<Workspace>
  stopWorkspace(id: string): Promise<Workspace>
  getEvents(id: string, limit?: number): Promise<WorkspaceEvent[]>
}
