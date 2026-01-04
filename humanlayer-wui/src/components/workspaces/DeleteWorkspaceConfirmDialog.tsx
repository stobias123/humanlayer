/**
 * Confirmation dialog for deleting a workspace
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { Workspace } from '@/lib/workspace/types'

interface DeleteWorkspaceConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace: Workspace | null
  onConfirm: () => Promise<void>
}

export function DeleteWorkspaceConfirmDialog({
  open,
  onOpenChange,
  workspace,
  onConfirm,
}: DeleteWorkspaceConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    if (!workspace || confirmText !== workspace.name) return

    setIsDeleting(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
      setConfirmText('')
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setConfirmText('')
    }
    onOpenChange(open)
  }

  if (!workspace) return null

  const isConfirmEnabled = confirmText === workspace.name

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Workspace
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the workspace
            and all associated data.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="rounded-md bg-destructive/10 p-4">
            <p className="text-sm">
              <strong>Workspace:</strong> {workspace.name}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              <strong>ID:</strong> {workspace.id}
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Namespace:</strong> {workspace.namespace}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Please type <strong>{workspace.name}</strong> to confirm deletion:
            </p>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Type workspace name to confirm"
              className="font-mono"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isConfirmEnabled || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Workspace'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteWorkspaceConfirmDialog
