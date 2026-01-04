/**
 * Workspaces page - lists all workspaces with create/manage actions
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { WorkspaceList } from '@/components/workspaces/WorkspaceList'
import { CreateWorkspaceWizard } from '@/components/workspaces/CreateWorkspaceWizard'
import { DeleteWorkspaceConfirmDialog } from '@/components/workspaces/DeleteWorkspaceConfirmDialog'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Workspace } from '@/lib/workspace/types'
import { ChevronLeft, Plus, Server } from 'lucide-react'

export function WorkspacesPage() {
  const navigate = useNavigate()
  const { deleteWorkspace } = useWorkspaceStore()
  const [showWizard, setShowWizard] = useState(false)
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null)

  const handleWorkspaceCreated = (workspace: Workspace) => {
    // Optionally navigate to workspace detail or just refresh list
    console.log('Workspace created:', workspace.id)
  }

  const handleSelectWorkspace = (workspace: Workspace) => {
    // For now, just log - could navigate to workspace detail view
    console.log('Selected workspace:', workspace.id)
  }

  const handleDeleteConfirm = async () => {
    if (workspaceToDelete) {
      await deleteWorkspace(workspaceToDelete.id)
      setWorkspaceToDelete(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Workspaces</h1>
          </div>
        </div>
        <Button onClick={() => setShowWizard(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Workspace
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <WorkspaceList
          onCreateClick={() => setShowWizard(true)}
          onSelectWorkspace={handleSelectWorkspace}
        />
      </div>

      {/* Dialogs */}
      <CreateWorkspaceWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        onCreated={handleWorkspaceCreated}
      />

      <DeleteWorkspaceConfirmDialog
        open={!!workspaceToDelete}
        onOpenChange={open => !open && setWorkspaceToDelete(null)}
        workspace={workspaceToDelete}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}

export default WorkspacesPage
