import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useHotkeys } from 'react-hotkeys-hook'
import { HotkeyScopeBoundary } from '@/components/HotkeyScopeBoundary'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'
import { AlertTriangle } from 'lucide-react'
import type { Folder } from '@/lib/daemon/types'
import { useStore } from '@/AppStore'

interface DeleteFolderConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: Folder | null
  onConfirm: () => void
}

export function DeleteFolderConfirmDialog({
  open,
  onOpenChange,
  folder,
  onConfirm,
}: DeleteFolderConfirmDialogProps) {
  const folders = useStore(state => state.folders)
  const isMac = navigator.platform.includes('Mac')

  // Count child folders
  const childFolderCount = useMemo(() => {
    if (!folder) return 0

    const countChildren = (parentId: string): number => {
      const children = folders.filter(f => f.parentId === parentId && !f.archived)
      return children.length + children.reduce((sum, c) => sum + countChildren(c.id), 0)
    }

    return countChildren(folder.id)
  }, [folder, folders])

  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  // Cmd+Enter to confirm
  useHotkeys(
    'mod+enter',
    () => {
      if (open) {
        handleConfirm()
      }
    },
    { enabled: open, enableOnFormTags: true, scopes: [HOTKEY_SCOPES.DELETE_FOLDER_DIALOG] },
  )

  // Escape to cancel
  useHotkeys(
    'escape',
    ev => {
      ev.preventDefault()
      ev.stopPropagation()
      handleCancel()
    },
    {
      enabled: open,
      enableOnFormTags: true,
      preventDefault: true,
      scopes: [HOTKEY_SCOPES.DELETE_FOLDER_DIALOG],
    },
  )

  if (!folder) return null

  const sessionCount = folder.sessionCount ?? 0
  const hasContents = sessionCount > 0 || childFolderCount > 0

  return (
    <HotkeyScopeBoundary
      scope={HOTKEY_SCOPES.DELETE_FOLDER_DIALOG}
      isActive={open}
      rootScopeDisabled={true}
      componentName="DeleteFolderConfirmDialog"
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onEscapeKeyDown={e => e.preventDefault()} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {hasContents && <AlertTriangle className="h-5 w-5 text-[var(--terminal-warning)]" />}
              Delete "{folder.name}"?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2">
                {hasContents ? (
                  <>
                    <p>This folder contains:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {sessionCount > 0 && (
                        <li>
                          {sessionCount} session{sessionCount > 1 ? 's' : ''}
                        </li>
                      )}
                      {childFolderCount > 0 && (
                        <li>
                          {childFolderCount} subfolder{childFolderCount > 1 ? 's' : ''}
                        </li>
                      )}
                    </ul>
                    <p className="text-sm">
                      Deleting will archive this folder and all{' '}
                      {sessionCount > 0 ? 'sessions' : 'contents'} within it.
                      {childFolderCount > 0 && ' Subfolders will become orphaned.'}
                    </p>
                  </>
                ) : (
                  <p>This empty folder will be archived.</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
              <kbd className="ml-2 px-1 py-0.5 text-xs bg-muted/50 rounded">Esc</kbd>
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              Delete
              <kbd className="ml-2 px-1 py-0.5 text-xs bg-muted/50 rounded">
                {isMac ? '⌘' : 'Ctrl'}+Enter
              </kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HotkeyScopeBoundary>
  )
}
