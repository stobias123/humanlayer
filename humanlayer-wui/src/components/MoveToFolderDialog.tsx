import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { useHotkeys } from 'react-hotkeys-hook'
import { HotkeyScopeBoundary } from '@/components/HotkeyScopeBoundary'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'
import { useStore } from '@/AppStore'
import { Folder, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MoveToFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionIds: string[]
  onMove: (folderId: string | null) => void
}

export function MoveToFolderDialog({
  open,
  onOpenChange,
  sessionIds,
  onMove,
}: MoveToFolderDialogProps) {
  const [searchValue, setSearchValue] = useState('')
  const folders = useStore(state => state.folders)

  // Reset search when dialog opens
  useEffect(() => {
    if (open) {
      setSearchValue('')
    }
  }, [open])

  const handleSelect = (folderId: string | null) => {
    onMove(folderId)
    onOpenChange(false)
  }

  // Build folder options with hierarchy indication
  const folderOptions = useMemo(() => {
    const buildOptions = (
      parentId: string | null,
      depth: number,
    ): Array<{ id: string | null; name: string; depth: number }> => {
      // Note: SDK converts null parent_id to undefined, so we use nullish coalescing
      // to normalize undefined to null for comparison
      const children = folders.filter(f => (f.parentId ?? null) === parentId && !f.archived)
      const result: Array<{ id: string | null; name: string; depth: number }> = []

      for (const folder of children) {
        result.push({ id: folder.id, name: folder.name, depth })
        result.push(...buildOptions(folder.id, depth + 1))
      }
      return result
    }

    return [{ id: null, name: 'Remove from folder', depth: 0 }, ...buildOptions(null, 0)]
  }, [folders])

  // Escape to close
  useHotkeys(
    'escape',
    ev => {
      ev.preventDefault()
      ev.stopPropagation()
      onOpenChange(false)
    },
    {
      enabled: open,
      enableOnFormTags: true,
      preventDefault: true,
      scopes: [HOTKEY_SCOPES.MOVE_TO_FOLDER_DIALOG],
    },
  )

  const sessionCount = sessionIds.length
  const sessionText = sessionCount === 1 ? 'session' : `${sessionCount} sessions`

  return (
    <HotkeyScopeBoundary
      scope={HOTKEY_SCOPES.MOVE_TO_FOLDER_DIALOG}
      isActive={open}
      rootScopeDisabled={true}
      componentName="MoveToFolderDialog"
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="p-0 max-w-md overflow-hidden"
          onEscapeKeyDown={e => e.preventDefault()}
        >
          <Command className="rounded-lg border-0" loop>
            <CommandInput
              placeholder={`Move ${sessionText} to folder...`}
              value={searchValue}
              onValueChange={setSearchValue}
              autoFocus
              className="border-0 border-b font-mono text-sm"
            />
            <CommandList className="max-h-[300px]">
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                No folders found
              </CommandEmpty>
              <CommandGroup>
                {folderOptions.map(option => (
                  <CommandItem
                    key={option.id ?? 'remove'}
                    value={option.name}
                    onSelect={() => handleSelect(option.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 cursor-pointer',
                      'data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground',
                    )}
                  >
                    {option.id === null ? (
                      <X className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Folder className="h-4 w-4" style={{ marginLeft: option.depth * 16 }} />
                    )}
                    <span className={cn(option.id === null && 'text-muted-foreground italic')}>
                      {option.name}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="flex items-center justify-between text-xs text-muted-foreground p-2 border-t">
              <div className="flex items-center space-x-3">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
              </div>
              <span>ESC Close</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </HotkeyScopeBoundary>
  )
}
