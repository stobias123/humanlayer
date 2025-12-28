import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useHotkeys } from 'react-hotkeys-hook'
import { HotkeyScopeBoundary } from '@/components/HotkeyScopeBoundary'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'
import type { Folder } from '@/lib/daemon/types'

interface RenameFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: Folder | null
  onConfirm: (newName: string) => void
}

export function RenameFolderDialog({ open, onOpenChange, folder, onConfirm }: RenameFolderDialogProps) {
  const [folderName, setFolderName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isMac = navigator.platform.includes('Mac')

  // Initialize with current name when dialog opens
  useEffect(() => {
    if (open && folder) {
      setFolderName(folder.name)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [open, folder])

  const handleConfirm = () => {
    const trimmed = folderName.trim()
    if (trimmed && trimmed !== folder?.name) {
      onConfirm(trimmed)
      onOpenChange(false)
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  // Cmd+Enter to confirm
  useHotkeys(
    'mod+enter',
    () => {
      if (open && folderName.trim() && folderName.trim() !== folder?.name) {
        handleConfirm()
      }
    },
    { enabled: open, enableOnFormTags: true, scopes: [HOTKEY_SCOPES.RENAME_FOLDER_DIALOG] },
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
      scopes: [HOTKEY_SCOPES.RENAME_FOLDER_DIALOG],
    },
  )

  const isUnchanged = folderName.trim() === folder?.name
  const isEmpty = !folderName.trim()

  return (
    <HotkeyScopeBoundary
      scope={HOTKEY_SCOPES.RENAME_FOLDER_DIALOG}
      isActive={open}
      rootScopeDisabled={true}
      componentName="RenameFolderDialog"
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onEscapeKeyDown={e => e.preventDefault()} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              ref={inputRef}
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !isEmpty && !isUnchanged) {
                  e.preventDefault()
                  handleConfirm()
                }
              }}
              placeholder="Folder name"
              className="font-mono"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
              <kbd className="ml-2 px-1 py-0.5 text-xs bg-muted/50 rounded">Esc</kbd>
            </Button>
            <Button variant="default" onClick={handleConfirm} disabled={isEmpty || isUnchanged}>
              Rename
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
