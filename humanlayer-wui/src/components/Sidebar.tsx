import { useState } from 'react'
import { useStore } from '@/AppStore'
import { FolderTree, type FolderNode } from './FolderTree'
import { Button } from './ui/button'
import { Plus, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Folder } from '@/lib/daemon/types'
import { CreateFolderDialog } from '@/components/CreateFolderDialog'
import { RenameFolderDialog } from '@/components/RenameFolderDialog'
import { MoveFolderDialog } from '@/components/MoveFolderDialog'
import { DeleteFolderConfirmDialog } from '@/components/DeleteFolderConfirmDialog'

export function Sidebar() {
  const {
    folders,
    currentFolderId,
    focusedFolderId,
    activePane,
    setCurrentFolderId,
    setFocusedFolderId,
    createFolder,
    updateFolder,
    deleteFolder,
  } = useStore()

  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false)
  const [renameFolderDialogOpen, setRenameFolderDialogOpen] = useState(false)
  const [moveFolderDialogOpen, setMoveFolderDialogOpen] = useState(false)
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<FolderNode | null>(null)

  // Build tree structure from flat folders
  const folderTree = buildFolderTree(folders)

  // Handle folder selection
  const handleSelectFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId)
  }

  // Handle new folder
  const handleNewFolder = () => {
    setCreateFolderDialogOpen(true)
  }

  const handleCreateFolderConfirm = async (name: string) => {
    await createFolder(name, focusedFolderId ?? undefined)
  }

  // Get parent folder name for dialog description
  const parentFolderName = focusedFolderId
    ? folders.find(f => f.id === focusedFolderId)?.name
    : undefined

  // Context menu handlers
  const handleRenameFolder = (folder: FolderNode) => {
    setSelectedFolder(folder)
    setRenameFolderDialogOpen(true)
  }

  const handleMoveFolder = (folder: FolderNode) => {
    setSelectedFolder(folder)
    setMoveFolderDialogOpen(true)
  }

  const handleDeleteFolder = (folder: FolderNode) => {
    setSelectedFolder(folder)
    setDeleteFolderDialogOpen(true)
  }

  const handleRenameConfirm = async (newName: string) => {
    if (selectedFolder) {
      await updateFolder(selectedFolder.id, { name: newName })
    }
  }

  const handleMoveConfirm = async (newParentId: string | null) => {
    if (selectedFolder) {
      await updateFolder(selectedFolder.id, { parentId: newParentId ?? '' })
    }
  }

  const handleDeleteConfirm = async () => {
    if (selectedFolder) {
      await deleteFolder(selectedFolder.id)
      // Clear selection if deleted folder was selected
      if (currentFolderId === selectedFolder.id) {
        setCurrentFolderId(null)
      }
    }
  }

  return (
    <div
      className={cn(
        'w-56 border-r flex flex-col h-full bg-background',
        activePane === 'sidebar' && 'border-l-2 border-l-[var(--terminal-accent)]',
      )}
    >
      <div className="flex-1 overflow-y-auto p-2">
        {/* All Sessions */}
        <button
          className={cn(
            'w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2',
            currentFolderId === null && 'bg-accent/20',
            focusedFolderId === null && activePane === 'sidebar' && 'ring-1 ring-accent',
          )}
          onClick={() => handleSelectFolder(null)}
          onFocus={() => setFocusedFolderId(null)}
        >
          <FolderOpen className="w-4 h-4" />
          All Sessions
        </button>

        {/* Folder Tree */}
        {folderTree.length > 0 && (
          <div className="mt-2">
            <FolderTree
              folders={folderTree}
              currentFolderId={currentFolderId}
              focusedFolderId={focusedFolderId}
              onSelect={handleSelectFolder}
              onFocus={setFocusedFolderId}
              onRename={handleRenameFolder}
              onMove={handleMoveFolder}
              onDelete={handleDeleteFolder}
            />
          </div>
        )}
      </div>

      {/* New Folder Button */}
      <div className="p-2 border-t">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleNewFolder}>
          <Plus className="w-4 h-4 mr-2" />
          New Folder
        </Button>
      </div>

      {/* Dialogs */}
      <CreateFolderDialog
        open={createFolderDialogOpen}
        onOpenChange={setCreateFolderDialogOpen}
        onConfirm={handleCreateFolderConfirm}
        parentFolderName={parentFolderName}
      />

      <RenameFolderDialog
        open={renameFolderDialogOpen}
        onOpenChange={setRenameFolderDialogOpen}
        folder={selectedFolder}
        onConfirm={handleRenameConfirm}
      />

      <MoveFolderDialog
        open={moveFolderDialogOpen}
        onOpenChange={setMoveFolderDialogOpen}
        folder={selectedFolder}
        allFolders={folders}
        onMove={handleMoveConfirm}
      />

      <DeleteFolderConfirmDialog
        open={deleteFolderDialogOpen}
        onOpenChange={setDeleteFolderDialogOpen}
        folder={selectedFolder}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}

function buildFolderTree(folders: Folder[]): FolderNode[] {
  const map = new Map<string, FolderNode>()
  const roots: FolderNode[] = []

  // Create nodes
  for (const f of folders) {
    map.set(f.id, { ...f, children: [] })
  }

  // Build tree
  for (const f of folders) {
    const node = map.get(f.id)!
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // Sort by position then name
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)

  return roots
}
