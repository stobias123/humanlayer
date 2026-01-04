/**
 * Workspace detail page - shows full workspace information with actions
 */

import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Server,
  Clock,
  Cpu,
  HardDrive,
  GitBranch,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceStatus } from '@/lib/workspace/types'

const statusColors: Record<WorkspaceStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50',
  running: 'bg-green-500/20 text-green-500 border-green-500/50',
  stopped: 'bg-gray-500/20 text-gray-500 border-gray-500/50',
  error: 'bg-red-500/20 text-red-500 border-red-500/50',
}

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    selectedWorkspace,
    selectedWorkspaceEvents,
    selectWorkspace,
    startWorkspace,
    stopWorkspace,
    deleteWorkspace,
    refreshWorkspace,
    isLoading,
  } = useWorkspaceStore()

  useEffect(() => {
    if (id) {
      selectWorkspace(id)
    }
    return () => {
      selectWorkspace(null)
    }
  }, [id, selectWorkspace])

  if (isLoading && !selectedWorkspace) {
    return <LoadingSkeleton />
  }

  if (!selectedWorkspace) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Workspace not found</p>
          <Button variant="outline" onClick={() => navigate('/workspaces')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Workspaces
          </Button>
        </div>
      </div>
    )
  }

  const ws = selectedWorkspace

  const handleDelete = async () => {
    await deleteWorkspace(ws.id)
    navigate('/workspaces')
  }

  const handleRefresh = async () => {
    if (id) {
      await refreshWorkspace(id)
    }
  }

  const canStart = ws.status === 'stopped' || ws.status === 'error'
  const canStop = ws.status === 'running'
  const isPending = ws.status === 'pending'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/workspaces')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{ws.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">{ws.id}</p>
          </div>
          <Badge className={cn('ml-2', statusColors[ws.status])}>
            {isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {ws.status}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canStart && (
            <Button onClick={() => startWorkspace(ws.id)}>
              <Play className="h-4 w-4 mr-2" />
              Start
            </Button>
          )}
          {canStop && (
            <Button variant="secondary" onClick={() => stopWorkspace(ws.id)}>
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          )}
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deployment Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              Deployment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Namespace</dt>
                <dd className="font-mono">{ws.namespace}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Helm Release</dt>
                <dd className="font-mono">{ws.helm_release_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Image</dt>
                <dd className="font-mono text-xs">
                  {ws.docker_image}:{ws.docker_image_tag}
                </dd>
              </div>
              {ws.ingress_host && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ingress</dt>
                  <dd className="font-mono text-xs">{ws.ingress_host}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Resources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4" />
              Resources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">CPU Request/Limit</dt>
                <dd className="font-mono">
                  {ws.cpu_request} / {ws.cpu_limit}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Memory Request/Limit</dt>
                <dd className="font-mono">
                  {ws.memory_request} / {ws.memory_limit}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Data Volume</dt>
                <dd className="font-mono">{ws.data_size}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Source Volume</dt>
                <dd className="font-mono">{ws.src_size}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Pod Status (if available) */}
        {ws.deployment_status && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4 w-4" />
                Pod Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Phase</dt>
                  <dd>{ws.deployment_status.phase}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ready</dt>
                  <dd>{ws.deployment_status.ready ? 'Yes' : 'No'}</dd>
                </div>
                {ws.deployment_status.pod_ip && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Pod IP</dt>
                    <dd className="font-mono">{ws.deployment_status.pod_ip}</dd>
                  </div>
                )}
                {ws.deployment_status.node_name && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Node</dt>
                    <dd className="font-mono text-xs">{ws.deployment_status.node_name}</dd>
                  </div>
                )}
                {ws.deployment_status.message && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Message</dt>
                    <dd className="text-xs">{ws.deployment_status.message}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Git Config */}
        {ws.git_enabled && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranch className="h-4 w-4" />
                Git Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">User Name</dt>
                  <dd>{ws.git_user_name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">User Email</dt>
                  <dd className="text-xs">{ws.git_user_email}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedWorkspaceEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded</p>
          ) : (
            <div className="space-y-2">
              {selectedWorkspaceEvents.map(event => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 text-sm border-b pb-2 last:border-0"
                >
                  <Badge variant="outline" className="shrink-0">
                    {event.event_type}
                  </Badge>
                  <span className="flex-1">{event.message}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default WorkspaceDetailPage
