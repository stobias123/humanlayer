/**
 * Workspace list component displaying all workspaces with status and actions
 */

import { useEffect, useState, useCallback } from 'react'
import { useShallow } from 'zustand/shallow'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Workspace, WorkspaceStatus } from '@/lib/workspace/types'
import { Plus, Play, Square, Trash2, MoreVertical, RefreshCw, Loader2 } from 'lucide-react'

interface WorkspaceListProps {
  onCreateClick?: () => void
  onSelectWorkspace?: (workspace: Workspace) => void
}

const STATUS_COLORS: Record<WorkspaceStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/50',
  running: 'bg-green-500/20 text-green-600 border-green-500/50',
  stopped: 'bg-gray-500/20 text-gray-500 border-gray-500/50',
  error: 'bg-red-500/20 text-red-600 border-red-500/50',
}

const STATUS_LABELS: Record<WorkspaceStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  stopped: 'Stopped',
  error: 'Error',
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function WorkspaceStatusBadge({ status }: { status: WorkspaceStatus }) {
  return (
    <Badge variant="outline" className={`${STATUS_COLORS[status]} font-medium`}>
      {status === 'pending' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function WorkspaceActions({
  workspace,
  onStart,
  onStop,
  onDelete,
}: {
  workspace: Workspace
  onStart: () => void
  onStop: () => void
  onDelete: () => void
}) {
  const canStart = workspace.status === 'stopped' || workspace.status === 'error'
  const canStop = workspace.status === 'running'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canStart && (
          <DropdownMenuItem onClick={onStart}>
            <Play className="mr-2 h-4 w-4" />
            Start
          </DropdownMenuItem>
        )}
        {canStop && (
          <DropdownMenuItem onClick={onStop}>
            <Square className="mr-2 h-4 w-4" />
            Stop
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WorkspaceTableRow({
  workspace,
  onSelect,
}: {
  workspace: Workspace
  onSelect?: () => void
}) {
  const { startWorkspace, stopWorkspace, deleteWorkspace } = useWorkspaceStore()

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={onSelect}
    >
      <TableCell className="font-medium">{workspace.name}</TableCell>
      <TableCell>
        <WorkspaceStatusBadge status={workspace.status} />
      </TableCell>
      <TableCell className="font-mono text-sm text-muted-foreground">
        {workspace.docker_image}:{workspace.docker_image_tag}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(workspace.created_at)}
      </TableCell>
      <TableCell onClick={e => e.stopPropagation()}>
        <WorkspaceActions
          workspace={workspace}
          onStart={() => startWorkspace(workspace.id)}
          onStop={() => stopWorkspace(workspace.id)}
          onDelete={() => deleteWorkspace(workspace.id)}
        />
      </TableCell>
    </TableRow>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center space-x-4 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onCreateClick }: { onCreateClick?: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center p-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Plus className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
      <p className="text-muted-foreground mb-4 max-w-sm">
        Create your first workspace to get started with an isolated HLD environment.
      </p>
      {onCreateClick && (
        <Button onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          Create Workspace
        </Button>
      )}
    </Card>
  )
}

export function WorkspaceList({ onCreateClick, onSelectWorkspace }: WorkspaceListProps) {
  const { workspaces, isLoading, error } = useWorkspaceStore(
    useShallow(state => ({
      workspaces: state.workspaces,
      isLoading: state.isLoading,
      error: state.error,
    }))
  )
  const fetchWorkspaces = useWorkspaceStore(state => state.fetchWorkspaces)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Stable reference to avoid re-creating interval
  const silentFetch = useCallback(() => {
    fetchWorkspaces(true)
  }, [fetchWorkspaces])

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchWorkspaces() // Initial fetch with loading state

    const interval = setInterval(silentFetch, 10000) // Silent refresh every 10 seconds

    return () => clearInterval(interval)
  }, [fetchWorkspaces, silentFetch])

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await fetchWorkspaces()
    setIsRefreshing(false)
  }

  if (isLoading && workspaces.length === 0) {
    return <LoadingSkeleton />
  }

  if (error && workspaces.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <Trash2 className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Failed to load workspaces</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={handleManualRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </Card>
    )
  }

  if (workspaces.length === 0) {
    return <EmptyState onCreateClick={onCreateClick} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workspaces</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workspaces.map(workspace => (
              <WorkspaceTableRow
                key={workspace.id}
                workspace={workspace}
                onSelect={() => onSelectWorkspace?.(workspace)}
              />
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default WorkspaceList
