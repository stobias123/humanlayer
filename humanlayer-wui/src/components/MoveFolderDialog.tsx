import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Folder as FolderIcon, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HotkeyScopeBoundary } from '@/components/HotkeyScopeBoundary'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'
import { useHotkeys } from 'react-hotkeys-hook'
import type { Folder } from '@/lib/daemon/types'

const MAX_FOLDER_DEPTH = 3

interface MoveFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: Folder | null
  allFolders: Folder[]
  onMove: (newParentId: string | null) => void
}

export function MoveFolderDialog({
  open,
  onOpenChange,
  folder,
  allFolders,
  onMove,
}: MoveFolderDialogProps) {
  const [searchValue, setSearchValue] = useState('')

  useEffect(() => {
    if (open) {
      setSearchValue('')
    }
  }, [open])

  // Get all descendant IDs of the folder being moved
  const descendantIds = useMemo(() => {
    if (!folder) return new Set<string>()

    const ids = new Set<string>([folder.id])
    let changed = true

    while (changed) {
      changed = false
      for (const f of allFolders) {
        if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
          ids.add(f.id)
          changed = true
        }
      }
    }

    return ids
  }, [folder, allFolders])

  // Calculate subtree depth of the folder being moved
  const subtreeDepth = useMemo(() => {
    if (!folder) return 0

    const getMaxChildDepth = (parentId: string, depth: number): number => {
      const children = allFolders.filter(f => f.parentId === parentId)
      if (children.length === 0) return depth
      return Math.max(...children.map(c => getMaxChildDepth(c.id, depth + 1)))
    }

    return getMaxChildDepth(folder.id, 0)
  }, [folder, allFolders])

  // Build folder options excluding the folder and its descendants
  const folderOptions = useMemo(() => {
    const getDepth = (f: Folder): number => {
      let depth = 1
      let current = f
      while (current.parentId) {
        depth++
        const parent = allFolders.find(p => p.id === current.parentId)
        if (!parent) break
        current = parent
      }
      return depth
    }

    const buildOptions = (
      parentId: string | null,
      depth: number,
    ): Array<{ id: string | null; name: string; depth: number; wouldExceedDepth: boolean }> => {
      const children = allFolders.filter(f => {
        const folderParentId = f.parentId ?? null
        return folderParentId === parentId && !f.archived && !descendantIds.has(f.id)
      })
      const result: Array<{
        id: string | null
        name: string
        depth: number
        wouldExceedDepth: boolean
      }> = []

      for (const f of children) {
        const targetDepth = getDepth(f)
        // If we move under this folder, new depth = targetDepth + 1 + subtreeDepth
        const wouldExceedDepth = targetDepth + 1 + subtreeDepth > MAX_FOLDER_DEPTH

        result.push({ id: f.id, name: f.name, depth, wouldExceedDepth })
        result.push(...buildOptions(f.id, depth + 1))
      }
      return result
    }

    // "Move to root" option
    const rootOption = {
      id: null,
      name: 'Move to root level',
      depth: 0,
      wouldExceedDepth: 1 + subtreeDepth > MAX_FOLDER_DEPTH,
    }

    return [rootOption, ...buildOptions(null, 0)]
  }, [allFolders, descendantIds, subtreeDepth])

  const handleSelect = (parentId: string | null) => {
    const option = folderOptions.find(o => o.id === parentId)
    if (option?.wouldExceedDepth) return // Don't allow selection if would exceed depth

    onMove(parentId)
    onOpenChange(false)
  }

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
      scopes: [HOTKEY_SCOPES.MOVE_FOLDER_DIALOG],
    },
  )

  if (!folder) return null

  return (
    <HotkeyScopeBoundary
      scope={HOTKEY_SCOPES.MOVE_FOLDER_DIALOG}
      isActive={open}
      rootScopeDisabled={true}
      componentName="MoveFolderDialog"
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="p-0 max-w-md overflow-hidden"
          onEscapeKeyDown={e => e.preventDefault()}
        >
          <Command className="rounded-lg border-0" loop>
            <CommandInput
              placeholder={`Move "${folder.name}" to...`}
              value={searchValue}
              onValueChange={setSearchValue}
              autoFocus
              className="border-0 border-b font-mono text-sm"
            />
            <CommandList className="max-h-[300px]">
              <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                No valid destinations found
              </CommandEmpty>
              <CommandGroup>
                {folderOptions.map(option => (
                  <CommandItem
                    key={option.id ?? 'root'}
                    value={option.name}
                    onSelect={() => handleSelect(option.id)}
                    disabled={option.wouldExceedDepth}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 cursor-pointer',
                      'data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground',
                      option.wouldExceedDepth && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {option.id === null ? (
                      <X className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FolderIcon className="h-4 w-4" style={{ marginLeft: option.depth * 16 }} />
                    )}
                    <span className={cn(option.id === null && 'text-muted-foreground italic')}>
                      {option.name}
                    </span>
                    {option.wouldExceedDepth && (
                      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                        <AlertTriangle className="h-3 w-3" />
                        Too deep
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="flex items-center justify-between text-xs text-muted-foreground p-2 border-t bg-muted/30">
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
