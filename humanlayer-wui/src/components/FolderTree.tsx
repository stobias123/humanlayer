import React, { useState, type ReactNode } from 'react'
import { useStore } from '@/AppStore'
import {
  ChevronRight,
  Folder as FolderIcon,
  MoreHorizontal,
  Pencil,
  FolderInput,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Folder } from '@/lib/daemon/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface FolderNode extends Folder {
  children: FolderNode[]
}

interface FolderTreeProps {
  folders: FolderNode[]
  currentFolderId: string | null
  focusedFolderId: string | null
  onSelect: (id: string | null) => void
  onFocus: (id: string | null) => void
  onRename: (folder: FolderNode) => void
  onMove: (folder: FolderNode) => void
  onDelete: (folder: FolderNode) => void
  depth?: number
}

export function FolderTree({
  folders,
  currentFolderId,
  focusedFolderId,
  onSelect,
  onFocus,
  onRename,
  onMove,
  onDelete,
  depth = 0,
}: FolderTreeProps) {
  const { expandedFolders, toggleFolderExpanded, activePane } = useStore()

  return (
    <div className="space-y-0.5">
      {folders.map(folder => (
        <FolderItem
          key={folder.id}
          folder={folder}
          depth={depth}
          isExpanded={expandedFolders.has(folder.id)}
          isSelected={currentFolderId === folder.id}
          isFocused={focusedFolderId === folder.id}
          activePane={activePane}
          onSelect={() => onSelect(folder.id)}
          onFocus={() => onFocus(folder.id)}
          onToggle={() => toggleFolderExpanded(folder.id)}
          onRename={() => onRename(folder)}
          onMove={() => onMove(folder)}
          onDelete={() => onDelete(folder)}
        >
          {folder.children.length > 0 && expandedFolders.has(folder.id) && (
            <FolderTree
              folders={folder.children}
              currentFolderId={currentFolderId}
              focusedFolderId={focusedFolderId}
              onSelect={onSelect}
              onFocus={onFocus}
              onRename={onRename}
              onMove={onMove}
              onDelete={onDelete}
              depth={depth + 1}
            />
          )}
        </FolderItem>
      ))}
    </div>
  )
}

interface FolderItemProps {
  folder: FolderNode
  depth: number
  isExpanded: boolean
  isSelected: boolean
  isFocused: boolean
  activePane: 'main' | 'sidebar'
  onSelect: () => void
  onFocus: () => void
  onToggle: () => void
  onRename: () => void
  onMove: () => void
  onDelete: () => void
  children?: ReactNode
}

function FolderItem({
  folder,
  depth,
  isExpanded,
  isSelected,
  isFocused,
  activePane,
  onSelect,
  onFocus,
  onToggle,
  onRename,
  onMove,
  onDelete,
  children,
}: FolderItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuOpen(true)
  }

  return (
    <div>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <div
          className="relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <button
            className={cn(
              'w-full text-left px-2 py-1 pr-6 rounded text-sm flex items-center gap-1',
              isSelected && 'bg-accent/20',
              isFocused && activePane === 'sidebar' && 'ring-1 ring-accent',
            )}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={onSelect}
            onMouseEnter={onFocus}
            onDoubleClick={onToggle}
            onContextMenu={handleContextMenu}
          >
            {folder.children.length > 0 ? (
              <ChevronRight
                className={cn('w-3 h-3 transition-transform flex-shrink-0', isExpanded && 'rotate-90')}
                onClick={e => {
                  e.stopPropagation()
                  onToggle()
                }}
              />
            ) : (
              <span className="w-3" />
            )}
            <FolderIcon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate flex-1">{folder.name}</span>
            {(folder.sessionCount ?? 0) > 0 && (
              <span className="text-xs text-muted-foreground flex-shrink-0">{folder.sessionCount}</span>
            )}
          </button>

          {/* Overflow menu button - visible on hover */}
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent/30 transition-opacity',
                isHovered || menuOpen ? 'opacity-100' : 'opacity-0',
              )}
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
        </div>

        <DropdownMenuContent align="start" sideOffset={5}>
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="w-4 h-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onMove}>
            <FolderInput className="w-4 h-4" />
            Move to...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {children}
    </div>
  )
}
