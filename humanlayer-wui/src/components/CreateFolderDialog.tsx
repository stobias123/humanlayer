import { useState, useRef, useEffect } from 'react'
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
import { useHotkeys } from 'react-hotkeys-hook'
import { HotkeyScopeBoundary } from '@/components/HotkeyScopeBoundary'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'

interface CreateFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string) => void
  parentFolderName?: string
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  onConfirm,
  parentFolderName,
}: CreateFolderDialogProps) {
  const [folderName, setFolderName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isMac = navigator.platform.includes('Mac')

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setFolderName('')
      // Focus input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleConfirm = () => {
    const trimmed = folderName.trim()
    if (trimmed) {
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
      if (open && folderName.trim()) {
        handleConfirm()
      }
    },
    { enabled: open, enableOnFormTags: true, scopes: [HOTKEY_SCOPES.CREATE_FOLDER_DIALOG] },
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
      scopes: [HOTKEY_SCOPES.CREATE_FOLDER_DIALOG],
    },
  )

  return (
    <HotkeyScopeBoundary
      scope={HOTKEY_SCOPES.CREATE_FOLDER_DIALOG}
      isActive={open}
      rootScopeDisabled={true}
      componentName="CreateFolderDialog"
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onEscapeKeyDown={e => e.preventDefault()} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            {parentFolderName && (
              <DialogDescription>Creating inside: {parentFolderName}</DialogDescription>
            )}
          </DialogHeader>
          <div className="py-4">
            <Input
              ref={inputRef}
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && folderName.trim()) {
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
            <Button variant="default" onClick={handleConfirm} disabled={!folderName.trim()}>
              Create
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
